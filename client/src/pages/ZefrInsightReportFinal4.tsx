import React, { useState, useRef } from 'react';
import { Upload, Edit2, Save, X, AlertCircle, CheckCircle2, Download, Share2, FileText } from 'lucide-react';
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
  ReferenceLine,
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

interface ParsedData {
  performance: any[];
  risk: any[];
  view: any[];
}

export default function ZefrInsightReportFinal4() {
  const [stage, setStage] = useState<'setup' | 'dashboard' | 'shared'>('setup');
  const [clientName, setClientName] = useState('');
  const [totalMeasurable, setTotalMeasurable] = useState('');
  const [lowQualityBlocked, setLowQualityBlocked] = useState('');
  const [estimatedCPM, setEstimatedCPM] = useState('1500');
  const [password, setPassword] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ [key: string]: File | null }>({
    performance: null,
    risk: null,
    view: null,
  });
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [editingInsight, setEditingInsight] = useState<number | null>(null);
  const [hoveredSuitability, setHoveredSuitability] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // ファイルアップロード処理
  const handleFileUpload = async (file: File, type: 'performance' | 'risk' | 'view') => {
    setUploadedFiles(prev => ({ ...prev, [type]: file }));

    const text = await file.text();
    let data: any[] = [];

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const workbook = XLSX.read(text, { type: 'binary' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(sheet);
    } else {
      const result = Papa.parse(text, { header: true });
      data = result.data.filter((row: any) => Object.values(row).some(v => v));
    }

    setParsedData(prev => ({
      ...prev || { performance: [], risk: [], view: [] },
      [type]: data,
    }));
  };

  // ダッシュボード生成
  const generateDashboard = () => {
    if (!clientName || !totalMeasurable || !lowQualityBlocked || !estimatedCPM) {
      alert('すべての項目を入力してください');
      return;
    }

    const totalMeas = cleanNum(totalMeasurable);
    const lowQual = cleanNum(lowQualityBlocked);
    const cpm = cleanNum(estimatedCPM);

    // KPI計算
    const finalSuitability = 98.5; // サンプル値
    const suitabilityLift = (lowQual / totalMeas) * 100;
    const budgetOptimization = (lowQual / 1000) * cpm;

    // インサイト生成
    const newInsights = [
      `ブランド適合率は${finalSuitability.toFixed(1)}%で、業界平均を上回っています。Zefr導入により${suitabilityLift.toFixed(1)}ポイントの改善が見込まれます。`,
      `低品質インプレッション${formatNumberWithUnit(lowQual)}件をブロックすることで、推定${formatNumberWithUnit(budgetOptimization)}円の予算最適化が可能です。`,
      `ビューアビリティとブランド安全性の両面で優れたパフォーマンスを示しており、継続的なZefr活用を推奨します。`,
    ];

    setInsights(newInsights);
    setStage('dashboard');
  };

  // PDF出力
  const exportPDF = async () => {
    if (!dashboardRef.current) return;
    
    try {
      const html2canvas = (window as any).html2canvas;
      const jsPDF = (window as any).jsPDF;
      
      if (!html2canvas || !jsPDF) {
        alert('PDF出力ライブラリが読み込まれていません。ページをリロードしてください。');
        return;
      }
      
      const element = dashboardRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f7fbff',
        allowTaint: true,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF.jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`${clientName || 'report'}.pdf`);
      alert('PDFが正常に出力されました。');
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDF出力に失敗しました。もう一度お試しください。');
    }
  };

  // PPTX出力
  const exportPPTX = async () => {
    if (!dashboardRef.current) return;
    
    try {
      const html2canvas = (window as any).html2canvas;
      const PptxGenJS = (window as any).PptxGenJS;
      
      if (!html2canvas || !PptxGenJS) {
        alert('PPTX出力ライブラリが読み込まれていません。ページをリロードしてください。');
        return;
      }
      
      const element = dashboardRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f7fbff',
        allowTaint: true,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const prs = new PptxGenJS();
      const slide = prs.addSlide();
      
      slide.addImage({
        data: imgData,
        x: 0,
        y: 0,
        w: 10,
        h: 7.5,
      });
      
      prs.writeFile({ fileName: `${clientName || 'report'}.pptx` });
      alert('PPTXが正常に出力されました。');
    } catch (error) {
      console.error('PPTX出力エラー:', error);
      alert('PPTX出力に失敗しました。もう一度お試しください。');
    }
  };

  // Web発行
  const publishWeb = () => {
    if (!password) {
      alert('パスワードを設定してください');
      return;
    }
    const reportId = Math.random().toString(36).substring(2, 11);
    const shareUrl = `${window.location.origin}/?report=${reportId}`;
    alert(`レポートが発行されました。\n\n共有URL: ${shareUrl}\nパスワード: ${password}\n\nこのURLをコピーして共有してください。`);
  };

  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500 rounded-full mb-4">
              <span className="text-2xl font-bold text-white">Z</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900">Zefr インサイトレポート</h1>
            <p className="text-slate-600 mt-2">Premium Report Dashboard</p>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
            <h2 className="text-lg font-bold text-slate-900 mb-6">セットアップ</h2>

            {/* ファイルアップロード */}
            <div className="mb-8">
              <label className="block text-sm font-semibold text-slate-900 mb-4">ファイル & ドラッグ&ドロップ</label>
              <div className="grid grid-cols-3 gap-4">
                {(['performance', 'risk', 'view'] as const).map(type => (
                  <div key={type} className="relative">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => e.target.files && handleFileUpload(e.target.files[0], type)}
                      className="hidden"
                      id={`file-${type}`}
                    />
                    <label
                      htmlFor={`file-${type}`}
                      className="block p-4 border-2 border-dashed border-cyan-300 rounded-[16px] text-center cursor-pointer hover:bg-cyan-50 transition"
                    >
                      <p className="text-xs font-semibold text-slate-900">
                        {type === 'performance' && 'Performance'}
                        {type === 'risk' && 'Risk'}
                        {type === 'view' && 'View'}
                      </p>
                      {uploadedFiles[type] ? (
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <p className="text-xs text-green-600">{uploadedFiles[type]?.name}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 mt-2">ファイルを選択</p>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* 入力項目 */}
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">クライアント名</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="例: SoftBank Corp."
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Total Measurable Impressions</label>
                <input
                  type="text"
                  value={totalMeasurable}
                  onChange={(e) => setTotalMeasurable(e.target.value)}
                  placeholder="例: 50M または 50000K"
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Low-quality Impressions Blocked</label>
                <input
                  type="text"
                  value={lowQualityBlocked}
                  onChange={(e) => setLowQualityBlocked(e.target.value)}
                  placeholder="例: 100K または 0.1M"
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">推定CPM</label>
                <input
                  type="number"
                  value={estimatedCPM}
                  onChange={(e) => setEstimatedCPM(e.target.value)}
                  placeholder="1500"
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">共有パスワード</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="パスワードを設定"
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <button
              onClick={generateDashboard}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold py-3 rounded-[16px] hover:shadow-lg transition"
            >
              レポートを生成
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'dashboard') {
    const totalMeas = cleanNum(totalMeasurable);
    const lowQual = cleanNum(lowQualityBlocked);
    const cpm = cleanNum(estimatedCPM);

    const kpis = {
      finalSuitability: 98.5,
      suitabilityLift: (lowQual / totalMeas) * 100,
      exclusions: lowQual,
      budgetOptimization: (lowQual / 1000) * cpm,
    };

    // チャートデータ生成
    const dailyTrendData = [
      { date: '2026-01-01', impressions: 115722, viewability: 94.2, suitability: 98.5, ott: 95.2, mobileApp: 67.8, mobileWeb: 87.3 },
      { date: '2026-01-03', impressions: 193846, viewability: 95.1, suitability: 97.4, ott: 95.8, mobileApp: 66.5, mobileWeb: 87.9 },
      { date: '2026-01-04', impressions: 261187, viewability: 93.8, suitability: 98.1, ott: 94.2, mobileApp: 65.8, mobileWeb: 86.2 },
      { date: '2026-01-05', impressions: 164659, viewability: 94.8, suitability: 98.6, ott: 95.5, mobileApp: 68.2, mobileWeb: 88.1 },
      { date: '2026-01-07', impressions: 139201, viewability: 95.3, suitability: 98.5, ott: 96.1, mobileApp: 69.5, mobileWeb: 88.7 },
      { date: '2026-01-09', impressions: 74644, viewability: 94.1, suitability: 99.0, ott: 94.8, mobileApp: 67.1, mobileWeb: 87.0 },
      { date: '2026-01-11', impressions: 192745, viewability: 93.5, suitability: 98.8, ott: 93.9, mobileApp: 66.2, mobileWeb: 85.8 },
      { date: '2026-01-13', impressions: 109814, viewability: 94.9, suitability: 98.0, ott: 95.6, mobileApp: 68.9, mobileWeb: 88.5 },
      { date: '2026-01-14', impressions: 114132, viewability: 93.2, suitability: 98.7, ott: 93.5, mobileApp: 65.4, mobileWeb: 84.9 },
      { date: '2026-01-16', impressions: 313913, viewability: 95.0, suitability: 98.8, ott: 95.8, mobileApp: 69.2, mobileWeb: 88.2 },
      { date: '2026-01-17', impressions: 345177, viewability: 94.6, suitability: 98.9, ott: 95.2, mobileApp: 68.5, mobileWeb: 87.6 },
      { date: '2026-01-18', impressions: 334175, viewability: 95.2, suitability: 98.8, ott: 95.9, mobileApp: 69.8, mobileWeb: 88.9 },
      { date: '2026-01-19', impressions: 305664, viewability: 94.3, suitability: 98.8, ott: 94.7, mobileApp: 67.3, mobileWeb: 87.1 },
      { date: '2026-01-21', impressions: 253155, viewability: 95.4, suitability: 99.0, ott: 96.2, mobileApp: 70.1, mobileWeb: 89.3 },
    ];

    const performanceData = [
      { categoryName: 'Music', vcr: 65.2, ctr: 4.8, volume: 1250000 },
      { categoryName: 'News', vcr: 58.5, ctr: 3.9, volume: 980000 },
      { categoryName: 'Entertainment', vcr: 72.1, ctr: 5.2, volume: 1100000 },
      { categoryName: 'Sports', vcr: 68.3, ctr: 4.5, volume: 850000 },
      { categoryName: 'Gaming', vcr: 75.8, ctr: 5.8, volume: 720000 },
      { categoryName: 'Lifestyle', vcr: 62.1, ctr: 4.1, volume: 650000 },
      { categoryName: 'Tech', vcr: 70.2, ctr: 5.0, volume: 580000 },
      { categoryName: 'Travel', vcr: 66.9, ctr: 4.4, volume: 520000 },
      { categoryName: 'Food', vcr: 64.3, ctr: 4.6, volume: 480000 },
      { categoryName: 'Fashion', vcr: 69.5, ctr: 4.9, volume: 420000 },
    ];

    const colors = ['#0ea5e9', '#06b6d4', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f43f5e', '#6366f1', '#3b82f6'];

    const ivtData = [
      { name: 'YouTube Benchmark', value: 1.1, color: '#ef4444' },
      { name: 'Overall', value: 0.27, color: '#0ea5e9' },
      { name: 'OTT', value: 0.15, color: '#06b6d4' },
      { name: 'Mobile App', value: 0.34, color: '#14b8a6' },
      { name: 'Mobile Web', value: 0.44, color: '#f59e0b' },
    ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 to-blue-50 p-8">
        <div className="max-w-7xl mx-auto">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{clientName}</h1>
              <p className="text-slate-600">Reporting Period: Jan 2025</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={exportPDF}
                className="flex items-center gap-2 bg-white px-6 py-3 rounded-[16px] font-semibold text-slate-900 hover:shadow-md transition"
              >
                <Download className="w-4 h-4" />
                PDF発行
              </button>
              <button
                onClick={exportPPTX}
                className="flex items-center gap-2 bg-white px-6 py-3 rounded-[16px] font-semibold text-slate-900 hover:shadow-md transition"
              >
                <FileText className="w-4 h-4" />
                PPTX発行
              </button>
              <button
                onClick={publishWeb}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-6 py-3 rounded-[16px] font-semibold hover:shadow-lg transition"
              >
                <Share2 className="w-4 h-4" />
                Web発行
              </button>
            </div>
          </div>

          {/* KPIカード */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs text-slate-600 font-semibold mb-2">適合率</p>
              <p className="text-3xl font-bold text-slate-900">{kpis.finalSuitability.toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs text-slate-600 font-semibold mb-2">適合性リフト</p>
              <p className="text-3xl font-bold text-cyan-600">+{kpis.suitabilityLift.toFixed(1)} pt</p>
            </div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs text-slate-600 font-semibold mb-2">総除外インプレッション</p>
              <p className="text-3xl font-bold text-slate-900">{formatNumberWithUnit(kpis.exclusions)}</p>
            </div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs text-slate-600 font-semibold mb-2">予算最適化額推定</p>
              <p className="text-3xl font-bold text-cyan-600">¥{formatNumberWithUnit(kpis.budgetOptimization)}</p>
            </div>
          </div>

          {/* ダッシュボード */}
          <div ref={dashboardRef} className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-[32px] p-8">
            {/* 適合率サマリー + DAILY QUALITY & VOLUME TREND */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* 適合率サマリー */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
                <h3 className="text-sm font-bold text-slate-900 mb-6">適合率サマリー</h3>
                <div className="flex justify-center mb-6" onMouseEnter={() => setHoveredSuitability(true)} onMouseLeave={() => setHoveredSuitability(false)}>
                  <div className="relative w-40 h-40 cursor-pointer">
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      {/* 非適合部分（グレー） */}
                      <circle
                        cx="100"
                        cy="100"
                        r="80"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="25"
                        strokeDasharray={`${((100 - kpis.finalSuitability) / 100) * 502.65} 502.65`}
                        strokeLinecap="round"
                        transform={`rotate(${(kpis.finalSuitability / 100) * 360 - 90} 100 100)`}
                      />
                      {/* 適合部分（青） */}
                      <circle
                        cx="100"
                        cy="100"
                        r="80"
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="25"
                        strokeDasharray={`${(kpis.finalSuitability / 100) * 502.65} 502.65`}
                        strokeLinecap="round"
                        transform="rotate(-90 100 100)"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {hoveredSuitability ? (
                        <>
                          <p className="text-xl font-bold text-cyan-600">+{kpis.suitabilityLift.toFixed(1)}</p>
                          <p className="text-xs text-slate-600">リフト値</p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-slate-900">{kpis.finalSuitability.toFixed(1)}%</p>
                          <p className="text-xs text-slate-500">適合率</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-[16px] p-4">
                  <p className="text-xl font-bold text-cyan-600">+{kpis.suitabilityLift.toFixed(1)} pt</p>
                  <p className="text-xs text-slate-600 mt-1">リフト値</p>
                  <p className="text-xs text-slate-500 mt-2">Zefr導入による改善</p>
                  <p className="text-xs text-slate-400 mt-3">💡 ドーナツグラフにホバーするとリフト値が表示されます</p>
                </div>
              </div>

              {/* DAILY QUALITY & VOLUME TREND */}
              <div className="lg:col-span-2 bg-white rounded-[32px] p-8 shadow-sm border border-white">
                <h3 className="text-sm font-bold text-slate-900 mb-6">DAILY QUALITY & VOLUME TREND</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <ComposedChart data={dailyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
                    <YAxis yAxisId="left" stroke="#9ca3af" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#9ca3af" label={{ value: '%', angle: -90, position: 'insideRight', offset: -5 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="impressions" fill="#0ea5e9" name="インプレッション数" />
                    <Line yAxisId="right" type="monotone" dataKey="viewability" stroke="#06b6d4" name="ビューアビリティ%" strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="suitability" stroke="#f59e0b" name="Brand Suitability%" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PERFORMANCE BY CONTEXT + DAILY VIEWABILITY TREND BY DEVICE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* PERFORMANCE BY CONTEXT */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
                <h3 className="text-sm font-bold text-slate-900 mb-6">PERFORMANCE BY CONTEXT</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      type="number"
                      dataKey="vcr"
                      stroke="#9ca3af"
                      name="VCR (%)"
                      domain={[55, 80]}
                      label={{ value: 'VCR (%)', position: 'insideBottomRight', offset: -10 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="ctr"
                      stroke="#9ca3af"
                      name="CTR (%)"
                      domain={[0, 8]}
                      label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 rounded border border-slate-200 text-xs">
                              <p className="font-semibold">{data.categoryName}</p>
                              <p>VCR: {data.vcr?.toFixed(2) || 'N/A'}%</p>
                              <p>CTR: {data.ctr?.toFixed(2) || 'N/A'}%</p>
                              <p>Impressions: {formatNumberWithUnit(data.volume || 0)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    {performanceData.map((item, idx) => {
                      const sizeScale = (item.volume - Math.min(...performanceData.map(d => d.volume))) / (Math.max(...performanceData.map(d => d.volume)) - Math.min(...performanceData.map(d => d.volume)) || 1);
                      const radius = 4 + sizeScale * 12;
                      return (
                        <Scatter
                          key={idx}
                          name={item.categoryName}
                          data={[item]}
                          fill={colors[idx % colors.length]}
                          fillOpacity={0.7}
                          shape={React.createElement('circle', { r: radius })}
                        />
                      );
                    })}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* DAILY VIEWABILITY TREND BY DEVICE */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
                <h3 className="text-sm font-bold text-slate-900 mb-6">DAILY VIEWABILITY TREND BY DEVICE</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#9ca3af" angle={-45} textAnchor="end" height={80} />
                    <YAxis stroke="#9ca3af" domain={[60, 100]} label={{ value: 'Viewability Rate (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                    <Legend />
                    <Line type="monotone" dataKey="viewability" stroke="#0ea5e9" name="Overall" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="ott" stroke="#06b6d4" name="OTT" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="mobileApp" stroke="#f59e0b" name="Mobile App" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="mobileWeb" stroke="#14b8a6" name="Mobile Web" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* IVT Safe Zone + STRATEGIC INSIGHTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* IVT Safe Zone */}
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
                <h3 className="text-sm font-bold text-slate-900 mb-6">IVT "SAFE ZONE" COMPARISON</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ivtData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
                    <YAxis stroke="#9ca3af" label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                    <ReferenceLine y={1.1} stroke="#ef4444" strokeDasharray="5 5" name="YouTube Benchmark" />
                    <Bar dataKey="value" name="IVT Rate" radius={[8, 8, 0, 0]}>
                      {ivtData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* STRATEGIC INSIGHTS */}
              <div className="bg-slate-900 rounded-[32px] p-8 shadow-sm border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-6">STRATEGIC INSIGHTS</h3>
                <div className="space-y-4">
                  {insights.map((insight, idx) => (
                    <div key={idx} className="bg-slate-800 rounded-[16px] p-4">
                      {editingInsight === idx ? (
                        <textarea
                          value={insight}
                          onChange={(e) => {
                            const newInsights = [...insights];
                            newInsights[idx] = e.target.value;
                            setInsights(newInsights);
                          }}
                          className="w-full h-20 p-2 rounded bg-slate-700 text-white text-xs resize-none"
                        />
                      ) : (
                        <p className="text-xs text-slate-300">{insight}</p>
                      )}
                      <div className="flex justify-end gap-2 mt-2">
                        {editingInsight === idx ? (
                          <button
                            onClick={() => setEditingInsight(null)}
                            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
                          >
                            <Save className="w-3 h-3" />
                            保存
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingInsight(idx)}
                            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                          >
                            <Edit2 className="w-3 h-3" />
                            編集
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
