import React, { useState, useRef, useMemo } from 'react';
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
 * 数値をK/M単位で表示
 */
const formatNumberWithUnit = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return Math.round(num).toString();
};

export default function ZefrInsightReportFinal3() {
  const [step, setStep] = useState<'setup' | 'dashboard' | 'share'>('setup');
  const [files, setFiles] = useState<Map<string, any[]>>(new Map());
  const [clientName, setClientName] = useState('');
  const [totalMeasurable, setTotalMeasurable] = useState('');
  const [lowQualityBlocked, setLowQualityBlocked] = useState('');
  const [estimatedCPM, setEstimatedCPM] = useState('1500');
  const [sharePassword, setSharePassword] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [strategicInsight, setStrategicInsight] = useState('');
  const [isEditingInsight, setIsEditingInsight] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (uploadedFiles: File[]) => {
    const newFiles = new Map(files);
    
    uploadedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let data: any[] = [];
          
          if (file.name.endsWith('.csv')) {
            const text = e.target?.result as string;
            const parsed = Papa.parse(text, { header: true });
            data = parsed.data.filter((row: any) => Object.values(row).some(v => v !== null && v !== ''));
          } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(worksheet);
          }
          
          // ファイルタイプを自動判別
          let fileType = 'unknown';
          const dataStr = JSON.stringify(data).toUpperCase();
          
          if (dataStr.includes('CATEGORY NAME') && dataStr.includes('VCR')) {
            fileType = 'performance';
          } else if (dataStr.includes('BRAND SUITABILITY') && dataStr.includes('SUITABLE IMPRESSIONS')) {
            fileType = 'suitability';
          } else if (dataStr.includes('VIEWABILITY RATE') && dataStr.includes('GROSS IMPRESSIONS')) {
            fileType = 'view';
          } else if (dataStr.includes('VIDEO SUITABILITY') && dataStr.includes('PLACEMENT NAME')) {
            fileType = 'risk';
          }
          
          if (fileType !== 'unknown') {
            newFiles.set(fileType, data);
          }
        } catch (error) {
          console.error('ファイル処理エラー:', error);
        }
      };
      
      if (file.name.endsWith('.csv')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
    
    setFiles(newFiles);
  };

  const removeFile = (fileType: string) => {
    const newFiles = new Map(files);
    newFiles.delete(fileType);
    setFiles(newFiles);
  };

  // KPI計算
  const kpis = useMemo(() => {
    const suitabilityData = Array.from(files.get('suitability') || []);
    const viewData = Array.from(files.get('view') || []);

    // ブランド適合率計算
    let finalSuitability = 0;
    if (suitabilityData.length > 0) {
      const suitableImpressions = suitabilityData.reduce((sum, row) => {
        const val = cleanNum(row['Suitable Impressions'] || 0);
        return sum + val;
      }, 0);
      
      const totalImpressions = suitabilityData.reduce((sum, row) => {
        const val = cleanNum(row['Total Impressions'] || 0);
        return sum + val;
      }, 0);
      
      if (totalImpressions > 0) {
        finalSuitability = (suitableImpressions / totalImpressions) * 100;
      }
    }

    // 適合性リフト計算
    const totalMeasurableNum = cleanNum(totalMeasurable);
    const lowQualityNum = cleanNum(lowQualityBlocked);
    const suitabilityLift = totalMeasurableNum > 0 ? (lowQualityNum / totalMeasurableNum) * 100 : 0;

    // 総除外インプレッション
    const totalExclusions = lowQualityNum;

    // 予算最適化額
    const cpmNum = cleanNum(estimatedCPM);
    const budgetOptimization = (lowQualityNum / 1000) * cpmNum;

    return {
      finalSuitability,
      suitabilityLift,
      totalExclusions,
      budgetOptimization,
    };
  }, [files, totalMeasurable, lowQualityBlocked, estimatedCPM]);

  // DAILY QUALITY & VOLUME TRENDデータ
  const dailyTrendData = useMemo(() => {
    const viewData = Array.from(files.get('view') || []);
    const dateMap = new Map<string, any>();

    viewData.forEach(row => {
      const date = row['Report Date'] || '';
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          date: date,
          viewability: 0,
          impressions: 0,
          suitability: 0,
          count: 0,
        });
      }
      const entry = dateMap.get(date);
      const viewabilityVal = cleanNum(row['Viewability Rate'] || 0);
      const suitabilityVal = cleanNum(row['Brand Suitability %'] || 0);
      const impressionsVal = cleanNum(row['Gross Impressions'] || 0);
      
      entry.viewability += viewabilityVal;
      entry.impressions += impressionsVal;
      entry.suitability += suitabilityVal;
      entry.count += 1;
    });

    return Array.from(dateMap.values())
      .map(entry => ({
        ...entry,
        viewability: entry.count > 0 ? entry.viewability / entry.count : 0,
        suitability: entry.count > 0 ? Math.min(100, (entry.suitability / entry.count) * 100) : 0,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);
  }, [files]);

  // PERFORMANCE BY CONTEXTデータ（上位10カテゴリ）
  const performanceChartData = useMemo(() => {
    const performanceData = Array.from(files.get('performance') || []);
    
    if (performanceData.length === 0) return [];
    
    // インプレッション数でソート
    const sorted = performanceData
      .map((row, index) => ({
        categoryName: row['Category Name'] || `カテゴリ${index + 1}`,
        vcr: Math.max(0, Math.min(100, cleanNum(row['VCR'] || 0))),
        ctr: Math.max(0, Math.min(100, cleanNum(row['CTR'] || 0))),
        volume: cleanNum(row['Available Impressions'] || 0),
      }))
      .filter(item => item.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    // 最大ボリュームを取得してスケーリング
    const maxVolume = Math.max(...sorted.map(item => item.volume), 1);
    const minVolume = Math.min(...sorted.map(item => item.volume), 1);
    const volumeRange = maxVolume - minVolume || 1;

    return sorted.map((item, idx) => ({
      ...item,
      name: String(item.categoryName).substring(0, 12),
      // バブルサイズ用（5-25の範囲にスケーリング）
      size: 5 + ((item.volume - minVolume) / volumeRange) * 20,
    }));
  }, [files]);

  // Daily Viewability Trend by Deviceデータ
  const deviceTrendData = useMemo(() => {
    const viewData = Array.from(files.get('view') || []);
    const dateMap = new Map<string, Map<string, { viewability: number; count: number }>>();

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
          if (deviceEntry && deviceEntry.count > 0) {
            entry[device] = Math.round((deviceEntry.viewability / deviceEntry.count) * 10000) / 10000;
          }
        });
        return entry;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);

    return result.length > 0 ? result : [{ date: '2026-01-01' }];
  }, [files]);

  // IVTデータ（Overall、デバイス別）
  const ivtData = useMemo(() => {
    const riskData = Array.from(files.get('risk') || []);
    const deviceMap = new Map<string, { unsuitable: number; total: number }>();
    let totalUnsuitable = 0;
    let totalImpressions = 0;

    riskData.forEach(row => {
      const device = row['Device Type'] || 'Overall';
      const unsuitable = row['Video Suitability'] === 'Unsuitable' ? 1 : 0;
      const impressions = cleanNum(row['Impressions'] || 0);
      
      totalImpressions += impressions;
      if (unsuitable) {
        totalUnsuitable += impressions;
      }
      
      if (!deviceMap.has(device)) {
        deviceMap.set(device, { unsuitable: 0, total: 0 });
      }
      const entry = deviceMap.get(device);
      if (entry) {
        entry.total += impressions;
        if (unsuitable) {
          entry.unsuitable += impressions;
        }
      }
    });

    const result = [];
    
    // YouTube Benchmark
    result.push({ name: 'YouTube Benchmark', value: 1.1, type: 'benchmark', color: '#ef4444' });
    
    // Overall
    if (totalImpressions > 0) {
      const overallRate = (totalUnsuitable / totalImpressions) * 100;
      result.push({ name: 'Overall', value: overallRate, type: 'campaign', color: '#0ea5e9' });
    }
    
    // デバイス別
    const deviceColors = ['#06b6d4', '#f59e0b', '#10b981', '#8b5cf6'];
    let colorIdx = 0;
    Array.from(deviceMap.entries()).forEach(([device, data]) => {
      if (data.total > 0) {
        const rate = (data.unsuitable / data.total) * 100;
        result.push({ 
          name: device, 
          value: rate, 
          type: 'device',
          color: deviceColors[colorIdx % deviceColors.length]
        });
        colorIdx++;
      }
    });

    return result;
  }, [files]);

  // 配信期間取得
  const reportingPeriod = useMemo(() => {
    const viewData = Array.from(files.get('view') || []);
    if (viewData.length === 0) return '';
    
    const dates = viewData
      .map(row => row['Report Date'])
      .filter(Boolean)
      .sort();
    
    if (dates.length === 0) return '';
    return `${dates[0]} - ${dates[dates.length - 1]}`;
  }, [files]);

  // Strategic Insightの自動生成
  const autoGeneratedInsight = useMemo(() => {
    if (!strategicInsight) {
      const insights = [];
      
      if (kpis.finalSuitability > 90) {
        insights.push(`✓ ブランド適合率が${kpis.finalSuitability.toFixed(1)}%と高い水準を維持しており、Zefrの効果が顕著です。`);
      }
      
      if (kpis.suitabilityLift > 5) {
        insights.push(`✓ 適合性リフト${kpis.suitabilityLift.toFixed(1)}ptの改善により、低品質インプレッションの削減効果が確認されました。`);
      }
      
      if (kpis.budgetOptimization > 0) {
        insights.push(`✓ 推定予算最適化額¥${kpis.budgetOptimization.toLocaleString()}の削減が見込まれます。`);
      }
      
      return insights.length > 0 
        ? insights.join('\n\n')
        : '各指標を分析中です。データをアップロードしてください。';
    }
    return strategicInsight;
  }, [strategicInsight, kpis]);

  // PDF出力
  const exportPDF = async () => {
    if (!dashboardRef.current) return;
    
    try {
      const element = dashboardRef.current;
      const canvas = await (window as any).html2canvas(element, { 
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = (window as any).jsPDF;
      const pdfDoc = new pdf('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdfDoc.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdfDoc.save(`${clientName || 'report'}.pdf`);
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDF出力に失敗しました。もう一度お試しください。');
    }
  };

  // PPTX出力
  const exportPPTX = async () => {
    if (!dashboardRef.current) return;
    
    try {
      const element = dashboardRef.current;
      const canvas = await (window as any).html2canvas(element, { 
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const PptxGenJS = (window as any).PptxGenJS;
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
    } catch (error) {
      console.error('PPTX出力エラー:', error);
      alert('PPTX出力に失敗しました。もう一度お試しください。');
    }
  };

  // Web発行
  const publishWeb = () => {
    if (!sharePassword) {
      alert('パスワードを設定してください');
      return;
    }
    
    const reportId = Math.random().toString(36).substring(7);
    const link = `${window.location.origin}?reportId=${reportId}&password=${btoa(sharePassword)}`;
    setShareLink(link);
    setStep('share');
  };

  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xl">Z</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Zefr インサイトレポート</h1>
              <p className="text-sm text-slate-600">Premium Report Dashboard</p>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-6">ファイル & ドラッグ&ドロップ</h2>
            
            <div
              className="border-2 border-dashed border-cyan-300 rounded-[24px] p-8 text-center mb-6 cursor-pointer hover:bg-cyan-50 transition"
              onDrop={(e) => {
                e.preventDefault();
                handleFileUpload(Array.from(e.dataTransfer.files));
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload className="w-12 h-12 text-cyan-500 mx-auto mb-3" />
              <p className="text-slate-900 font-semibold mb-1">ファイルをドラッグ&ドロップ</p>
              <p className="text-xs text-slate-500">またはクリックしてファイルを選択</p>
              <p className="text-xs text-slate-500 mt-2">対応形式: CSV, XLSX, XLS</p>
              
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFileUpload(Array.from(e.target.files || []))}
                className="hidden"
                id="file-input"
              />
            </div>

            {files.size > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">読み込まれたファイル</h3>
                <div className="space-y-2">
                  {Array.from(files.entries()).map(([type, data]) => (
                    <div key={type} className="flex items-center justify-between bg-cyan-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-slate-900">{type} ({data.length} rows)</span>
                      </div>
                      <button
                        onClick={() => removeFile(type)}
                        className="text-slate-500 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">クライアント名</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="例: SoftBank Corp."
                  className="w-full px-4 py-3 rounded-[24px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Total Measurable Impressions</label>
                <input
                  type="text"
                  value={totalMeasurable}
                  onChange={(e) => setTotalMeasurable(e.target.value)}
                  placeholder="例: 50M または 50000K"
                  className="w-full px-4 py-3 rounded-[24px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">Low-quality Impressions Blocked</label>
                <input
                  type="text"
                  value={lowQualityBlocked}
                  onChange={(e) => setLowQualityBlocked(e.target.value)}
                  placeholder="例: 100K または 0.1M"
                  className="w-full px-4 py-3 rounded-[24px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">推定CPM</label>
                <input
                  type="text"
                  value={estimatedCPM}
                  onChange={(e) => setEstimatedCPM(e.target.value)}
                  placeholder="例: 1500"
                  className="w-full px-4 py-3 rounded-[24px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">共有用パスワード</label>
                <input
                  type="password"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  placeholder="レポート共有時のパスワード"
                  className="w-full px-4 py-3 rounded-[24px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <button
              onClick={() => setStep('dashboard')}
              className="w-full mt-6 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-[24px] transition"
            >
              レポートを生成
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'share') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">レポートが発行されました</h2>
            <p className="text-slate-600 mb-6">以下のリンクを共有してください：</p>
            
            <div className="bg-slate-50 p-4 rounded-[16px] mb-6 break-all">
              <p className="text-sm text-slate-900 font-mono">{shareLink}</p>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(shareLink);
                alert('リンクをコピーしました');
              }}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 rounded-[24px] mb-3 transition"
            >
              リンクをコピー
            </button>

            <button
              onClick={() => setStep('dashboard')}
              className="w-full bg-slate-200 hover:bg-slate-300 text-slate-900 font-bold py-3 rounded-[24px] transition"
            >
              ダッシュボードに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{clientName || 'Zefr インサイトレポート'}</h1>
            <p className="text-sm text-slate-600 mt-1">Reporting Period: {reportingPeriod}</p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 font-semibold py-2 px-4 rounded-[24px] border border-slate-200 transition"
            >
              <FileText className="w-4 h-4" />
              PDF発行
            </button>
            <button
              onClick={exportPPTX}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-900 font-semibold py-2 px-4 rounded-[24px] border border-slate-200 transition"
            >
              <Download className="w-4 h-4" />
              PPTX発行
            </button>
            <button
              onClick={publishWeb}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-2 px-4 rounded-[24px] transition"
            >
              <Share2 className="w-4 h-4" />
              Web発行
            </button>
          </div>
        </div>

        {/* ダッシュボード */}
        <div ref={dashboardRef} className="space-y-6">
          {/* KPIカード */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
              <p className="text-xs font-semibold text-slate-500 mb-2">ブランド適合率</p>
              <p className="text-4xl font-bold text-slate-900 mb-1">
                {kpis.finalSuitability.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500">適合インプレッション率</p>
            </div>

            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
              <p className="text-xs font-semibold text-slate-500 mb-2">適合性リフト</p>
              <p className="text-4xl font-bold text-slate-900 mb-1">
                +{kpis.suitabilityLift.toFixed(1)} pt
              </p>
              <p className="text-xs text-slate-500">基準値からの変化</p>
            </div>

            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
              <p className="text-xs font-semibold text-slate-500 mb-2">総除外インプレッション</p>
              <p className="text-4xl font-bold text-slate-900 mb-1">
                {formatNumberWithUnit(kpis.totalExclusions)}
              </p>
              <p className="text-xs text-slate-500">ブロック済みインプレッション</p>
            </div>

            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white hover:shadow-md transition-all">
              <p className="text-xs font-semibold text-slate-500 mb-2">予算最適化額推定</p>
              <p className="text-4xl font-bold text-slate-900 mb-1">
                ¥{kpis.budgetOptimization.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">推定削減可能額</p>
            </div>
          </div>

          {/* チャートセクション1 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 適合率サマリー */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">適合率サマリー</h3>
              <div className="flex justify-center mb-4">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg viewBox="0 0 200 200" className="w-full h-full">
                    {/* 背景円 */}
                    <circle cx="100" cy="100" r="90" fill="none" stroke="#e5e7eb" strokeWidth="30" />
                    {/* 適合率円 */}
                    <circle
                      cx="100"
                      cy="100"
                      r="90"
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="30"
                      strokeDasharray={`${(kpis.finalSuitability / 100) * 565.48} 565.48`}
                      strokeLinecap="round"
                      transform="rotate(-90 100 100)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold text-slate-900">{kpis.finalSuitability.toFixed(1)}%</p>
                    <p className="text-xs text-slate-500 mt-1">適合率</p>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-[16px] p-4 mt-4">
                  <p className="text-2xl font-bold text-cyan-600">
                    +{kpis.suitabilityLift.toFixed(1)} pt
                  </p>
                  <p className="text-xs text-slate-600 mt-1">リフト値</p>
                  <p className="text-xs text-slate-500 mt-2">Zefr導入による改善</p>
                </div>
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
                  <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" label={{ value: '%', angle: -90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="impressions" fill="#0ea5e9" name="インプレッション数" />
                  <YAxis yAxisId="right" domain={[0, 100]} label={{ value: '%', angle: -90, position: 'insideRight', offset: -5 }} stroke="#9ca3af" />
                  <Line yAxisId="right" type="monotone" dataKey="viewability" stroke="#06b6d4" name="ビューアビリティ" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="suitability" stroke="#f59e0b" name="Brand Suitability%" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* チャートセクション2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PERFORMANCE BY CONTEXT */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">PERFORMANCE BY CONTEXT</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart data={performanceChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="vcr" stroke="#9ca3af" name="VCR" label={{ value: 'VCR (%)', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis dataKey="ctr" stroke="#9ca3af" name="CTR" label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 rounded border border-slate-200 text-xs">
                            <p className="font-semibold">{data.categoryName}</p>
                            <p>VCR: {data.vcr.toFixed(2)}%</p>
                            <p>CTR: {data.ctr.toFixed(2)}%</p>
                            <p>Impressions: {formatNumberWithUnit(data.volume)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  {performanceChartData.map((item, idx) => {
                    const sizeScale = (item.volume - Math.min(...performanceChartData.map(d => d.volume))) / (Math.max(...performanceChartData.map(d => d.volume)) - Math.min(...performanceChartData.map(d => d.volume)) || 1);
                    const radius = 4 + sizeScale * 12;
                    return (
                      <Scatter
                        key={idx}
                        name={item.name}
                        data={[item]}
                        fill="#0ea5e9"
                        fillOpacity={0.6 + sizeScale * 0.3}
                        shape={<circle r={radius} />}
                      />
                    );
                  })}
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
          </div>

          {/* チャートセクション3 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* IVT Safe Zone */}
            <div className="lg:col-span-2 bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">IVT "SAFE ZONE" COMPARISON: CAMPAIGN VS. YOUTUBE BENCHMARK</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={ivtData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
                  <YAxis stroke="#9ca3af" label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                  <Legend />
                  <ReferenceLine y={1.1} stroke="#ef4444" strokeDasharray="5 5" name="YouTube Benchmark" />
                  <Bar dataKey="value" name="IVT Rate" radius={[8, 8, 0, 0]}>
                    {ivtData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || '#0ea5e9'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* STRATEGIC INSIGHTS */}
            <div className="bg-slate-900 rounded-[32px] p-8 shadow-sm border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">STRATEGIC INSIGHTS</h3>
                <button
                  onClick={() => setIsEditingInsight(!isEditingInsight)}
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  {isEditingInsight ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </button>
              </div>
              
              {isEditingInsight ? (
                <textarea
                  value={strategicInsight}
                  onChange={(e) => setStrategicInsight(e.target.value)}
                  className="w-full h-32 p-4 bg-slate-800 text-white rounded-[16px] border border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-xs"
                  placeholder="戦略的インサイトを入力してください..."
                />
              ) : (
                <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">
                  {autoGeneratedInsight}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="mt-8 flex gap-2 justify-center">
          <button
            onClick={() => setStep('setup')}
            className="bg-white hover:bg-slate-50 text-slate-900 font-semibold py-2 px-6 rounded-[24px] border border-slate-200 transition"
          >
            セットアップに戻る
          </button>
        </div>
      </div>
    </div>
  );
}
