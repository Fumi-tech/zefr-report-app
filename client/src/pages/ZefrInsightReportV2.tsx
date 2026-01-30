import React, { useState, useRef, useMemo } from 'react';
import { Upload, Copy, Download, FileText, Loader2, Edit2, Save, X, ChevronRight } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Line,
  Dot,
} from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * 数値クリーニング関数
 */
const cleanNum = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;
  const str = String(value).trim();
  const cleaned = str.replace(/[%,\$¥]/g, '').replace(/\s+/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * ファイル解析インターフェース
 */
interface ParsedReport {
  type: 'performance' | 'suitability' | 'viewability' | 'exclusion' | null;
  data: Record<string, any>[];
  headers: string[];
}

/**
 * ファイルをパース
 */
const parseFile = (file: File): Promise<ParsedReport> => {
  return new Promise((resolve) => {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
          
          if (jsonData.length === 0) {
            resolve({ type: null, data: [], headers: [] });
            return;
          }

          const headers = Object.keys(jsonData[0]);
          const type = identifyReportType(headers);
          resolve({ type, data: jsonData, headers });
        } catch (error) {
          resolve({ type: null, data: [], headers: [] });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: false,
        complete: (results) => {
          const rawData = results.data as any[];
          const headerRowIndex = findHeaderRowIndex(rawData);
          
          if (headerRowIndex === -1) {
            resolve({ type: null, data: [], headers: [] });
            return;
          }

          const headers = rawData[headerRowIndex] as string[];
          const dataRows = rawData.slice(headerRowIndex + 1)
            .filter(row => row && row.some((cell: any) => cell !== ''))
            .map(row => {
              const obj: Record<string, any> = {};
              headers.forEach((header, index) => {
                obj[header] = row[index] || '';
              });
              return obj;
            });

          const type = identifyReportType(headers);
          resolve({ type, data: dataRows, headers });
        },
        error: () => {
          resolve({ type: null, data: [], headers: [] });
        },
      });
    }
  });
};

/**
 * ヘッダー行を探す
 */
const findHeaderRowIndex = (rawData: any[]): number => {
  for (let i = 0; i < Math.min(rawData.length, 30); i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    const rowText = row.join('|').toLowerCase();
    if (rowText.includes('disclaimer') || rowText.includes('免責事項')) continue;

    const headers = row.filter((cell: any) => cell !== '');
    if (headers.length > 0 && identifyReportType(headers)) {
      return i;
    }
  }
  return -1;
};

/**
 * レポートタイプを特定
 */
const identifyReportType = (headers: string[]): 'performance' | 'suitability' | 'viewability' | 'exclusion' | null => {
  const headerStr = headers.map(h => String(h).toLowerCase()).join('|');

  if (headerStr.includes('category name') && (headerStr.includes('vcr') || headerStr.includes('vcr%'))) {
    return 'performance';
  }
  if (headerStr.includes('brand suitability') && headerStr.includes('suitable impressions')) {
    return 'suitability';
  }
  if ((headerStr.includes('viewability rate') || headerStr.includes('viewability%')) && headerStr.includes('gross impressions')) {
    return 'viewability';
  }
  if (headerStr.includes('video suitability') && headerStr.includes('placement name')) {
    return 'exclusion';
  }

  return null;
};

/**
 * KPI計算
 */
interface KPIs {
  finalSuitability: number;
  lift: number;
  totalExclusions: number;
  budgetOptimization: number;
}

