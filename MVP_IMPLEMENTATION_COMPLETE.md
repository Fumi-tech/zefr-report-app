# MVP実装完了: クライアントSPA + Firestore直操作

## 実装内容

### 1) 呼び出し元の特定（完了）

**調査結果:** `CALL_SITE_ANALYSIS.md` を参照

**修正が必要だった箇所:**
- `client/src/pages/ZefrInsightReportFinal6.tsx` のみ
  - レポート保存: tRPC経由 → Firestore直操作
  - レポート取得: tRPC経由 → Firestore直操作

### 2) server経由の呼び出しをFirestore直操作に切り替え（完了）

**変更ファイル:** `client/src/pages/ZefrInsightReportFinal6.tsx`

**変更内容:**
1. **import文の変更**
   - ❌ 削除: `import { trpc } from '@/lib/trpc';`
   - ✅ 追加: `import { saveReport, getReportWithPassword, ReportConfig } from '@/lib/firestoreService';`
   - ✅ 追加: `import { hashPassword, generateReportId } from '@/lib/passwordUtils';`
   - ✅ 追加: `import type { ProcessedData } from '@/lib/csvProcessor';`

2. **tRPC mutation/queryの削除**
   - ❌ 削除: `const saveReportMutation = trpc.report.save.useMutation();`
   - ❌ 削除: `const getReportQuery = trpc.report.get.useQuery(...)`

3. **レポート保存処理の変更** (`handleWebPublish` 関数)
   - ❌ 削除: tRPC経由の保存（ファイルアップロード含む）
   - ✅ 追加: Firestore直操作での保存
   - ✅ 追加: `reportData` → `ProcessedData` 変換ロジック

4. **レポート取得処理の変更** (`handleAccessReport` 関数)
   - ❌ 削除: tRPC経由の取得
   - ✅ 追加: Firestore直操作での取得
   - ✅ 追加: `ProcessedData` → `reportData` 変換ロジック

5. **データ変換ヘルパー関数の追加**
   - `convertReportDataToProcessedData()` - UI用データをFirestore保存形式に変換
   - `convertProcessedDataToReportData()` - FirestoreデータをUI表示形式に変換

### 3) pnpm devがserverなしで動くようにする（完了）

**変更ファイル:** `package.json`, `vite.config.ts`, `client/src/main.tsx`

**変更内容:**

1. **`package.json`**
   ```diff
   - "dev": "NODE_ENV=development tsx watch server/_core/index.ts",
   + "dev": "vite",
   + "dev:server": "NODE_ENV=development tsx watch server/_core/index.ts",
   ```
   - `pnpm dev` でViteのみ起動（server不要）
   - `pnpm dev:server` でserver起動（将来の復活用）

2. **`vite.config.ts`**
   ```diff
   - const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
   + const ENABLE_MVP_MODE = process.env.MVP_MODE !== 'false';
   + const plugins = [
   +   react(), 
   +   tailwindcss(), 
   +   jsxLocPlugin(),
   +   ...(ENABLE_MVP_MODE ? [] : [vitePluginManusRuntime()]),
   +   ...(ENABLE_MVP_MODE ? [] : [vitePluginManusDebugCollector()]),
   + ];
   ```
   - MVPモードではManusプラグインを無効化（デフォルトで無効）

3. **`client/src/main.tsx`**
   ```diff
   - // tRPC初期化コード（全削除）
   + // MVPモード: server不要のためtRPCは使用しない
   + const queryClient = new QueryClient();
   + createRoot(root).render(
   +   <QueryClientProvider client={queryClient}>
   +     <App />
   +   </QueryClientProvider>
   + );
   ```
   - tRPC関連のコードを削除
   - React Queryのみ使用

### 4) 動作確認手順（ローカル）

#### **必要な環境変数（`.env.local`）**

```bash
# Firebase設定（必須）
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# App Check設定（推奨）
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key  # 本番環境で必須
VITE_APPCHECK_DEBUG_TOKEN=your_debug_token        # 開発環境でオプション

# MVPモード（オプション、デフォルトで有効）
MVP_MODE=true  # vite.config.ts用
```

#### **起動手順**

```bash
# 1. 依存パッケージのインストール
pnpm install

# 2. 環境変数の設定
# .env.local ファイルを作成して上記の環境変数を設定

# 3. 開発サーバー起動（clientのみ）
pnpm dev

# 4. ブラウザで http://localhost:5173 を開く
```

#### **よく起きるエラーと対処法**

**エラー1: permission-denied（Firestore書き込み拒否）**
```
レポートの保存が拒否されました。App Checkが正しく設定されているか確認してください。
```

**原因:** App Checkが有効でない、またはデバッグトークンが未設定

**対処法:**
1. ブラウザコンソールを開く
2. App Checkのデバッグトークンが表示される（例: `[Firebase] App Check debug token: ABC123...`）
3. Firebase Console > App Check > Apps でデバッグトークンを登録
4. または、`.env.local` に `VITE_APPCHECK_DEBUG_TOKEN=your_token` を設定

**エラー2: Firebase設定エラー**
```
Firebase: Error (auth/invalid-api-key)
```

**原因:** `VITE_FIREBASE_*` 環境変数が未設定または不正

**対処法:**
1. Firebase Consoleから設定値を取得
2. `.env.local` に正しく設定
3. 開発サーバーを再起動

**エラー3: レポート取得エラー**
```
レポートの取得が拒否されました。レポートが存在しないか、アクセス権限がありません。
```

**原因:** Firestore Security Rulesで読み取りが拒否された

**対処法:**
1. `firestore.rules` が正しくデプロイされているか確認
2. Firebase Console > Firestore > Rules で確認
3. 必要に応じて `firebase deploy --only firestore:rules` を実行

## 変更ファイル一覧

1. **`client/src/pages/ZefrInsightReportFinal6.tsx`** - tRPC呼び出しをFirestore直操作に置き換え
2. **`package.json`** - devスクリプトをViteのみに変更
3. **`vite.config.ts`** - ManusプラグインをMVPモードで無効化
4. **`client/src/main.tsx`** - tRPC初期化コードを削除

## 動作確認チェックリスト

- [ ] `pnpm dev` でエラーなく起動する
- [ ] CSVファイルをアップロードできる
- [ ] レポート生成ができる
- [ ] レポート保存（Firestore）ができる
- [ ] 共有URLが生成される
- [ ] 共有URLからレポートを閲覧できる（パスワード入力）
- [ ] App Checkデバッグトークンがコンソールに表示される

## 次のステップ

1. **Firestore Security Rulesのデプロイ**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **reCAPTCHA v3の設定**（本番環境）
   - Google reCAPTCHA Admin Consoleでサイトを登録
   - サイトキーを取得して `VITE_RECAPTCHA_SITE_KEY` に設定

3. **Firebase Hostingへのデプロイ準備**
   - `firebase.json` の作成
   - `firebase deploy --only hosting` でデプロイ
