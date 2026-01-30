import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, CheckCircle2, X as XIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProcessedData } from '@/lib/csvProcessor';

interface UploadScreenProps {
  onUpload: (files: File[]) => Promise<void>;
  onGenerateAndShare: (cpm: number, password: string) => Promise<void>;
  isLoading: boolean;
  processedData?: ProcessedData;
}

/**
 * UploadScreen コンポーネント
 * 
 * デザイン: モダンプロフェッショナル
 * - ドラッグ&ドロップ対応のファイルアップロード（CSV/XLSX対応）
 * - ファイル削除機能
 * - レポートタイプチェックリスト
 * - CPM入力フィールド
 * - パスワード設定フィールド
 * - レポート生成ボタン
 */
export default function UploadScreen({
  onUpload,
  onGenerateAndShare,
  isLoading,
  processedData,
}: UploadScreenProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [cpm, setCpm] = useState<number>(1500);
  const [password, setPassword] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.currentTarget.files || []);
    setFiles(selectedFiles);
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
  };

  const handleUploadClick = async () => {
    if (files.length === 0) return;
    await onUpload(files);
  };

  const handleGenerateAndShare = async () => {
    if (!password.trim()) {
      alert('パスワードを入力してください');
      return;
    }
    await onGenerateAndShare(cpm, password);
  };

  // レポートタイプチェックリスト
  const reportTypeChecklist = [
    { type: 'performance', label: 'Performance', loaded: processedData?.loadedReports?.performance || false },
    { type: 'suitability', label: 'Suitability', loaded: processedData?.loadedReports?.suitability || false },
    { type: 'viewability', label: 'Viewability', loaded: processedData?.loadedReports?.viewability || false },
    { type: 'exclusion', label: 'Exclusion', loaded: processedData?.loadedReports?.exclusion || false },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {!processedData ? (
        // ステップ1: ファイルアップロード
        <div className="space-y-8">
          {/* タイトルセクション */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">
              Zefr レポートをアップロード
            </h2>
            <p className="text-lg text-slate-600">
              4種類のレポート（Performance、Suitability、Viewability、Exclusion）をアップロードしてください
            </p>
          </div>

          {/* ドラッグ&ドロップエリア */}
          <Card
            className={`relative border-2 border-dashed transition-all duration-200 cursor-pointer ${
              isDragging
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-sky-200 bg-sky-50 hover:border-sky-300 hover:bg-sky-100'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-12 text-center">
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
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
          </Card>

          {/* アップロード済みファイルリスト */}
          {files.length > 0 && (
            <Card className="p-6 bg-white border-sky-200">
              <h3 className="font-semibold text-slate-900 mb-4">
                アップロード済みファイル ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-sky-50 rounded-lg border border-sky-200"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 flex-1 truncate">
                      {file.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="p-1 hover:bg-red-100 rounded transition-colors"
                      title="削除"
                    >
                      <XIcon className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* アップロードボタン */}
          {files.length > 0 && (
            <Button
              onClick={handleUploadClick}
              disabled={isLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3 rounded-lg"
            >
              {isLoading ? 'ファイル処理中...' : 'ファイルを処理'}
            </Button>
          )}
        </div>
      ) : (
        // ステップ2: CPM入力とパスワード設定
        <div className="space-y-8">
          {/* 処理完了メッセージ */}
          <Card className="p-6 bg-green-50 border-green-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">ファイル処理完了</h3>
                <p className="text-sm text-green-800 mt-1">
                  {files.length}個のファイルが処理されました
                </p>
              </div>
            </div>
          </Card>

          {/* レポートタイプチェックリスト */}
          <Card className="p-6 bg-white border-sky-200">
            <h3 className="font-semibold text-slate-900 mb-4">読み込まれたレポート</h3>
            <div className="grid grid-cols-2 gap-3">
              {reportTypeChecklist.map((item) => (
                <div
                  key={item.type}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    item.loaded
                      ? 'bg-green-50 border-green-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.loaded ? (
                      <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                    )}
                    <span className={`font-medium ${
                      item.loaded ? 'text-green-900' : 'text-slate-600'
                    }`}>
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4">
              注: 4つのレポートが揃っていなくても、読み込めたデータでダッシュボードを構築します
            </p>
          </Card>

          {/* 処理結果サマリー */}
          <Card className="p-6 bg-white border-sky-200">
            <h3 className="font-semibold text-slate-900 mb-4">処理結果</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                <p className="text-sm text-slate-600">アカウント名</p>
                <p className="text-lg font-semibold text-slate-900">
                  {processedData.accountName}
                </p>
              </div>
              <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                <p className="text-sm text-slate-600">レポート期間</p>
                <p className="text-lg font-semibold text-slate-900">
                  {processedData.reportingPeriod}
                </p>
              </div>
            </div>
          </Card>

          {/* CPM入力 */}
          <Card className="p-6 bg-white border-sky-200">
            <label className="block mb-2">
              <span className="text-sm font-semibold text-slate-900">
                CPM（1000インプレッション当たりの単価）
              </span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-600">¥</span>
              <Input
                type="number"
                value={cpm}
                onChange={(e) => setCpm(Math.max(0, parseInt(e.target.value) || 0))}
                className="flex-1 border-sky-200 focus:border-cyan-500 focus:ring-cyan-500"
                min="0"
                step="100"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              予算最適化の計算に使用されます
            </p>
          </Card>

          {/* パスワード設定 */}
          <Card className="p-6 bg-white border-sky-200">
            <label className="block mb-2">
              <span className="text-sm font-semibold text-slate-900">
                閲覧パスワード設定
              </span>
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="このレポートを閲覧するためのパスワードを設定"
              className="border-sky-200 focus:border-cyan-500 focus:ring-cyan-500"
            />
            <p className="text-xs text-slate-500 mt-2">
              共有URLにアクセスする際に必要なパスワードです
            </p>
          </Card>

          {/* 生成ボタン */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setFiles([]);
                setPassword('');
                setCpm(1500);
              }}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleGenerateAndShare}
              disabled={isLoading || !password.trim()}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3 rounded-lg"
            >
              {isLoading ? 'レポート生成中...' : 'レポートを生成して共有'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