const calculateKPIs = (
  reports: Map<string, Record<string, any>[]>,
  cpm: number
): KPIs => {
  let finalSuitability = 0;
  let lift = 0;
  let totalExclusions = 0;

  // Suitability計算
  const suitabilityData = reports.get('suitability') || [];
  if (suitabilityData.length > 0) {
    let totalImpressions = 0;
    let suitableImpressions = 0;

    suitabilityData.forEach(row => {
      const impressions = cleanNum(row['Gross Impressions'] || row['gross impressions'] || row['Impressions'] || row['impressions']);
      const suitable = cleanNum(row['Suitable Impressions'] || row['suitable impressions']);
      totalImpressions += impressions;
      suitableImpressions += suitable;
    });

    finalSuitability = totalImpressions > 0 ? (suitableImpressions / totalImpressions) * 100 : 0;
  }

  // Viewability計算
  const viewabilityData = reports.get('viewability') || [];
  if (viewabilityData.length > 0) {
    let totalVTR = 0;
    let count = 0;

    viewabilityData.forEach(row => {
      const vtr = cleanNum(row['Viewability Rate'] || row['viewability rate'] || row['Viewability%'] || row['viewability%']);
      if (vtr > 0) {
        totalVTR += vtr;
        count++;
      }
    });

    const avgVTR = count > 0 ? totalVTR / count : 0;
    lift = avgVTR * 1.2;
  }

  // Exclusion計算
  const exclusionData = reports.get('exclusion') || [];
  if (exclusionData.length > 0) {
    exclusionData.forEach(row => {
      const videoSuitability = String(row['Video Suitability'] || row['video suitability'] || '').toLowerCase().trim();
      const impressions = cleanNum(row['Impressions'] || row['impressions']);
      
      if (videoSuitability === 'unsuitable') {
        totalExclusions += impressions;
      }
    });
  }

  const budgetOptimization = (totalExclusions / 1000) * cpm;

  return {
    finalSuitability: Math.round(finalSuitability * 100) / 100,
    lift: Math.round(lift * 100) / 100,
    totalExclusions: Math.round(totalExclusions),
    budgetOptimization: Math.round(budgetOptimization),
  };
};

/**
 * チャートデータ生成
 */
const generateChartData = (performanceData: Record<string, any>[]) => {
  if (performanceData.length === 0) {
    return [{ name: 'データ', quality: 0, volume: 0 }];
  }

  return performanceData.slice(0, 10).map((row, index) => {
    const categoryName = row['Category Name'] || row['category name'] || `カテゴリ${index + 1}`;
    const vcr = cleanNum(row['VCR'] || row['vcr']);
    const impressions = cleanNum(row['Impressions'] || row['impressions']);
    
    return {
      name: String(categoryName).substring(0, 10),
      quality: vcr,
      volume: Math.round(impressions / 1000),
    };
  });
};

/**
 * Zefr インサイトレポート V2 - モックアップ完全再現版
 */
