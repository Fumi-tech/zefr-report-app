import { useState, useRef } from 'react';
import {
  Copy,
  Download,
  FileText,
  TrendingUp,
  Users,
  DollarSign,
  Edit2,
  Save,
  X,
  BarChart3,
  PieChart as PieChartIcon,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ProcessedData, cleanNum } from '@/lib/csvProcessor';
import {
  ComposedChart,
  LineChart,
  PieChart,
  ScatterChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  Bar,
  Pie,
  Cell,
  Scatter,
} from 'recharts';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';

interface DashboardProps {
  data: ProcessedData;
  reportId?: string;
  onBackToUpload: () => void;
}

/**
 * Dashboard コンポーネント
 * 
 * デザイン: モダンプロフェッショナル・データドリブン
 * - KPIカード（左側）
 * - チャート（右側）
 * - インサイトパネル
 * - エクスポート機能
 */
export default function Dashboard({
  data,
  reportId,
  onBackToUpload,
}: DashboardProps) {
  const [editingInsights, setEditingInsights] = useState(false);
  const [insights, setInsights] = useState(data.insights);
  const [tempInsights, setTempInsights] = useState(data.insights);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const handleEditInsights = () => {
    setEditingInsights(true);
    setTempInsights([...insights]);
  };

  const handleSaveInsights = () => {
    setInsights([...tempInsights]);
    setEditingInsights(false);
    toast.success('インサイトが更新されました');
  };

  const handleCancelEdit = () => {
    setEditingInsights(false);
    setTempInsights([...insights]);
  };

  const handleCopyShareUrl = async () => {
    if (!reportId) return;
    const shareUrl = `${window.location.origin}?report=${reportId}`;
    await navigator.clipboard.writeText(shareUrl);
    toast.success('共有URLをコピーしました');
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`zefr-report-${reportId || 'export'}.pdf`);

      toast.success('PDFをダウンロードしました');
    } catch (error) {
      toast.error('PDF出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPPTX = async () => {
    try {
      setIsExporting(true);

      const prs = new PptxGenJS();

      // タイトルスライド
      const slide1 = prs.addSlide();
      slide1.background = { color: '0ea5e9' };
      slide1.addText('Zefr インサイトレポート', {
        x: 0.5,
        y: 2,
        w: 9,
        h: 1,
        fontSize: 44,
        bold: true,
        color: 'FFFFFF',
      });
      slide1.addText(data.accountName, {
        x: 0.5,
        y: 3.2,
        w: 9,
        h: 0.5,
        fontSize: 24,
        color: 'FFFFFF',
      });

      // KPIスライド
      const slide2 = prs.addSlide();
      slide2.background = { color: 'FFFFFF' };
      slide2.addText('主要指標（KPI）', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.5,
        fontSize: 28,
        bold: true,
        color: '1e293b',
      });

      const kpiData = [
        {
          label: 'ブランド適合性',
          value: `${data.kpis.finalSuitability}%`,
          color: '10b981',
        },
        {
          label: 'ビューアビリティリフト',
          value: `${data.kpis.lift}%`,
          color: '0ea5e9',
        },
        {
          label: '総除外インプレッション',
          value: data.kpis.totalExclusions.toLocaleString(),
          color: 'f59e0b',
        },
        {
          label: '予算最適化額',
          value: `¥${data.kpis.budgetOptimization.toLocaleString()}`,
          color: '06b6d4',
        },
      ];

      let yPos = 1.2;
      kpiData.forEach((kpi) => {
        slide2.addShape(prs.ShapeType.rect, {
          x: 0.5,
          y: yPos,
          w: 9,
          h: 0.8,
          fill: { color: kpi.color },
          line: { color: kpi.color },
        });
        slide2.addText(kpi.label, {
          x: 0.7,
          y: yPos + 0.1,
          w: 4,
          h: 0.6,
          fontSize: 14,
          bold: true,
          color: 'FFFFFF',
        });
        slide2.addText(kpi.value, {
          x: 5.2,
          y: yPos + 0.1,
          w: 4,
          h: 0.6,
          fontSize: 18,
          bold: true,
          color: 'FFFFFF',
        });
        yPos += 1;
      });

      // インサイトスライド
      const slide3 = prs.addSlide();
      slide3.background = { color: 'FFFFFF' };
      slide3.addText('インサイト', {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.5,
        fontSize: 28,
        bold: true,
        color: '1e293b',
      });

      let insightY = 1.2;
      insights.forEach((insight, index) => {
        slide3.addText(`${index + 1}. ${insight}`, {
          x: 0.5,
          y: insightY,
          w: 9,
          h: 1.2,
          fontSize: 12,
          color: '475569',
          wrap: true,
        });
        insightY += 1.4;
      });

      await prs.writeFile({ fileName: `zefr-report-${reportId || 'export'}.pptx` });
      toast.success('PowerPointをダウンロードしました');
    } catch (error) {
      toast.error('PowerPoint出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  // チャート用データ生成
  const generateChartData = () => {
    if (data.performance && data.performance.length > 0) {
      return data.performance.slice(0, 10).map((row, index) => {
        const categoryName = row['Category Name'] || row['category name'] || `カテゴリ${index + 1}`;
        const vcr = cleanNum(row['VCR'] || row['vcr'] || 0);
        const impressions = cleanNum(row['Impressions'] || row['impressions'] || 0);
        
        return {
          name: String(categoryName).substring(0, 10),
          quality: vcr,
          volume: Math.round(impressions / 1000),
        };
      });
    }
    
    return [
      { name: 'データ', quality: 0, volume: 0 },
    ];
  };

  const chartData = generateChartData();

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">
            {data.accountName}
          </h2>
          <p className="text-slate-600 mt-1">
            レポート期間: {data.reportingPeriod}
          </p>
        </div>

        <div className="flex gap-2">
          {reportId && (
            <Button
              onClick={handleCopyShareUrl}
              variant="outline"
              className="gap-2"
            >
              <Copy className="w-4 h-4" />
              共有URL
            </Button>
          )}
          <Button
            onClick={handleExportPDF}
            disabled={isExporting}
            variant="outline"
            className="gap-2"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            PDF
          </Button>
          <Button
            onClick={handleExportPPTX}
            disabled={isExporting}
            variant="outline"
            className="gap-2"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            PPTX
          </Button>
        </div>
      </div>

      {/* メインダッシュボード */}
      <div ref={dashboardRef} className="space-y-8 bg-white p-8 rounded-xl border border-sky-200">
        {/* KPIカード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* ブランド適合性 */}
          <Card className="p-6 bg-gradient-to-br from-emerald-50 to-green-50 border-green-200 border-l-4 border-l-green-500">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-semibold text-slate-600">
                ブランド適合性
              </span>
              <Users className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold text-green-700">
              {data.kpis.finalSuitability}%
            </p>
            <p className="text-xs text-slate-500 mt-2">
              適正なインプレッション率
            </p>
          </Card>

          {/* ビューアビリティリフト */}
          <Card className="p-6 bg-gradient-to-br from-cyan-50 to-blue-50 border-blue-200 border-l-4 border-l-cyan-500">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-semibold text-slate-600">
                ビューアビリティリフト
              </span>
              <TrendingUp className="w-5 h-5 text-cyan-500" />
            </div>
            <p className="text-3xl font-bold text-cyan-700">
              {data.kpis.lift}%
            </p>
            <p className="text-xs text-slate-500 mt-2">
              視認性の向上率
            </p>
          </Card>

          {/* 総除外インプレッション */}
          <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-orange-200 border-l-4 border-l-amber-500">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-semibold text-slate-600">
                総除外インプレッション
              </span>
              <BarChart3 className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-amber-700">
              {data.kpis.totalExclusions.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              ブロック済みインプレッション
            </p>
          </Card>

          {/* 予算最適化額 */}
          <Card className="p-6 bg-gradient-to-br from-sky-50 to-cyan-50 border-cyan-200 border-l-4 border-l-sky-500">
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-semibold text-slate-600">
                予算最適化額
              </span>
              <DollarSign className="w-5 h-5 text-sky-500" />
            </div>
            <p className="text-3xl font-bold text-sky-700">
              ¥{data.kpis.budgetOptimization.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              推定削減可能額
            </p>
          </Card>
        </div>

        {/* チャート */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 品質・ボリュームトレンド */}
          <Card className="p-6 bg-white border-sky-200">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-500" />
              品質・ボリュームトレンド
            </h3>
            {chartData.length > 0 && chartData[0].quality > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="quality" fill="#0ea5e9" name="品質スコア" />
                  <Line
                    type="monotone"
                    dataKey="volume"
                    stroke="#10b981"
                    name="ボリューム"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                データが利用できません
              </div>
            )}
          </Card>

          {/* 品質リフトサマリー */}
          <Card className="p-6 bg-white border-sky-200">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-cyan-500" />
              品質リフトサマリー
            </h3>
            {data.kpis.finalSuitability > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: '適正',
                        value: data.kpis.finalSuitability,
                      },
                      {
                        name: '改善余地',
                        value: 100 - data.kpis.finalSuitability,
                      },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                    outerRadius={100}
                    fill="#0ea5e9"
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                データが利用できません
              </div>
            )}
          </Card>
        </div>

        {/* インサイトパネル */}
        <Card className="p-6 bg-gradient-to-br from-sky-50 to-cyan-50 border-sky-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 text-lg">
              自動生成インサイト
            </h3>
            {!editingInsights && (
              <Button
                onClick={handleEditInsights}
                variant="ghost"
                size="sm"
                className="gap-2"
              >
                <Edit2 className="w-4 h-4" />
                編集
              </Button>
            )}
          </div>

          {editingInsights ? (
            <div className="space-y-3">
              {tempInsights.map((insight, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-slate-600 font-semibold flex-shrink-0 w-6">
                    {index + 1}.
                  </span>
                  <textarea
                    value={insight}
                    onChange={(e) => {
                      const newInsights = [...tempInsights];
                      newInsights[index] = e.target.value;
                      setTempInsights(newInsights);
                    }}
                    className="flex-1 border border-sky-200 rounded px-3 py-2 focus:border-cyan-500 focus:outline-none"
                    rows={3}
                  />
                </div>
              ))}

              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleSaveInsights}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 gap-2"
                >
                  <Save className="w-4 h-4" />
                  保存
                </Button>
                <Button
                  onClick={handleCancelEdit}
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <X className="w-4 h-4" />
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((insight, index) => (
                <div
                  key={index}
                  className="flex gap-3 p-3 bg-white rounded-lg border border-sky-200"
                >
                  <span className="text-cyan-600 font-bold flex-shrink-0 w-6">
                    {index + 1}.
                  </span>
                  <p className="text-slate-700">{insight}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* フッターボタン */}
      <div className="flex gap-3">
        <Button
          onClick={onBackToUpload}
          variant="outline"
          className="flex-1"
        >
          新規レポート作成
        </Button>
      </div>
    </div>
  );
}
