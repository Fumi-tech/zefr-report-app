import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Upload, Lock, Copy, Download, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { parseCSVFile, processReports, ProcessedData, ZefrReport } from '@/lib/csvProcessor';
import { saveReport, getReportWithPassword, ReportConfig } from '@/lib/firestoreService';
import { hashPassword, generateReportId } from '@/lib/passwordUtils';
import UploadScreen from '@/components/UploadScreen';
import PasswordGateway from '@/components/PasswordGateway';
import Dashboard from '@/components/Dashboard';

type AppState = 'upload' | 'password-gate' | 'dashboard';

interface AppData {
  reportId?: string;
  processedData?: ProcessedData;
  password?: string;
}

/**
 * Zefr インサイトレポート - メインアプリケーション
 * 
 * デザイン哲学:
 * - モダンプロフェッショナル・データドリブン
 * - Zefr Light Blue (#0ea5e9)を中心とした信頼感のあるカラーパレット
 * - 非対称グリッドレイアウトで視覚的な奥行きを演出
 * - Noto Sans JPを使用した日本語対応の洗練されたタイポグラフィ
 */
export default function ZefrInsightReport() {
  const [location, navigate] = useLocation();
  const [appState, setAppState] = useState<AppState>('upload');
  const [appData, setAppData] = useState<AppData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URLパラメータからレポートIDを取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report');

    if (reportId) {
      setAppData({ reportId });
      setAppState('password-gate');
    }
  }, []);

  /**
   * CSVファイルをアップロードして処理
   */
  const handleUpload = async (files: File[]) => {
    setIsLoading(true);
    setError(null);

    try {
      // ファイルを解析
      const reports: (ZefrReport | null)[] = [];
      for (const file of files) {
        const report = await parseCSVFile(file);
        reports.push(report);
      }

      // 有効なレポートのみをフィルタリング
      const validReports = reports.filter((r): r is ZefrReport => r !== null);
      
      if (validReports.length === 0) {
        throw new Error('有効なZefrレポートが見つかりません。ファイル形式を確認してください。');
      }

      // データを処理（部分的なレポートでも処理可能）
      const processedData = processReports(reports);
      setAppData({ processedData });
      setAppState('dashboard');
      
      // 読み込まれたレポートタイプを通知
      const loadedTypes = validReports.map(r => r.type).join(', ');
      toast.success(`${loadedTypes} レポートが読み込まれました`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'ファイル処理エラーが発生しました';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ダッシュボードを生成して共有
   */
  const handleGenerateAndShare = async (cpm: number, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      if (!appData.processedData) {
        throw new Error('処理済みデータが見つかりません');
      }

      // レポートIDを生成
      const reportId = generateReportId();

      // Firestoreに保存
      const config: ReportConfig = {
        reportId,
        cpm,
        passwordHash: hashPassword(password),
        createdAt: Date.now(),
      };

      await saveReport(reportId, config, appData.processedData);

      // 共有URLを生成
      const shareUrl = `${window.location.origin}?report=${reportId}`;

      setAppData({
        reportId,
        processedData: appData.processedData,
        password,
      });

      // URLをクリップボードにコピー
      await navigator.clipboard.writeText(shareUrl);
      toast.success('共有URLをクリップボードにコピーしました！');

      setAppState('dashboard');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'レポート生成エラーが発生しました';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * パスワード検証
   */
  const handlePasswordSubmit = async (password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      if (!appData.reportId) {
        throw new Error('レポートIDが見つかりません');
      }

      const report = await getReportWithPassword(appData.reportId, password);

      if (!report) {
        throw new Error('レポートが見つかりません');
      }

      setAppData({
        reportId: appData.reportId,
        processedData: report,
        password,
      });

      setAppState('dashboard');
      toast.success('認証に成功しました');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'パスワード検証エラーが発生しました';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * ダッシュボードに戻る
   */
  const handleBackToDashboard = () => {
    setAppState('dashboard');
    setError(null);
  };

  /**
   * 新しいレポートを作成
   */
  const handleCreateNewReport = () => {
    setAppState('upload');
    setAppData({});
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50">
      {/* ヘッダー */}
      <header className="border-b border-sky-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">Z</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Zefr インサイトレポート</h1>
              <p className="text-xs text-slate-500">Professional Report Dashboard</p>
            </div>
          </div>
          {appState === 'dashboard' && (
            <Button
              variant="outline"
              onClick={handleCreateNewReport}
              className="text-sm"
            >
              新しいレポートを作成
            </Button>
          )}
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <Card className="mb-6 p-4 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">エラーが発生しました</h3>
                <p className="text-sm text-red-800 mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {appState === 'upload' && (
          <UploadScreen
            onUpload={handleUpload}
            onGenerateAndShare={handleGenerateAndShare}
            isLoading={isLoading}
            processedData={appData.processedData}
          />
        )}

        {appState === 'password-gate' && (
          <PasswordGateway
            onSubmit={handlePasswordSubmit}
            isLoading={isLoading}
          />
        )}

        {appState === 'dashboard' && appData.processedData && (
          <Dashboard
            data={appData.processedData}
            reportId={appData.reportId}
            onBackToUpload={handleCreateNewReport}
          />
        )}
      </main>

      {/* フッター */}
      <footer className="border-t border-sky-200 bg-white/50 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-slate-600">
          <p>© 2026 Zefr インサイトレポート. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