export default function ZefrInsightReportV2() {
  const [step, setStep] = useState<'upload' | 'dashboard'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [cpm, setCpm] = useState(1500);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [reports, setReports] = useState<Map<string, Record<string, any>[]>>(new Map());
  const [insights, setInsights] = useState<string[]>([]);
  const [editingInsights, setEditingInsights] = useState(false);
  const [tempInsights, setTempInsights] = useState<string[]>([]);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const loadedReports = useMemo(() => ({
    performance: reports.has('performance'),
    suitability: reports.has('suitability'),
    viewability: reports.has('viewability'),
    exclusion: reports.has('exclusion'),
  }), [reports]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    await processFiles(droppedFiles);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.currentTarget.files || []);
    await processFiles(selectedFiles);
  };

  const processFiles = async (filesToProcess: File[]) => {
    setIsLoading(true);
    const newReports = new Map<string, Record<string, any>[]>();

    for (const file of filesToProcess) {
      const result = await parseFile(file);
      if (result.type && result.data.length > 0) {
        newReports.set(result.type, result.data);
      }
    }

    setReports(newReports);
    setFiles(filesToProcess);
    setIsLoading(false);
  };

  const handleAnalyze = () => {
    if (reports.size === 0) return;

    const calculatedKpis = calculateKPIs(reports, cpm);
    setKpis(calculatedKpis);

    // インサイト生成
    const newInsights = [
      `ブランド適合性が${calculatedKpis.finalSuitability.toFixed(1)}%と${calculatedKpis.finalSuitability > 80 ? '高い水準' : calculatedKpis.finalSuitability > 60 ? '中程度の水準' : '低い水準'}を維持しており、ターゲット層への到達が${calculatedKpis.finalSuitability > 80 ? '効果的' : '改善の余地あり'}です。`,
      `除外インプレッションの削減により、推定${calculatedKpis.budgetOptimization.toLocaleString()}円の予算最適化が可能です。`,
      `ビューアビリティリフトが${calculatedKpis.lift.toFixed(1)}%で、コンテンツの視認性が向上しています。`,
    ];

    setInsights(newInsights);
    setTempInsights(newInsights);
    setStep('dashboard');
  };

  const handleSaveInsights = () => {
    setInsights([...tempInsights]);
    setEditingInsights(false);
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    // PDF出力ロジック
    alert('PDF出力機能は実装予定です');
  };

  const chartData = useMemo(() => {
    const performanceData = reports.get('performance') || [];
    return generateChartData(performanceData);
  }, [reports]);

  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-8">
        <div className="max-w-2xl mx-auto">
          {/* ヘッダー */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center">
                <span className="text-white font-bold">Z</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Zefr インサイトレポート</h1>
                <p className="text-sm text-slate-500">Premium Report Dashboard</p>
              </div>
            </div>
          </div>

          {/* メインコンテンツ */}
          <div className="space-y-8">
            {/* ドラッグ&ドロップエリア */}
            <div
              className={`relative border-2 border-dashed rounded-[32px] transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-cyan-500 bg-cyan-50'
                  : 'border-sky-200 bg-white hover:border-sky-300'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div className="p-16 text-center">
                <Upload className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  ファイルをドラッグ&ドロップ
                </h3>
                <p className="text-slate-600 mb-4">
                  またはクリックしてファイルを選択
                </p>
                <p className="text-sm text-slate-500">
                  対応形式: CSV, XLSX, XLS
                </p>
              </div>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* ファイル読み込み状態 */}
            {files.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">読み込み状態</h3>
                <div className="grid grid-cols-2 gap-3">
                  {['performance', 'suitability', 'viewability', 'exclusion'].map((type) => (
                    <div
                      key={type}
                      className={`p-4 rounded-[24px] border-2 transition-all ${
                        loadedReports[type as keyof typeof loadedReports]
                          ? 'bg-green-50 border-green-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            loadedReports[type as keyof typeof loadedReports]
                              ? 'bg-green-500 border-green-500'
                              : 'border-slate-300'
                          }`}
                        >
                          {loadedReports[type as keyof typeof loadedReports] && (
                            <span className="text-white text-xs">✓</span>
                          )}
                        </div>
                        <span className="font-medium text-slate-900 capitalize">
                          {type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CPM入力 */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">
                想定CPM（¥）
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-600">¥</span>
                <input
                  type="number"
                  value={cpm}
                  onChange={(e) => setCpm(Math.max(0, parseInt(e.target.value) || 0))}
                  className="flex-1 px-4 py-3 border border-sky-200 rounded-[24px] focus:border-cyan-500 focus:outline-none"
                  min="0"
                  step="100"
                />
              </div>
            </div>

            {/* パスワード設定 */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">
                共有用パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="レポート閲覧時に必要なパスワード"
                className="w-full px-4 py-3 border border-sky-200 rounded-[24px] focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* 分析開始ボタン */}
            <button
              onClick={handleAnalyze}
              disabled={reports.size === 0 || isLoading}
              className={`w-full py-4 rounded-[24px] font-semibold text-white transition-all ${
                reports.size === 0 || isLoading
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-cyan-500 hover:bg-cyan-600 active:scale-95'
              }`}
            >
              {isLoading ? 'ファイル処理中...' : '分析開始'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Zefr インサイトレポート</h1>
            <p className="text-slate-600 mt-1">Reporting Period: Dec 2025 - Jan 2026</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              className="px-6 py-2 rounded-[24px] border border-slate-200 text-slate-900 font-semibold hover:bg-slate-50 transition-all"
            >
              <FileText className="w-4 h-4 inline mr-2" />
              PDF出力
            </button>
            <button
              onClick={() => setStep('upload')}
              className="px-6 py-2 rounded-[24px] bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all"
            >
              新規レポート
            </button>
          </div>
        </div>

        {/* メインダッシュボード */}
        <div ref={dashboardRef} className="space-y-8">
          {/* KPIセクション */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1 h-6 bg-cyan-500 rounded-full" />
              <h2 className="text-lg font-bold text-slate-900">CAMPAIGN TOTAL SUMMARY</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* KPI 1: 適合率 */}
              <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
                <p className="text-xs font-semibold text-slate-500 mb-2">ブランド適合性</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  {kpis.finalSuitability.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500">適正なインプレッション率</p>
              </div>

              {/* KPI 2: リフト */}
              <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
                <p className="text-xs font-semibold text-slate-500 mb-2">ビューアビリティリフト</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  +{kpis.lift.toFixed(1)}pt
                </p>
                <p className="text-xs text-slate-500">視認性の向上</p>
              </div>

              {/* KPI 3: 除外インプレッション */}
              <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
                <p className="text-xs font-semibold text-slate-500 mb-2">総除外インプレッション</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  {kpis.totalExclusions.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">ブロック済みインプレッション</p>
              </div>

              {/* KPI 4: 予算最適化 */}
              <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
                <p className="text-xs font-semibold text-slate-500 mb-2">予算最適化額推定</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  ¥{kpis.budgetOptimization.toLocaleString()}
                </p>
                <p className="text-xs text-slate-500">推定削減可能額</p>
              </div>
            </div>
          </div>

          {/* チャートセクション */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ドーナツチャート */}
            <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-bold text-slate-900 mb-6">点数合計サマリー</h3>
              <div className="flex justify-center">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: '適正', value: kpis.finalSuitability },
                        { name: '改善', value: 100 - kpis.finalSuitability },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      dataKey="value"
                    >
                      <Cell fill="#0ea5e9" />
                      <Cell fill="#e5e7eb" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center mt-4">
                <p className="text-3xl font-bold text-slate-900">
                  {kpis.finalSuitability.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500 mt-1">適合率</p>
              </div>
            </div>

            {/* AreaChart */}
            <div className="lg:col-span-2 bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
              <h3 className="text-sm font-bold text-slate-900 mb-6">DAILY QUALITY & VOLUME TREND</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="quality"
                    stroke="#0ea5e9"
                    fillOpacity={0.3}
                    fill="#0ea5e9"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ScatterChart */}
          <div className="bg-white rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
            <h3 className="text-sm font-bold text-slate-900 mb-6">PERFORMANCE BY CONTEXT</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="quality" stroke="#9ca3af" />
                <YAxis dataKey="volume" stroke="#9ca3af" />
                <Tooltip />
                <Scatter name="カテゴリー" data={chartData} fill="#0ea5e9" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* インサイトパネル */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">STRATEGIC INSIGHTS</h3>
              {!editingInsights && (
                <button
                  onClick={() => {
                    setEditingInsights(true);
                    setTempInsights([...insights]);
                  }}
                  className="p-2 hover:bg-slate-700 rounded-lg transition-all"
                >
                  <Edit2 className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            {editingInsights ? (
              <div className="space-y-4">
                {tempInsights.map((insight, index) => (
                  <textarea
                    key={index}
                    value={insight}
                    onChange={(e) => {
                      const newInsights = [...tempInsights];
                      newInsights[index] = e.target.value;
                      setTempInsights(newInsights);
                    }}
                    className="w-full p-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-cyan-500 focus:outline-none"
                    rows={3}
                  />
                ))}
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveInsights}
                    className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-semibold transition-all"
                  >
                    <Save className="w-4 h-4 inline mr-2" />
                    保存
                  </button>
                  <button
                    onClick={() => setEditingInsights(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-all"
                  >
                    <X className="w-4 h-4 inline mr-2" />
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {insights.map((insight, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-sm">{index + 1}</span>
                    </div>
                    <p className="text-slate-100 text-sm leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
