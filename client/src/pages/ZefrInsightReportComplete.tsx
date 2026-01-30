import React, { useState, useRef, useMemo } from 'react';
import { Upload, Edit2, Save, X, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  LineChart,
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
} from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * 数値クリーニング関数（K, M単位対応）
 */
const cleanNum = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;
  
  let str = String(value).trim().toUpperCase();
  
  // K, M単位を数値に変換
  if (str.includes('M')) {
    str = str.replace(/M/g, '');
    return parseFloat(str) * 1000000;
  }
  if (str.includes('K')) {
    str = str.replace(/K/g, '');
    return parseFloat(str) * 1000;
  }
  
  // 記号を除去
  str = str.replace(/[%,\$¥]/g, '');
  str = str.replace(/\s+/g, '');
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

/**
 * 数値をK/M単位でフォーマット
 */
const formatNumberWithUnit = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(0);
};

/**
 * ファイル解析インターフェース
 */
interface ParsedReport {
  type: 'performance' | 'risk' | 'view' | null;
  data: Record<string, any>[];
  headers: string[];
  fileName: string;
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
            resolve({ type: null, data: [], headers: [], fileName: file.name });
            return;
          }

          const headers = Object.keys(jsonData[0]);
          const type = identifyReportType(file.name, headers);
          resolve({ type, data: jsonData, headers, fileName: file.name });
        } catch (error) {
          resolve({ type: null, data: [], headers: [], fileName: file.name });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const jsonData = results.data as Record<string, any>[];
          const headers = results.meta.fields || [];
          const type = identifyReportType(file.name, headers);
          resolve({ type, data: jsonData, headers, fileName: file.name });
        },
        error: () => {
          resolve({ type: null, data: [], headers: [], fileName: file.name });
        },
      });
    }
  });
};

/**
 * レポートタイプを特定
 */
const identifyReportType = (fileName: string, headers: string[]): 'performance' | 'risk' | 'view' | null => {
  const fileNameLower = fileName.toLowerCase();
  const headerStr = headers.map(h => String(h).toLowerCase()).join('|');

  // Performance Summary
  if (fileNameLower.includes('performance') && headerStr.includes('category name')) {
    return 'performance';
  }
  
  // Risk
  if (fileNameLower.includes('risk') && headerStr.includes('account name')) {
    return 'risk';
  }
  
  // View
  if (fileNameLower.includes('view') && headerStr.includes('device type')) {
    return 'view';
  }

  return null;
};

/**
 * KPI計算インターフェース
 */
interface KPIs {
  finalSuitability: number;
  lift: number;
  totalExclusions: number;
  budgetOptimization: number;
}

/**
 * KPI計算
 */
const calculateKPIs = (
  performanceData: Record<string, any>[],
  lowQualityBlocked: number,
  totalMeasurable: number,
  cpm: number
): KPIs => {
  let totalSuitability = 0;
  let totalImpressions = 0;

  // ブランド適合率計算
  performanceData.forEach(row => {
    const suitability = cleanNum(row['Suitability %'] || 0);
    const impressions = cleanNum(row['Available Impressions'] || 0);
    
    // Suitability %が0-1の範囲の場合は100倍
    const suitabilityRate = suitability <= 1 ? suitability * 100 : suitability;
    totalSuitability += (suitabilityRate / 100) * impressions;
    totalImpressions += impressions;
  });

  const finalSuitability = totalImpressions > 0 ? (totalSuitability / totalImpressions) * 100 : 0;
  // 適合性リフト = (Low-quality / Total Measurable) * 100
  const lift = (lowQualityBlocked / totalMeasurable) * 100;
  const budgetOptimization = (lowQualityBlocked / 1000) * cpm;

  return {
    finalSuitability: Math.round(finalSuitability * 100) / 100,
    lift: Math.round(lift * 100) / 100,
    totalExclusions: Math.round(lowQualityBlocked),
    budgetOptimization: Math.round(budgetOptimization),
  };
};

/**
 * Zefr インサイトレポート - 完全版
 */
