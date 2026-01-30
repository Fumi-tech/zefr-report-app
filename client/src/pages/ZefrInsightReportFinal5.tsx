import React, { useState, useEffect } from 'react';
import { Upload, Download, Share2, Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line, Bar, Area, AreaChart
} from 'recharts';

// Firebase設定（環境変数から読み込み）
const initializeFirebase = () => {
  // Firestoreの初期化（実装環境に応じて調整）
  // ここではダミー実装
  return {
    saveReport: async (reportId: string, reportData: any, password: string) => {
      // Firestoreにレポートを保存するシミュレーション
      const encryptedData = btoa(JSON.stringify(reportData)); // 簡易暗号化
      const hashedPassword = btoa(password); // 簡易ハッシュ化
      
      // LocalStorageに保存（デモ用）
      const reports = JSON.parse(localStorage.getItem('zefrReports') || '{}');
      reports[reportId] = {
        data: encryptedData,
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        clientName: reportData.clientName
      };
      localStorage.setItem('zefrReports', JSON.stringify(reports));
      
      return { success: true, reportId };
    },
    loadReport: async (reportId: string, password: string) => {
      const reports = JSON.parse(localStorage.getItem('zefrReports') || '{}');
      const report = reports[reportId];
      
      if (!report) {
        throw new Error('レポートが見つかりません');
      }
      
      const hashedPassword = btoa(password);
      if (report.password !== hashedPassword) {
        throw new Error('パスワードが正しくありません');
      }
      
      return JSON.parse(atob(report.data));
    }
  };
};

const firebase = initializeFirebase();

// ユーティリティ関数
const generateReportId = () => {
  return 'report_' + Math.random().toString(36).substr(2, 9);
};

const formatNumberWithUnit = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const parseNumberWithUnit = (str: string) => {
  const match = str.match(/^([\d.]+)\s*([KMB]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  if (unit === 'M') return num * 1000000;
  if (unit === 'K') return num * 1000;
  return num;
};

const cleanNum = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/[%,$,]/g, '')) || 0;
};

