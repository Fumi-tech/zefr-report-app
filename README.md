# Zefr インサイトレポート

高品質なデータダッシュボード型のZefrレポート処理・共有アプリケーション

## 概要

Zefr インサイトレポートは、4種類のZefr CSVレポート（Performance、Suitability、Viewability、Exclusion）を処理し、プロフェッショナルなダッシュボードを生成するReactアプリケーションです。生成されたレポートはパスワード保護された共有URLで安全に共有できます。

## 主な機能

### 1. ファイルアップロード
- ドラッグ&ドロップ対応のCSVファイルアップロード
- 4種類のZefrレポートの自動識別
- ファイル処理エラーの詳細表示

### 2. レポート生成
- **CPM入力**: 予算最適化計算用の1000インプレッション当たりの単価を設定
- **パスワード設定**: レポート閲覧用のセキュアなパスワード設定
- **自動計算**:
  - 加重平均適合率（ブランド適合性）
  - ビューアビリティリフト
  - 総除外インプレッション数
  - 予算最適化額（¥）

### 3. ダッシュボード
- **KPIカード**: 4つの主要指標を視覚的に表示
- **チャート**:
  - 品質・ボリュームトレンド（ComposedChart）
  - 品質リフトサマリー（PieChart）
- **インサイトパネル**: 自動生成された3つの日本語インサイト（編集可能）

### 4. 共有機能
- **セキュアな共有URL**: パスワード保護されたレポートリンク
- **URLコピー**: ワンクリックで共有URLをクリップボードにコピー
- **Firestore連携**: レポートデータの安全な保存

### 5. エクスポート機能
- **PDF出力**: ダッシュボード全体をPDFで出力
- **PowerPoint出力**: スライド形式でのレポート出力

## 技術スタック

### フロントエンド
- **React 19**: UIフレームワーク
- **Tailwind CSS 4**: スタイリング
- **TypeScript**: 型安全性

### ライブラリ
- **Recharts**: データビジュアライゼーション
- **PapaParse**: CSV解析
- **Firebase/Firestore**: データ永続化
- **jsPDF + html2canvas**: PDF出力
- **PptxGenJS**: PowerPoint出力
- **Lucide React**: アイコン
- **Crypto-JS**: パスワードハッシング

## デザイン哲学

### モダンプロフェッショナル・データドリブン
- **色彩**: Zefr Light Blue (#0ea5e9)を中心とした信頼感のあるカラーパレット
- **レイアウト**: 非対称グリッドで視覚的な奥行きを演出
- **タイポグラフィ**: Noto Sans JPで日本語対応
- **インタラクション**: スムーズなトランジションと細かいディテール

## ファイル構造

```
client/
├── src/
│   ├── pages/
│   │   └── ZefrInsightReport.tsx    # メインアプリケーション
│   ├── components/
│   │   ├── UploadScreen.tsx         # ファイルアップロード画面
│   │   ├── PasswordGateway.tsx       # パスワード入力画面
│   │   └── Dashboard.tsx            # ダッシュボード表示
│   ├── lib/
│   │   ├── firebaseConfig.ts        # Firebase設定
│   │   ├── csvProcessor.ts          # CSV処理ロジック
│   │   ├── passwordUtils.ts         # パスワード関連ユーティリティ
│   │   └── firestoreService.ts      # Firestore操作
│   ├── App.tsx                      # ルーティング
│   └── index.css                    # グローバルスタイル
└── public/
    └── sample-data/                 # サンプルCSVファイル
```

## 使用方法

### 1. ローカル開発

```bash
# 依存パッケージのインストール
pnpm install

# 開発サーバーの起動
pnpm dev

# ブラウザで http://localhost:3000 を開く
```

### 2. ファイルアップロード

1. ページにアクセスして「Zefr CSVレポートをアップロード」セクションを表示
2. 4種類のCSVファイルをドラッグ&ドロップまたはクリックして選択
3. 「ファイルを処理」ボタンをクリック

### 3. レポート設定

1. CPM（1000インプレッション当たりの単価）を入力（デフォルト: 1,500円）
2. 閲覧パスワードを設定
3. 「レポートを生成して共有」ボタンをクリック

### 4. ダッシュボード表示

- レポートが生成されダッシュボードが表示されます
- KPIカード、チャート、インサイトを確認できます

### 5. 共有

- 「共有URL」ボタンで共有URLをコピー
- URLを他のユーザーに共有
- パスワード入力画面でパスワードを入力してアクセス

### 6. エクスポート

- 「PDF」ボタンでPDF形式でダウンロード
- 「PPTX」ボタンでPowerPoint形式でダウンロード

## Firebase設定

### 環境変数

`.env.local` ファイルに以下の環境変数を設定してください：

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Firestore セキュリティルール

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reports/{reportId} {
      allow read, write: if true;
    }
  }
}
```

## CSVファイル形式

### Performance レポート
```
Date,Account,Impressions,Clicks,CTR
```

### Suitability レポート
```
Date,Account,Impressions,Suitable Impressions,Suitability Rate
```

### Viewability レポート
```
Date,Account,Impressions,Viewable Impressions,VTR,VCR
```

### Exclusion レポート
```
Date,Account,Impressions,Blocked Impressions,Exclusion Rate
```

## KPI計算ロジック

### ブランド適合性（加重平均適合率）
```
適合率 = (適正なインプレッション数 / 総インプレッション数) × 100
```

### ビューアビリティリフト
```
リフト = VTR（ビューアビリティレート）の平均値 × 1.2
```

### 予算最適化額（¥）
```
最適化額 = (除外インプレッション数 / 1000) × CPM
```

## セキュリティ

- **パスワード保護**: SHA-256ハッシング化されたパスワードでレポートを保護
- **Firestore**: サーバーサイドでのデータ永続化
- **HTTPS**: すべての通信は暗号化されます

## ブラウザ対応

- Chrome/Edge: 最新版
- Firefox: 最新版
- Safari: 最新版

## トラブルシューティング

### ファイルが認識されない場合
- CSVファイルのヘッダーが正しいか確認してください
- 4種類すべてのレポートがアップロードされているか確認してください

### Firebaseエラーが発生する場合
- 環境変数が正しく設定されているか確認してください
- Firebaseプロジェクトが有効化されているか確認してください

### エクスポートが失敗する場合
- ブラウザのコンソールでエラーメッセージを確認してください
- ポップアップブロッカーが有効になっていないか確認してください

## ライセンス

MIT License

## サポート

問題が発生した場合は、ブラウザのコンソールでエラーメッセージを確認し、詳細をお知らせください。