export default function ZefrInsightReportComplete() {
  const [step, setStep] = useState<'upload' | 'dashboard'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [clientName, setClientName] = useState('');
  const [totalMeasurable, setTotalMeasurable] = useState('');
  const [lowQualityBlocked, setLowQualityBlocked] = useState('');
  const [cpm, setCpm] = useState('1500');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [reports, setReports] = useState<Map<string, Record<string, any>[]>>(new Map());
  const [parsedFiles, setParsedFiles] = useState<ParsedReport[]>([]);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const loadedReports = useMemo(() => ({
    performance: reports.has('performance'),
    risk: reports.has('risk'),
    view: reports.has('view'),
  }), [reports]);

  // 配信期間を取得
  const reportingPeriod = useMemo(() => {
    const viewData = reports.get('view') || [];
    if (viewData.length === 0) return 'N/A';
    
    const dates = viewData
      .map(row => row['Report Date'] || '')
      .filter(date => date !== '')
      .sort();
    
    if (dates.length === 0) return 'N/A';
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    
    return `${startDate} - ${endDate}`;
  }, [reports]);

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
    const parsedFilesList: ParsedReport[] = [];

    for (const file of filesToProcess) {
      const result = await parseFile(file);
      parsedFilesList.push(result);
      
      if (result.type && result.data.length > 0) {
        newReports.set(result.type, result.data);
      }
    }

    setReports(newReports);
    setParsedFiles(parsedFilesList);
    setFiles(filesToProcess);
    setIsLoading(false);
  };

  const handleAnalyze = () => {
    if (reports.size === 0 || !clientName || !totalMeasurable || !lowQualityBlocked || !cpm) {
      alert('すべての項目を入力してください');
      return;
    }

    const performanceData = reports.get('performance') || [];
    const lowQualityNum = cleanNum(lowQualityBlocked);
    const totalMeasurableNum = cleanNum(totalMeasurable);
    const cpmNum = parseFloat(cpm) || 0;

    const calculatedKpis = calculateKPIs(performanceData, lowQualityNum, totalMeasurableNum, cpmNum);
    setKpis(calculatedKpis);
    setStep('dashboard');
  };

  // チャートデータ生成
  const performanceChartData = useMemo(() => {
    const performanceData = reports.get('performance') || [];
    return performanceData.slice(0, 10).map((row, index) => {
      const categoryName = row['Category Name'] || `カテゴリ${index + 1}`;
      const vcr = cleanNum(row['VCR'] || 0);
      const ctr = cleanNum(row['CTR'] || 0);
      const impressions = cleanNum(row['Available Impressions'] || 0);
      
      return {
        name: String(categoryName).substring(0, 10),
        categoryName: String(categoryName),
        vcr: vcr,
        ctr: ctr,
        volume: impressions, // バブルサイズ用に元の値を使用
      };
    });
  }, [reports]);

  // Daily Quality & Volume Trend データ生成
  const dailyTrendData = useMemo(() => {
    const viewData = reports.get('view') || [];
    const performanceData = reports.get('performance') || [];
    
    // Report Dateでグループ化
    const dateMap = new Map<string, any>();
    
    viewData.forEach(row => {
      const date = row['Report Date'] || '';
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          date: date,
          viewability: 0,
          impressions: 0,
          count: 0,
        });
      }
      const entry = dateMap.get(date);
      entry.viewability += cleanNum(row['Viewability Rate'] || 0);
      entry.impressions += cleanNum(row['Gross Impressions'] || 0);
      entry.count += 1;
    });

    // Brand Suitability %を追加
    performanceData.forEach(row => {
      // ここでは全体の平均を使用
      // 実際のデイリーデータがない場合は、平均値を使用
    });

    // 平均を計算
    const result = Array.from(dateMap.values())
      .map(entry => {
        const suitability = performanceData.length > 0
          ? performanceData.reduce((sum, row) => {
              const suit = cleanNum(row['Suitability %'] || 0);
              return sum + (suit <= 1 ? suit * 100 : suit);
            }, 0) / performanceData.length
          : 0;
        return {
          date: entry.date,
          viewability: Math.round((entry.viewability / entry.count) * 100) / 100,
          suitability: Math.round(suitability * 100) / 100,
          impressions: Math.round(entry.impressions / 1000),
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);

    return result.length > 0 ? result : [{ date: '2026-01-01', viewability: 0, suitability: 0, impressions: 0 }];
  }, [reports]);

  // Daily Viewability Trend by Device データ生成
  const deviceTrendData = useMemo(() => {
    const viewData = reports.get('view') || [];
    const dateMap = new Map<string, Map<string, any>>();

    viewData.forEach(row => {
      const date = row['Report Date'] || '';
      const device = row['Device Type'] || 'Unknown';
      const viewability = cleanNum(row['Viewability Rate'] || 0);

      if (!dateMap.has(date)) {
        dateMap.set(date, new Map());
      }
      const deviceMap = dateMap.get(date);
      if (deviceMap) {
        if (!deviceMap.has(device)) {
          deviceMap.set(device, { viewability: 0, count: 0 });
        }
        const entry = deviceMap.get(device);
        if (entry) {
          entry.viewability += viewability;
          entry.count += 1;
        }
      }
    });

    const devices = new Set<string>();
    viewData.forEach(row => devices.add(row['Device Type'] || 'Unknown'));

    const result = Array.from(dateMap.entries())
      .map(([date, deviceMapVal]) => {
        const entry: any = { date: date };
        devices.forEach(device => {
          const deviceEntry = deviceMapVal?.get(device);
          if (deviceEntry) {
            entry[device] = Math.round((deviceEntry.viewability / deviceEntry.count) * 100) / 100;
          }
        });
        return entry;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);

    return result.length > 0 ? result : [{ date: '2026-01-01' }];
  }, [reports]);

  // IVT Safe Zone データ生成
  const ivtData = useMemo(() => {
    const viewData = reports.get('view') || [];
    const categoryMap = new Map<string, { ivt: number; count: number }>();
    let totalIvt = 0;
    let totalCount = 0;

    viewData.forEach(row => {
      const device = row['Device Type'] || 'Unknown';
      const ivtRate = cleanNum(row['IVT Impressions Rate'] || 0);

      if (!categoryMap.has(device)) {
        categoryMap.set(device, { ivt: 0, count: 0 });
      }
      const entry = categoryMap.get(device);
      if (entry) {
        entry.ivt += ivtRate * 100;
        entry.count += 1;
      }
      totalIvt += ivtRate * 100;
      totalCount += 1;
    });

    const result = Array.from(categoryMap.entries()).map(([device, data]) => {
      const entry = categoryMap.get(device);
      return {
        name: device,
        value: entry ? Math.round((entry.ivt / entry.count) * 100) / 100 : 0,
      };
    });

    // Overallを追加
    result.unshift({
      name: 'Overall',
      value: totalCount > 0 ? Math.round((totalIvt / totalCount) * 100) / 100 : 0,
    });

    return result;
  }, [reports]);

  if (step === 'upload') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-8">
        <div className="max-w-2xl mx-auto">
          {/* ヘッダー */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-[24px] bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">Z</span>
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
                <div className="grid grid-cols-3 gap-3">
                  {['performance', 'risk', 'view'].map((type) => (
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
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            loadedReports[type as keyof typeof loadedReports]
                              ? 'bg-green-500 border-green-500'
                              : 'border-slate-300'
                          }`}
                        >
                          {loadedReports[type as keyof typeof loadedReports] && (
                            <span className="text-white text-xs font-bold">✓</span>
                          )}
                        </div>
                        <span className="font-medium text-slate-900 capitalize text-sm">
                          {type === 'performance' && 'Performance'}
                          {type === 'risk' && 'Risk'}
                          {type === 'view' && 'View'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* デバッグ情報 */}
                <div className="mt-6 p-4 bg-slate-50 rounded-[24px] border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">ファイル認識情報</h4>
                  <div className="space-y-2">
                    {parsedFiles.map((file, index) => (
                      <div key={index} className="flex items-start gap-2 text-xs">
                        {file.type ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{file.fileName}</p>
                          <p className="text-slate-600">
                            {file.type ? `✓ ${file.type}として認識` : '✗ 認識されませんでした'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 手動入力項目 */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">レポート情報</h3>
              
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  クライアント名
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="例: SoftBank Corp."
                  className="w-full px-4 py-3 border border-sky-200 rounded-[24px] focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Total Measurable Impressions
                </label>
                <input
                  type="text"
                  value={totalMeasurable}
                  onChange={(e) => setTotalMeasurable(e.target.value)}
                  placeholder="例: 50M または 50000K"
                  className="w-full px-4 py-3 border border-sky-200 rounded-[24px] focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Low-quality Impressions Blocked
                </label>
                <input
                  type="text"
                  value={lowQualityBlocked}
                  onChange={(e) => setLowQualityBlocked(e.target.value)}
                  placeholder="例: 500K または 0.5M"
                  className="w-full px-4 py-3 border border-sky-200 rounded-[24px] focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  推定CPM（¥）
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-semibold">¥</span>
                  <input
                    type="number"
                    value={cpm}
                    onChange={(e) => setCpm(e.target.value)}
                    className="flex-1 px-4 py-3 border border-sky-200 rounded-[24px] focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                    min="0"
                    step="100"
                  />
                </div>
              </div>
            </div>

            {/* 分析開始ボタン */}
            <button
              onClick={handleAnalyze}
              disabled={reports.size === 0 || isLoading || !clientName || !totalMeasurable || !lowQualityBlocked || !cpm}
              className={`w-full py-4 rounded-[32px] font-semibold text-white transition-all ${
                reports.size === 0 || isLoading || !clientName || !totalMeasurable || !lowQualityBlocked || !cpm
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-cyan-500 hover:bg-cyan-600 active:scale-95 shadow-lg hover:shadow-xl'
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
            <h1 className="text-3xl font-bold text-slate-900">{clientName}</h1>
            <p className="text-slate-600 mt-1">Reporting Period: {reportingPeriod}</p>
          </div>
          <button
            onClick={() => setStep('upload')}
            className="px-6 py-2 rounded-[24px] bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all shadow-lg"
          >
            新規レポート
          </button>
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
              {/* KPI 1: ブランド適合性 */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
                <p className="text-xs font-semibold text-slate-500 mb-2">ブランド適合性</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  {(kpis.finalSuitability).toFixed(1)}%
                </p>
                <p className="text-xs text-slate-500">適正なインプレッション率</p>
              </div>

              {/* KPI 2: 適合性リフト */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
                <p className="text-xs font-semibold text-slate-500 mb-2">適合性リフト</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  {kpis.lift > 0 ? '+' : ''}{kpis.lift.toFixed(1)}pt
                </p>
                <p className="text-xs text-slate-500">基準値からの変化</p>
              </div>

              {/* KPI 3: 総除外インプレッション */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
                <p className="text-xs font-semibold text-slate-500 mb-2">総除外インプレッション</p>
                <p className="text-4xl font-bold text-slate-900 mb-1">
                  {formatNumberWithUnit(kpis.totalExclusions)}
                </p>
                <p className="text-xs text-slate-500">ブロック済みインプレッション</p>
              </div>

              {/* KPI 4: 予算最適化額 */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
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
            {/* ブランド適合性サマリー */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">適合率サマリー</h3>
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

            {/* DAILY QUALITY & VOLUME TREND */}
            <div className="lg:col-span-2 bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">DAILY QUALITY & VOLUME TREND</h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={dailyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#9ca3af" />
                  <YAxis yAxisId="left" stroke="#9ca3af" />
                  <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="impressions" fill="#0ea5e9" name="インプレッション数" />
                  <Line yAxisId="right" type="monotone" dataKey="viewability" stroke="#06b6d4" name="ビューアビリティ" />
                  <Line yAxisId="right" type="monotone" dataKey="suitability" stroke="#f59e0b" name="Brand Suitability%" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PERFORMANCE BY CONTEXT */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
            <h3 className="text-sm font-bold text-slate-900 mb-6">PERFORMANCE BY CONTEXT</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart data={performanceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="vcr" stroke="#9ca3af" name="VCR" />
                <YAxis dataKey="ctr" stroke="#9ca3af" name="CTR" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="カテゴリー" data={performanceChartData} fill="#0ea5e9" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Daily Viewability Trend by Device */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
            <h3 className="text-sm font-bold text-slate-900 mb-6">DAILY VIEWABILITY TREND BY DEVICE</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={deviceTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" label={{ value: 'Viewability Rate', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value: any) => value ? `${(Number(value) * 100).toFixed(2)}%` : 'N/A'} />
                <Legend />
                {Array.from(new Set(deviceTrendData.flatMap(d => Object.keys(d).filter(k => k !== 'date')))).map((device, idx) => {
                  const colors = ['#0ea5e9', '#f59e0b', '#10b981'];
                  return (
                    <Line
                      key={device}
                      type="monotone"
                      dataKey={device}
                      stroke={colors[idx % 3]}
                      strokeWidth={2}
                      dot={false}
                      name={device}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* IVT Safe Zone Benchmark */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
            <h3 className="text-sm font-bold text-slate-900 mb-6">IVT "SAFE ZONE" COMPARISON: CAMPAIGN VS. YOUTUBE BENCHMARK</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                { name: 'YouTube Benchmark', value: 1.1, type: 'benchmark' },
                ...ivtData.map(item => ({ ...item, type: 'campaign' })),
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Legend />
                <Bar dataKey="value" fill="#0ea5e9" name="Campaign" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