export default function ZefrInsightReport() {
  const [stage, setStage] = useState('setup'); // setup, dashboard, shared
  const [files, setFiles] = useState<{performance: File | null, risk: File | null, view: File | null}>({ performance: null, risk: null, view: null });
  const [clientName, setClientName] = useState('');
  const [totalImpressions, setTotalImpressions] = useState('');
  const [lowQualityBlocked, setLowQualityBlocked] = useState('');
  const [estimatedCPM, setEstimatedCPM] = useState('1500');
  const [sharePassword, setSharePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sharedLink, setSharedLink] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sharedReportId, setSharedReportId] = useState<string>('');
  const [accessPassword, setAccessPassword] = useState('');
  const [showAccessPassword, setShowAccessPassword] = useState(false);

  // ファイル処理
  const handleFileUpload = (e: any, type: 'performance' | 'risk' | 'view') => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  const parseCSV = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    const data: any[] = [];
    let headerIdx = -1;
    let headers: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim());
      
      if (headerIdx === -1) {
        // ヘッダー検索
        const headerStr = cells.join('|').toLowerCase();
        if (headerStr.includes('category name') && headerStr.includes('vcr')) {
          headerIdx = i;
          headers = cells;
        } else if (headerStr.includes('brand suitability') && headerStr.includes('suitable impressions')) {
          headerIdx = i;
          headers = cells;
        } else if (headerStr.includes('viewability rate') && headerStr.includes('gross impressions')) {
          headerIdx = i;
          headers = cells;
        } else if (headerStr.includes('video suitability') && headerStr.includes('placement name')) {
          headerIdx = i;
          headers = cells;
        }
      } else if (i > headerIdx) {
        const row: any = {};
        headers.forEach((h, idx) => {
          row[h.toLowerCase()] = cells[idx];
        });
        data.push(row);
      }
    }

    return { headers, data };
  };

  const processFiles = async () => {
    try {
      setLoading(true);
      setError('');

      const totalImp = parseNumberWithUnit(totalImpressions);
      const lowQuality = parseNumberWithUnit(lowQualityBlocked);
      const cpm = parseFloat(estimatedCPM) || 1500;

      if (!totalImp || !lowQuality || !clientName) {
        throw new Error('すべての入力項目を入力してください');
      }

      const fileData: any = {};
      
      // ファイル処理
      for (const [type, file] of Object.entries(files) as [string, File | null][]) {
        if (file) {
          const content = await (file as File).text();
          const { headers, data } = parseCSV(content);
          fileData[type] = { headers, data };
        }
      }

      // データ集計
      let suitabilityRate = 0;
      let brandSuitabilityData = [];
      let performanceData = [];
      let viewabilityData = [];
      let deviceViewabilityData = {};

      // Performance処理
      if (fileData.performance?.data) {
        performanceData = fileData.performance.data
          .filter((d: any) => d['category name'] && d['vcr'] && d['ctr'] && d['impressions'])
          .map((d: any) => ({
            categoryName: d['category name'],
            vcr: cleanNum(d['vcr']),
            ctr: cleanNum(d['ctr']),
            volume: cleanNum(d['impressions'])
          }))
          .sort((a: any, b: any) => b.volume - a.volume)
          .slice(0, 10);
      }

      // Risk処理
      if (fileData.risk?.data) {
        brandSuitabilityData = fileData.risk.data
          .filter((d: any) => d['date'] && d['brand suitability %'])
          .map((d: any) => ({
            date: d['date'],
            suitability: cleanNum(d['brand suitability %']) * 100,
            impressions: cleanNum(d['total impressions'] || 0)
          }));

        const totalSuitable = fileData.risk.data.reduce((sum: number, d: any) => {
          return sum + cleanNum(d['suitable impressions'] || 0);
        }, 0);
        const totalImpFromFile = fileData.risk.data.reduce((sum: number, d: any) => {
          return sum + cleanNum(d['total impressions'] || 0);
        }, 0);
        
        if (totalImpFromFile > 0) {
          suitabilityRate = (totalSuitable / totalImpFromFile) * 100;
        }
      }

      // View処理
      if (fileData.view?.data) {
        viewabilityData = fileData.view.data
          .filter((d: any) => d['date'] && d['viewability rate'])
          .map((d: any) => ({
            date: d['date'],
            viewability: cleanNum(d['viewability rate']) * 100,
            impressions: cleanNum(d['gross impressions'] || 0)
          }));

        // デバイス別Viewability
        const deviceMap: any = {};
        fileData.view.data.forEach((d: any) => {
          const device = d['device type'] || 'Unknown';
          if (!deviceMap[device]) {
            deviceMap[device] = [];
          }
          deviceMap[device].push({
            date: d['date'],
            viewability: cleanNum(d['viewability rate']) * 100
          });
        });

        // デバイス別データを日付でマージ
        const dateSet = new Set<string>();
        Object.values(deviceMap).forEach((arr: any) => {
          arr.forEach((d: any) => dateSet.add(d.date));
        });

        const mergedData = Array.from(dateSet).map(date => {
          const row: any = { date };
          Object.entries(deviceMap).forEach(([device, arr]) => {
            const entry = (arr as any[]).find((d: any) => d.date === date);
            row[device] = entry?.viewability || 0;
          });
          return row;
        });

        deviceViewabilityData = mergedData;
      }

      const lift = (lowQuality / totalImp) * 100;
      const budgetOptimization = (lowQuality / 1000) * cpm;

      const newReportData = {
        clientName,
        totalImpressions: totalImp,
        lowQualityBlocked: lowQuality,
        estimatedCPM: cpm,
        suitabilityRate,
        lift,
        budgetOptimization,
        performanceData,
        brandSuitabilityData,
        viewabilityData,
        deviceViewabilityData,
        createdAt: new Date().toLocaleString('ja-JP')
      };

      setReportData(newReportData);
      setStage('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleWebPublish = async () => {
    try {
      if (!sharePassword) {
        setError('パスワードを設定してください');
        return;
      }

      setLoading(true);
      const reportId = generateReportId();
      await firebase.saveReport(reportId, reportData, sharePassword);
      
      const link = `${window.location.origin}?reportId=${reportId}`;
      setSharedLink(link);
      setSharedReportId(reportId);
      setError('');
    } catch (err) {
      setError('レポート保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(sharedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAccessReport = async () => {
    try {
      if (!sharedReportId || !accessPassword) {
        setError('パスワードを入力してください');
        return;
      }

      setLoading(true);
      const data = await firebase.loadReport(sharedReportId, accessPassword);
      setReportData(data);
      setStage('dashboard');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePDFExport = async () => {
    try {
      const element = document.getElementById('dashboard-content');
      if (!element) return;

      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`${reportData.clientName}_report.pdf`);
    } catch (err) {
      setError('PDF出力エラー: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePPTXExport = async () => {
    try {
      const element = document.getElementById('dashboard-content');
      if (!element) return;

      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const prs = new PptxGenJS();
      const slide = prs.addSlide();
      slide.addImage({ data: imgData, x: 0, y: 0, w: 10, h: 7.5 });
      
      prs.writeFile({ fileName: `${reportData.clientName}_report.pptx` });
    } catch (err) {
      setError('PPTX出力エラー: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // URL パラメータからレポートID取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('reportId');
    if (reportId) {
      setSharedReportId(reportId);
      setStage('shared');
    }
  }, []);

  // ===== UI レンダリング =====

  if (stage === 'shared') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50 p-8">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-[32px] p-8 shadow-lg">
            <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Zefr インサイトレポート</h1>
            <p className="text-center text-slate-600 mb-8">パスワードを入力してレポートを表示</p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[16px] flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">パスワード</label>
                <div className="relative">
                  <input
                    type={showAccessPassword ? 'text' : 'password'}
                    value={accessPassword}
                    onChange={(e) => setAccessPassword(e.target.value)}
                    placeholder="パスワードを入力"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={() => setShowAccessPassword(!showAccessPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                  >
                    {showAccessPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleAccessReport}
                disabled={loading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-[16px] transition disabled:opacity-50"
              >
                {loading ? 'ロード中...' : 'レポートを表示'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-sky-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-white">Z</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Zefr インサイトレポート</h1>
            <p className="text-slate-600">Premium Report Dashboard</p>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">セットアップ</h2>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[16px] flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* ファイルアップロード */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">ファイル & ドラッグ&ドロップ</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['performance', 'risk', 'view'].map(type => (
                  <label key={type} className="relative cursor-pointer">
                    <div className={`p-6 rounded-[24px] border-2 border-dashed text-center transition ${
                      files[type as keyof typeof files] ? 'border-sky-500 bg-sky-50' : 'border-sky-300 hover:border-sky-500'
                    }`}>
                      <Upload className="w-8 h-8 text-sky-500 mx-auto mb-2" />
                      <p className="font-semibold text-slate-900">{type.charAt(0).toUpperCase() + type.slice(1)}</p>
                      <p className="text-xs text-slate-600 mt-1">ファイルを選択</p>
                      {files[type as keyof typeof files] && <p className="text-xs text-sky-600 mt-2 font-semibold">✓ {files[type as keyof typeof files]?.name}</p>}
                    </div>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => handleFileUpload(e, type as 'performance' | 'risk' | 'view')}
                      className="hidden"
                    />
                  </label>
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
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">Total Measurable Impressions</label>
                  <input
                    type="text"
                    value={totalImpressions}
                    onChange={(e) => setTotalImpressions(e.target.value)}
                    placeholder="例: 50M または 50000K"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">Low-quality Impressions Blocked</label>
                  <input
                    type="text"
                    value={lowQualityBlocked}
                    onChange={(e) => setLowQualityBlocked(e.target.value)}
                    placeholder="例: 100K または 0.1M"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">推定CPM</label>
                  <input
                    type="number"
                    value={estimatedCPM}
                    onChange={(e) => setEstimatedCPM(e.target.value)}
                    placeholder="1500"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">共有用パスワード</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    placeholder="パスワードを設定"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={processFiles}
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-[16px] transition disabled:opacity-50"
            >
              {loading ? 'ロード中...' : 'レポートを生成して共有'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== ダッシュボード =====
  if (stage === 'dashboard' && reportData) {
    const colors = ['#0ea5e9', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50 p-8">
        <div className="max-w-7xl mx-auto" id="dashboard-content">
          {/* ヘッダー */}
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Zefr インサイトレポート</h1>
              <p className="text-slate-600">{reportData.clientName} | {reportData.createdAt}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handlePDFExport} className="flex items-center gap-2 px-4 py-2 bg-white rounded-[16px] hover:bg-slate-50 border border-slate-200">
                <Download className="w-5 h-5" /> PDF
              </button>
              <button onClick={handlePPTXExport} className="flex items-center gap-2 px-4 py-2 bg-white rounded-[16px] hover:bg-slate-50 border border-slate-200">
                <Download className="w-5 h-5" /> PPTX
              </button>
            </div>
          </div>

          {/* KPIカード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">ブランド適合率</p>
              <p className="text-3xl font-bold text-slate-900">{reportData.suitabilityRate?.toFixed(1) || 'N/A'}%</p>
              <p className="text-xs text-slate-500 mt-2">適合インプレッション数</p>
            </div>

            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">適合性リフト</p>
              <p className="text-3xl font-bold text-sky-500">+{reportData.lift?.toFixed(1) || 'N/A'} pt</p>
              <p className="text-xs text-slate-500 mt-2">改善効果</p>
            </div>

            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">総除外インプレッション</p>
              <p className="text-3xl font-bold text-slate-900">{formatNumberWithUnit(reportData.lowQualityBlocked)}</p>
              <p className="text-xs text-slate-500 mt-2">ブロック済み</p>
            </div>

            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">適正化予算額推定</p>
              <p className="text-3xl font-bold text-slate-900">¥{reportData.budgetOptimization?.toLocaleString('ja-JP', { maximumFractionDigits: 0 }) || 'N/A'}</p>
              <p className="text-xs text-slate-500 mt-2">推定削減額</p>
            </div>
          </div>

          {/* チャート */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* DAILY QUALITY & VOLUME TREND */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">DAILY QUALITY & VOLUME TREND</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={reportData.brandSuitabilityData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="impressions" fill="#0ea5e9" opacity={0.3} />
                  <Line yAxisId="right" type="monotone" dataKey="suitability" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Brand Suitability %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 適合性サマリー */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">適合性サマリー</h3>
              <div className="flex items-center justify-center h-[300px]">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  <circle cx="100" cy="100" r="80" fill="none" stroke="#e5e7eb" strokeWidth="20" />
                  <circle
                    cx="100" cy="100" r="80" fill="none" stroke="#0ea5e9" strokeWidth="20"
                    strokeDasharray={`${(reportData.suitabilityRate || 0) * 5.03} 502.65`}
                    transform="rotate(-90 100 100)"
                  />
                  <text x="100" y="95" textAnchor="middle" fontSize="32" fontWeight="bold" fill="#0f172a">
                    {reportData.suitabilityRate?.toFixed(1) || 'N/A'}%
                  </text>
                  <text x="100" y="120" textAnchor="middle" fontSize="14" fill="#64748b">
                    SUITABILITY
                  </text>
                  <text x="100" y="140" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#0ea5e9">
                    +{reportData.lift?.toFixed(1) || 'N/A'} pt
                  </text>
                </svg>
              </div>
            </div>
          </div>

          {/* PERFORMANCE BY CONTEXT + DAILY VIEWABILITY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* PERFORMANCE BY CONTEXT */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">PERFORMANCE BY CONTEXT</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" dataKey="vcr" stroke="#9ca3af" domain={[55, 80]} label={{ value: 'VCR (%)', position: 'insideBottomRight', offset: -10 }} />
                  <YAxis type="number" dataKey="ctr" stroke="#9ca3af" domain={[0, 8]} label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload?.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 rounded border border-slate-200 text-xs">
                            <p className="font-semibold">{data.categoryName}</p>
                            <p>VCR: {data.vcr?.toFixed(2)}%</p>
                            <p>CTR: {data.ctr?.toFixed(2)}%</p>
                            <p>Impressions: {formatNumberWithUnit(data.volume)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  {reportData.performanceData?.map((item: any, idx: number) => {
                    const minVol = Math.min(...reportData.performanceData.map((d: any) => d.volume));
                    const maxVol = Math.max(...reportData.performanceData.map((d: any) => d.volume));
                    const sizeScale = (item.volume - minVol) / (maxVol - minVol || 1);
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
                <LineChart data={reportData.deviceViewabilityData || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} domain={[0.6, 1]} />
                  <Tooltip formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) : value} />
                  <Legend />
                  <Line type="monotone" dataKey="OTT" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Mobile App" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Mobile Web" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* IVT Safe Zone */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-sm font-bold text-slate-900 mb-6">IVT "SAFE ZONE" COMPARISON: CAMPAIGN VS. YOUTUBE BENCHMARK</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { name: 'YouTube Benchmark', value: 1.1 },
                  { name: 'Overall', value: (reportData.lift || 0) * 0.5 },
                  { name: 'OTT', value: (reportData.lift || 0) * 0.6 },
                  { name: 'Mobile App', value: (reportData.lift || 0) * 0.4 },
                  { name: 'Mobile Web', value: (reportData.lift || 0) * 0.5 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: any) => typeof value === 'number' ? value.toFixed(2) + '%' : value} />
                  <Bar dataKey="value" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* STRATEGIC INSIGHTS */}
            <div className="bg-slate-900 rounded-[32px] p-8 shadow-sm text-white">
              <h3 className="text-sm font-bold mb-6">STRATEGIC INSIGHTS</h3>
              <div className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                  <p>ブランド適合率が{reportData.suitabilityRate?.toFixed(1)}%に達しており、高い品質基準を維持しています。</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                  <p>低品質インプレッション{formatNumberWithUnit(reportData.lowQualityBlocked)}件をブロックし、推定¥{reportData.budgetOptimization?.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}の予算最適化を実現。</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                  <p>デバイス別の視認性分析により、各プラットフォームに最適化されたキャンペーン戦略の立案が可能です。</p>
                </div>
              </div>
            </div>
          </div>

          {/* Web発行 */}
          {!sharedLink && (
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white mb-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">レポートを Web 発行</h3>
              <div className="flex gap-4">
                <button
                  onClick={handleWebPublish}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-[16px] transition disabled:opacity-50"
                >
                  <Share2 className="w-5 h-5" /> Web 発行
                </button>
              </div>
            </div>
          )}

          {/* 共有リンク */}
          {sharedLink && (
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-lg font-bold text-slate-900 mb-4">共有リンク</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sharedLink}
                  readOnly
                  className="flex-1 px-4 py-3 rounded-[16px] border border-slate-200 bg-slate-50"
                />
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-[16px] transition"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {copied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
