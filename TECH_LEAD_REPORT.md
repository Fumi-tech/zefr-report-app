# Zefr Report テックリード現状把握レポート

## 1. リポジトリ構造とアプリ実行経路

### 1.1 リポジトリ構造

```
zefr report/
├── client/                    # フロントエンド（React SPA）
│   ├── src/
│   │   ├── main.tsx          # クライアントエントリポイント
│   │   ├── App.tsx           # ルーティング設定
│   │   ├── pages/            # ページコンポーネント
│   │   ├── components/       # UIコンポーネント
│   │   └── lib/              # ライブラリ・ユーティリティ
│   └── public/               # 静的ファイル
├── server/                    # バックエンド（Express + tRPC）
│   ├── _core/                # コア機能
│   │   ├── index.ts          # サーバーエントリポイント
│   │   ├── trpc.ts           # tRPC設定
│   │   ├── context.ts        # tRPCコンテキスト
│   │   ├── sdk.ts            # Manus SDK統合
│   │   └── oauth.ts          # OAuth認証
│   ├── routers.ts            # tRPCルーター定義
│   └── db.ts                 # データベース操作
├── shared/                    # 共有型定義
├── drizzle/                   # データベーススキーマ（MySQL）
└── vite.config.ts             # Vite設定
```

### 1.2 アプリ実行経路

#### **クライアント側（フロントエンド）**

**エントリポイント:**
- `client/src/main.tsx` - Reactアプリの起動
  - `trpc.createClient()` でtRPCクライアント作成
  - `QueryClient` でReact Query設定
  - `App` コンポーネントをレンダリング

**主要コンポーネント:**
- `client/src/App.tsx` - ルーティング設定
  - `Router` コンポーネントでルート定義
  - `/` → `ZefrInsightReportFinal6`
  - `/shared/:id` → `ZefrInsightReportFinal6`（共有レポート表示）

- `client/src/pages/ZefrInsightReportFinal6.tsx` - メインページ
  - ファイルアップロード処理
  - レポート生成・表示
  - tRPC経由でサーバーAPI呼び出し

**Firestoreアクセス箇所:**
- `client/src/lib/firebaseConfig.ts`
  - `initializeApp()` - Firebase初期化
  - `getFirestore()` - Firestoreインスタンス取得
  - 変数: `db` (export)
  
- `client/src/lib/firestoreService.ts`
  - `saveReport()` - レポート保存（`setDoc()`使用）
  - `getReport()` - レポート取得（`getDoc()`使用）
  - `getReportWithPassword()` - パスワード検証付き取得
  - コレクション: `reports`
  - ドキュメントID: `reportId`

#### **サーバー側（バックエンド）**

**エントリポイント:**
- `server/_core/index.ts` - Expressサーバー起動
  - Expressアプリ作成
  - OAuthルート登録: `/api/oauth/callback`
  - tRPCミドルウェア: `/api/trpc`
  - 開発時: Vite統合、本番時: 静的ファイル配信

**主要コンポーネント:**
- `server/routers.ts` - tRPCルーター定義
  - `appRouter` - メインルーター
  - `report.save` - レポート保存（MySQL使用）
  - `report.get` - レポート取得（MySQL使用）
  - `report.list` - ユーザーのレポート一覧

- `server/_core/context.ts` - tRPCコンテキスト作成
  - `createContext()` - リクエストごとのコンテキスト生成
  - `sdk.authenticateRequest()` - Manus認証

- `server/db.ts` - データベース操作（MySQL/Drizzle）
  - `getDb()` - Drizzleインスタンス取得
  - `createReport()` - レポート作成
  - `getReportByReportId()` - レポート取得
  - `getReportsByUserId()` - ユーザー別レポート一覧

**データベースアクセス箇所:**
- `server/db.ts`
  - `drizzle()` - MySQL接続
  - `users` テーブル: ユーザー情報
  - `reports` テーブル: レポート情報
  - 環境変数: `DATABASE_URL`

### 1.3 データフロー

```
ユーザー操作
  ↓
React SPA (client/src/pages/ZefrInsightReportFinal6.tsx)
  ↓
tRPC Client (client/src/lib/trpc.ts)
  ↓
Express Server (server/_core/index.ts)
  ↓
tRPC Router (server/routers.ts)
  ↓
MySQL Database (server/db.ts) + S3 Storage (server/storage.ts)
  ↓
Firestore (client/src/lib/firestoreService.ts) ← 【注意】クライアント側から直接アクセス
```

**重要な発見:**
- **二重データストア**: MySQL（サーバー側）とFirestore（クライアント側）の両方を使用
- **Firestoreはクライアント側から直接アクセス**: セキュリティリスクが高い

---

## 2. ローカル起動手順

### 2.1 必要なコマンド

```bash
# 依存パッケージのインストール
pnpm install

# 開発サーバー起動
pnpm dev

# ビルド（本番用）
pnpm build

# 本番サーバー起動
pnpm start

# 型チェック
pnpm check
```

### 2.2 必要な環境変数

#### **クライアント側（`.env.local` または `.env`）**

| 環境変数名 | 説明 | 参照ファイル | 必須 |
|-----------|------|------------|------|
| `VITE_FIREBASE_API_KEY` | Firebase API Key | `client/src/lib/firebaseConfig.ts:6` | ✅ |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `client/src/lib/firebaseConfig.ts:7` | ✅ |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `client/src/lib/firebaseConfig.ts:8` | ✅ |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `client/src/lib/firebaseConfig.ts:9` | ✅ |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `client/src/lib/firebaseConfig.ts:10` | ✅ |
| `VITE_FIREBASE_APP_ID` | Firebase App ID | `client/src/lib/firebaseConfig.ts:11` | ✅ |
| `VITE_USE_FIRESTORE_EMULATOR` | Firestoreエミュレーター使用フラグ | `client/src/lib/firebaseConfig.ts:19` | ❌ |
| `VITE_APP_ID` | Manus App ID | `client/src/const.ts:6`, `server/_core/env.ts:2` | ❌（Manus依存） |
| `VITE_OAUTH_PORTAL_URL` | Manus OAuth Portal URL | `client/src/const.ts:5` | ❌（Manus依存） |
| `VITE_FRONTEND_FORGE_API_KEY` | Forge API Key（フロントエンド） | `client/src/components/Map.tsx:89` | ❌ |
| `VITE_FRONTEND_FORGE_API_URL` | Forge API URL（フロントエンド） | `client/src/components/Map.tsx:91` | ❌ |

#### **サーバー側（`.env` または環境変数）**

| 環境変数名 | 説明 | 参照ファイル | 必須 |
|-----------|------|------------|------|
| `DATABASE_URL` | MySQL接続文字列 | `server/db.ts:12`, `drizzle.config.ts:3` | ✅ |
| `JWT_SECRET` | JWT署名用シークレット | `server/_core/env.ts:3` | ✅ |
| `VITE_APP_ID` | Manus App ID | `server/_core/env.ts:2` | ❌（Manus依存） |
| `OAUTH_SERVER_URL` | Manus OAuth Server URL | `server/_core/env.ts:5`, `server/_core/sdk.ts:33` | ❌（Manus依存） |
| `OWNER_OPEN_ID` | オーナーOpenID | `server/_core/env.ts:6` | ❌（Manus依存） |
| `BUILT_IN_FORGE_API_URL` | Forge API URL | `server/_core/env.ts:8`, `server/storage.ts:9` | ❌（Manus依存） |
| `BUILT_IN_FORGE_API_KEY` | Forge API Key | `server/_core/env.ts:9`, `server/storage.ts:10` | ❌（Manus依存） |
| `PORT` | サーバーポート | `server/_core/index.ts:53` | ❌（デフォルト: 3000） |
| `NODE_ENV` | 環境（development/production） | 複数箇所 | ❌ |

### 2.3 起動時に想定されるエラーと解決策

#### **エラー1: Firebase設定エラー**
```
Firebase: Error (auth/invalid-api-key)
```
**原因:** `VITE_FIREBASE_*` 環境変数が未設定または不正  
**解決策:**
1. `.env.local` ファイルを作成
2. Firebase Consoleから設定値を取得して設定
3. 開発サーバーを再起動

#### **エラー2: データベース接続エラー**
```
[Database] Failed to connect: Error: connect ECONNREFUSED
```
**原因:** `DATABASE_URL` が未設定またはMySQLサーバーが起動していない  
**解決策:**
1. MySQLサーバーを起動
2. `.env` に `DATABASE_URL=mysql://user:password@localhost:3306/dbname` を設定
3. または、`DATABASE_URL` を設定せずに起動（警告のみで動作）

#### **エラー3: Manus OAuthエラー**
```
[OAuth] ERROR: OAUTH_SERVER_URL is not configured!
```
**原因:** Manus依存の環境変数が未設定  
**解決策:**
- ローカル起動のみなら警告を無視可能（認証機能は使用不可）
- 完全な動作には `OAUTH_SERVER_URL`, `VITE_APP_ID` が必要

#### **エラー4: ポート使用中**
```
Port 3000 is busy, using port 3001 instead
```
**原因:** ポート3000が使用中  
**解決策:**
- 自動的に別ポートを使用（問題なし）
- または、`PORT=3001` を環境変数で指定

#### **エラー5: Firestoreエミュレーター接続エラー**
```
Firestore has already been initialized
```
**原因:** エミュレーターが既に接続済み  
**解決策:**
- エラーは無視される（`try-catch`で処理済み）
- または、`VITE_USE_FIRESTORE_EMULATOR=false` に設定

---

## 3. Manus固有の依存箇所

### 3.1 Manus依存の全箇所

#### **パッケージ依存**
- `vite-plugin-manus-runtime@0.0.57` - Viteプラグイン
  - 参照: `package.json:112`, `vite.config.ts:7,153`

#### **OAuth認証**
- `server/_core/sdk.ts` - Manus SDK統合
  - `OAuthService` クラス: Manus OAuth API呼び出し
  - `SDKServer` クラス: 認証・セッション管理
  - 環境変数: `OAUTH_SERVER_URL`, `VITE_APP_ID`
  - エンドポイント:
    - `/webdev.v1.WebDevAuthPublicService/ExchangeToken`
    - `/webdev.v1.WebDevAuthPublicService/GetUserInfo`
    - `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`

- `server/_core/oauth.ts` - OAuthコールバック処理
  - `/api/oauth/callback` エンドポイント
  - `sdk.exchangeCodeForToken()` 呼び出し
  - `sdk.getUserInfo()` 呼び出し

- `client/src/const.ts` - OAuth Portal URL設定
  - `VITE_OAUTH_PORTAL_URL` 参照
  - `VITE_APP_ID` 参照

#### **デバッグ・ログ収集**
- `vite.config.ts` - Manusデバッグコレクター
  - `vitePluginManusDebugCollector()` 関数
  - `/__manus__/logs` エンドポイント
  - `.manus-logs/` ディレクトリにログ保存

- `client/public/__manus__/debug-collector.js` - ブラウザログ収集スクリプト
  - コンソールログ、ネットワークリクエスト、UIイベントを収集
  - `/__manus__/logs` にPOST送信

- `client/src/components/ManusDialog.tsx` - Manusログインダイアログ
  - UIコンポーネント（使用されていない可能性）

#### **ストレージ**
- `server/storage.ts` - Manus Forge API統合
  - `BUILT_IN_FORGE_API_URL` 参照
  - `BUILT_IN_FORGE_API_KEY` 参照
  - S3代替として使用

#### **データベーススキーマ**
- `drizzle/schema.ts:14` - コメントに「Manus OAuth identifier」と記載

#### **Vite設定**
- `vite.config.ts:174-178` - Manusドメイン許可
  - `.manuspre.computer`
  - `.manus.computer`
  - `.manus-asia.computer`
  - `.manuscomputer.ai`
  - `.manusvm.computer`

### 3.2 置換案

#### **A) OAuth認証の置換**
**現状:** Manus OAuth  
**置換案:** Firebase Authentication
- `server/_core/sdk.ts` を Firebase Admin SDK に置換
- `server/_core/oauth.ts` を Firebase Auth コールバックに置換
- `client/src/const.ts` の OAuth Portal URL を削除
- 環境変数: `OAUTH_SERVER_URL`, `VITE_APP_ID` を削除

#### **B) ストレージの置換**
**現状:** Manus Forge API  
**置換案:** Firebase Storage または Cloud Storage
- `server/storage.ts` を Firebase Admin Storage に置換
- 環境変数: `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` を削除

#### **C) デバッグコレクターの削除**
**現状:** Manusデバッグコレクター  
**置換案:** 削除（開発時のみ使用）
- `vite.config.ts` から `vitePluginManusDebugCollector()` を削除
- `vite.config.ts` から `vitePluginManusRuntime()` を削除
- `client/public/__manus__/debug-collector.js` を削除
- `package.json` から `vite-plugin-manus-runtime` を削除

#### **D) Vite設定のクリーンアップ**
- `vite.config.ts:174-178` の Manusドメイン許可を削除

---

## 4. 重大なセキュリティリスク

### 4.1 Firestore Security Rules が存在しない

**リスクレベル: 🔴 最優先（Critical）**

**現状:**
- `firestore.rules` ファイルが存在しない
- README.md に `allow read, write: if true;` の例が記載されているが、実際のファイルはない
- Firestoreが**全開放状態**の可能性が高い

**影響:**
- 誰でも `reports` コレクションの全データを読み書き可能
- パスワード保護が無意味（直接Firestoreからデータ取得可能）
- 個人情報・機密データの漏洩リスク

**修正案（優先度: 最高）:**

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // reportsコレクション: パスワード検証が必要
    match /reports/{reportId} {
      // 読み取り: パスワード検証はサーバー側で実施（クライアント側直接アクセス禁止）
      allow read: if false; // クライアント側からの直接読み取りを禁止
      allow write: if false; // クライアント側からの直接書き込みを禁止
      
      // 注意: パスワード検証はサーバー側（tRPC）で実施する必要がある
    }
    
    // その他のコレクションも同様に制限
    match /{document=**} {
      allow read, write: if false; // デフォルトで全拒否
    }
  }
}
```

**実装手順:**
1. `firestore.rules` ファイルを作成
2. Firebase Consoleでルールをデプロイ: `firebase deploy --only firestore:rules`
3. クライアント側のFirestore直接アクセスを削除（`client/src/lib/firestoreService.ts`）
4. すべてのFirestore操作をサーバー側（tRPC）経由に変更

### 4.2 クライアント側からのFirestore直接アクセス

**リスクレベル: 🔴 高（High）**

**現状:**
- `client/src/lib/firestoreService.ts` でクライアント側から直接Firestoreアクセス
- セキュリティルールが無効でも動作してしまう

**影響:**
- セキュリティルールをバイパス可能
- クライアント側のコード改変で全データアクセス可能

**修正案:**
- `client/src/lib/firestoreService.ts` を削除
- すべてのFirestore操作を `server/routers.ts` のtRPCエンドポイント経由に変更
- クライアント側は `trpc.report.*` のみ使用

### 4.3 パスワード保護の脆弱性

**リスクレベル: 🟡 中（Medium）**

**現状:**
- `client/src/lib/passwordUtils.ts` でSHA-256ハッシュ化
- しかし、Firestoreが全開放ならパスワード保護が無意味

**影響:**
- Firestoreから直接データ取得可能なら、パスワード検証をバイパス可能

**修正案:**
- Firestore Security Rules を修正（上記4.1）
- サーバー側でパスワード検証を実施
- 必要に応じて、bcryptなどのより強力なハッシュアルゴリズムに変更

### 4.4 環境変数の漏洩リスク

**リスクレベル: 🟡 中（Medium）**

**現状:**
- `VITE_*` 環境変数はクライアント側にバンドルされる
- Firebase API Keyがクライアント側に露出

**影響:**
- Firebase API Keyは公開されても問題ない設計だが、App Checkで保護推奨

**修正案:**
- Firebase App Checkを導入
- API Keyの使用を制限（HTTPリファラー制限など）

### 4.5 データベース接続文字列の管理

**リスクレベル: 🟡 中（Medium）**

**現状:**
- `DATABASE_URL` が環境変数で管理
- `.env` ファイルがGitにコミットされる可能性

**修正案:**
- `.env` を `.gitignore` に追加（確認必要）
- 本番環境ではSecret Managerを使用

### 4.6 セッション管理の脆弱性

**リスクレベル: 🟡 中（Medium）**

**現状:**
- JWTトークンをCookieで管理
- `JWT_SECRET` が環境変数で管理

**修正案:**
- `JWT_SECRET` を強力なランダム文字列に設定
- CookieのSecure/HttpOnlyフラグを確認（`server/_core/cookies.ts`を確認必要）

---

## 5. 独立運用のデプロイ案

### 5.1 案A: Firebase Hosting + Firestore（最短・安い）

#### **構成**
- **フロントエンド:** Firebase Hosting（SPA）
- **バックエンド:** Cloud Functions（Express + tRPC）
- **データベース:** Firestore
- **ストレージ:** Firebase Storage
- **認証:** Firebase Authentication

#### **メリット**
- ✅ 無料枠が充実（Firebase Hosting: 10GB/月、Cloud Functions: 200万リクエスト/月）
- ✅ 設定が簡単
- ✅ Firebase統合で開発効率が高い
- ✅ CDN配信で高速

#### **デメリット**
- ❌ Cloud Functionsのコールドスタート
- ❌ サーバー側の柔軟性が低い

#### **必要な設定ファイル**

**1. `firebase.json`**
```json
{
  "hosting": {
    "public": "dist/public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  }
}
```

**2. `firestore.rules`**（セキュリティルール）
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reports/{reportId} {
      // サーバー側（Cloud Functions）からのみアクセス可能
      allow read, write: if false;
    }
  }
}
```

**3. `functions/package.json`**（Cloud Functions用）
```json
{
  "name": "functions",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.21.2",
    "@trpc/server": "^11.6.0",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

**4. `functions/index.js`**（Cloud Functionsエントリ）
```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const { app } = require('./server'); // Express + tRPC

exports.api = functions.https.onRequest(app);
```

**5. `.firebaserc`**
```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

#### **デプロイコマンド**

```bash
# Firebase CLIインストール
npm install -g firebase-tools

# Firebaseログイン
firebase login

# プロジェクト初期化
firebase init

# ビルド
pnpm build

# デプロイ
firebase deploy

# 個別デプロイ
firebase deploy --only hosting      # フロントエンドのみ
firebase deploy --only firestore:rules  # セキュリティルールのみ
firebase deploy --only functions    # Cloud Functionsのみ
```

#### **SPAのリライト対応**
- `firebase.json` の `rewrites` で全パスを `/index.html` にリライト（上記設定済み）

#### **コスト見積もり**
- **無料枠内:** 月間10GB Hosting、200万リクエスト Functions、1GB Firestore読み取り
- **超過時:** Hosting $0.026/GB、Functions $0.40/100万リクエスト、Firestore $0.06/10万読み取り

---

### 5.2 案B: Cloud Run + Firestore（GCP標準寄り）

#### **構成**
- **フロントエンド:** Cloud Run（静的ファイル配信）
- **バックエンド:** Cloud Run（Express + tRPC）
- **データベース:** Firestore
- **ストレージ:** Cloud Storage
- **認証:** Firebase Authentication

#### **メリット**
- ✅ GCP標準スタック
- ✅ Cloud Runの自動スケーリング
- ✅ コンテナベースで柔軟性が高い
- ✅ サーバーレスでコスト効率が良い

#### **デメリット**
- ❌ 設定がやや複雑
- ❌ Dockerfileの作成が必要

#### **必要な設定ファイル**

**1. `Dockerfile`**（バックエンド用）
```dockerfile
FROM node:20-alpine

WORKDIR /app

# 依存パッケージのインストール
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# アプリケーションコードのコピー
COPY . .

# ビルド
RUN pnpm build

# 本番サーバー起動
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**2. `cloudbuild.yaml`**（Cloud Build用）
```yaml
steps:
  # バックエンドのビルド・デプロイ
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/zefr-report-api', '.']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/zefr-report-api']
  
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'zefr-report-api'
      - '--image'
      - 'gcr.io/$PROJECT_ID/zefr-report-api'
      - '--platform'
      - 'managed'
      - '--region'
      - 'asia-northeast1'
      - '--allow-unauthenticated'
      - '--port'
      - '8080'
      - '--set-env-vars'
      - 'NODE_ENV=production'
  
  # フロントエンドのビルド・デプロイ
  - name: 'node:20'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        npm install -g pnpm
        pnpm install --frozen-lockfile
        pnpm build
        gsutil -m rsync -r dist/public gs://$PROJECT_ID-zefr-report-static/
```

**3. `firestore.rules`**（セキュリティルール）
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /reports/{reportId} {
      allow read, write: if false; // サーバー側からのみアクセス
    }
  }
}
```

**4. `.gcloudignore`**
```
node_modules/
dist/
.env
.env.local
.git/
```

**5. `server/index.ts` の修正**（SPAリライト対応）
```typescript
// 既存のコードに追加
app.get("*", (_req, res) => {
  res.sendFile(path.join(staticPath, "index.html"));
});
```

#### **デプロイコマンド**

```bash
# GCP認証
gcloud auth login

# プロジェクト設定
gcloud config set project YOUR_PROJECT_ID

# Cloud Buildでデプロイ
gcloud builds submit --config cloudbuild.yaml

# または、手動デプロイ
# 1. バックエンド
gcloud run deploy zefr-report-api \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --port 8080

# 2. フロントエンド（静的ファイル）
gsutil mb gs://YOUR_PROJECT_ID-zefr-report-static
gsutil -m rsync -r dist/public gs://YOUR_PROJECT_ID-zefr-report-static/
gsutil web set -m index.html -e 404.html gs://YOUR_PROJECT_ID-zefr-report-static/
```

#### **SPAのリライト対応**
- Cloud Runの場合: `server/index.ts` で全パスを `index.html` にリライト（既に実装済み）
- Cloud Storageの場合: `gsutil web set` で設定

#### **コスト見積もり**
- **無料枠:** 月間200万リクエスト、360,000 GB秒、180,000 vCPU秒
- **超過時:** $0.40/100万リクエスト、$0.00002400/GB秒、$0.0000100/vCPU秒

---

### 5.3 推奨案の比較

| 項目 | 案A: Firebase Hosting + Functions | 案B: Cloud Run |
|------|-----------------------------------|---------------|
| **初期設定の簡単さ** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **コスト（小規模）** | ⭐⭐⭐⭐⭐（無料枠充実） | ⭐⭐⭐⭐ |
| **スケーラビリティ** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **開発効率** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **GCP標準** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **推奨ケース** | MVP・小規模運用 | 中規模以上・GCP標準重視 |

**推奨:** まずは**案A（Firebase Hosting + Functions）**でMVPを構築し、必要に応じて案Bに移行

---

## 6. 明日までに独立運用MVPを動かすためのチェックリスト

### 6.1 セキュリティ修正（最優先）

#### **タスク1: Firestore Security Rules作成・デプロイ**
- **所要時間:** 30分
- **作業内容:**
  1. `firestore.rules` ファイルを作成
  2. ルールを `allow read, write: if false;` に設定
  3. Firebase Consoleでデプロイ
- **完了条件:** Firebase Consoleでルールが適用され、クライアント側からの直接アクセスが拒否されることを確認
- **優先度:** 🔴 最優先

#### **タスク2: クライアント側Firestore直接アクセス削除**
- **所要時間:** 1時間
- **作業内容:**
  1. `client/src/lib/firestoreService.ts` を削除
  2. `client/src/pages/ZefrInsightReportFinal6.tsx` のFirestore直接呼び出しを削除
  3. すべての操作をtRPC経由に変更
- **完了条件:** Firestoreへの直接アクセスコードが存在しないことを確認
- **優先度:** 🔴 最優先

#### **タスク3: サーバー側でFirestore操作実装**
- **所要時間:** 2時間
- **作業内容:**
  1. `server/routers.ts` にFirestore操作を追加（既存のMySQL操作と統合）
  2. Firebase Admin SDKをインストール
  3. パスワード検証をサーバー側で実施
- **完了条件:** レポート保存・取得がサーバー経由で動作することを確認
- **優先度:** 🔴 最優先

### 6.2 Manus依存の削除

#### **タスク4: Manus OAuth削除・Firebase Auth統合**
- **所要時間:** 3時間
- **作業内容:**
  1. `server/_core/sdk.ts` をFirebase Admin SDKに置換
  2. `server/_core/oauth.ts` をFirebase Authコールバックに置換
  3. 環境変数からManus関連を削除
- **完了条件:** Firebase Authenticationでログイン・認証が動作することを確認
- **優先度:** 🟡 中（認証が必要な場合）

#### **タスク5: Manusストレージ削除・Firebase Storage統合**
- **所要時間:** 1時間
- **作業内容:**
  1. `server/storage.ts` をFirebase Admin Storageに置換
  2. 環境変数から `BUILT_IN_FORGE_API_*` を削除
- **完了条件:** ファイルアップロードがFirebase Storageで動作することを確認
- **優先度:** 🟡 中

#### **タスク6: Manusデバッグコレクター削除**
- **所要時間:** 15分
- **作業内容:**
  1. `vite.config.ts` からManusプラグインを削除
  2. `client/public/__manus__/` を削除
  3. `package.json` から `vite-plugin-manus-runtime` を削除
- **完了条件:** ビルドエラーが発生しないことを確認
- **優先度:** 🟢 低

### 6.3 ローカル起動環境の整備

#### **タスク7: 環境変数テンプレート作成**
- **所要時間:** 15分
- **作業内容:**
  1. `.env.example` ファイルを作成
  2. 必要な環境変数を記載（値は空欄）
  3. README.mdに環境変数設定手順を追記
- **完了条件:** `.env.example` が存在し、READMEに手順が記載されている
- **優先度:** 🟡 中

#### **タスク8: ローカル起動テスト**
- **所要時間:** 30分
- **作業内容:**
  1. `pnpm install` 実行
  2. `.env.local` を設定
  3. `pnpm dev` で起動
  4. エラーを確認・修正
- **完了条件:** ローカルでアプリが起動し、基本機能が動作する
- **優先度:** 🟡 中

### 6.4 デプロイ準備

#### **タスク9: Firebaseプロジェクト作成・設定**
- **所要時間:** 30分
- **作業内容:**
  1. Firebase Consoleでプロジェクト作成
  2. Firestore、Authentication、Storageを有効化
  3. Webアプリを追加して設定値を取得
- **完了条件:** Firebase設定値が取得でき、プロジェクトが作成されている
- **優先度:** 🟡 中

#### **タスク10: Firebase設定ファイル作成**
- **所要時間:** 30分
- **作業内容:**
  1. `firebase.json` を作成
  2. `.firebaserc` を作成
  3. `firestore.rules` を作成（タスク1で作成済みならスキップ）
- **完了条件:** `firebase.json`, `.firebaserc` が存在する
- **優先度:** 🟡 中

#### **タスク11: ビルドテスト**
- **所要時間:** 15分
- **作業内容:**
  1. `pnpm build` を実行
  2. ビルドエラーを確認・修正
  3. `dist/public` が生成されることを確認
- **完了条件:** ビルドが成功し、`dist/public` が生成される
- **優先度:** 🟡 中

#### **タスク12: Firebase Hostingデプロイ**
- **所要時間:** 30分
- **作業内容:**
  1. `firebase deploy --only hosting` を実行
  2. デプロイURLを確認
  3. 動作確認
- **完了条件:** デプロイが成功し、公開URLでアプリが動作する
- **優先度:** 🟡 中

### 6.5 動作確認

#### **タスク13: エンドツーエンドテスト**
- **所要時間:** 1時間
- **作業内容:**
  1. ファイルアップロード
  2. レポート生成
  3. 共有URL生成
  4. パスワード保護確認
  5. Firestore Security Rules確認（直接アクセス拒否）
- **完了条件:** すべての機能が正常に動作し、セキュリティが確保されている
- **優先度:** 🔴 最優先

---

## 7. 作業順序（優先度順）

### **Phase 1: セキュリティ修正（必須・最優先）**
1. タスク1: Firestore Security Rules作成・デプロイ（30分）
2. タスク2: クライアント側Firestore直接アクセス削除（1時間）
3. タスク3: サーバー側でFirestore操作実装（2時間）
4. タスク13: エンドツーエンドテスト（1時間）

**合計時間: 約4.5時間**

### **Phase 2: Manus依存削除（可能な範囲で）**
5. タスク6: Manusデバッグコレクター削除（15分）
6. タスク5: Manusストレージ削除（1時間）
7. タスク4: Manus OAuth削除（3時間）← 時間がなければ後回し

**合計時間: 約4時間（OAuth削除含む）**

### **Phase 3: ローカル起動環境整備**
8. タスク7: 環境変数テンプレート作成（15分）
9. タスク8: ローカル起動テスト（30分）

**合計時間: 約45分**

### **Phase 4: デプロイ準備**
10. タスク9: Firebaseプロジェクト作成（30分）
11. タスク10: Firebase設定ファイル作成（30分）
12. タスク11: ビルドテスト（15分）
13. タスク12: Firebase Hostingデプロイ（30分）

**合計時間: 約1.75時間**

---

## 8. 総合所要時間見積もり

- **最小構成（セキュリティ修正のみ）:** 約4.5時間
- **推奨構成（セキュリティ + Manus依存削除）:** 約8.5時間
- **完全構成（すべて実施）:** 約11時間

**明日までにMVPを動かす場合の推奨:**
1. Phase 1（セキュリティ修正）を最優先で実施
2. Phase 3（ローカル起動環境）を実施
3. Phase 4（デプロイ準備）を実施
4. Phase 2（Manus依存削除）は後回しでも可（認証が不要なら）

---

## 9. 完了条件（Definition of Done）

### **セキュリティ**
- ✅ Firestore Security Rulesが適用され、クライアント側からの直接アクセスが拒否される
- ✅ すべてのFirestore操作がサーバー側経由で実施される
- ✅ パスワード保護がサーバー側で正しく動作する

### **ローカル起動**
- ✅ `pnpm install` → `pnpm dev` でローカル起動できる
- ✅ 環境変数が正しく設定されている
- ✅ エラーなく動作する

### **デプロイ**
- ✅ Firebase Hostingにデプロイできる
- ✅ 公開URLでアプリが動作する
- ✅ すべての機能が正常に動作する

### **Manus依存削除（オプション）**
- ✅ Manus関連のコードが存在しない
- ✅ Manus関連の環境変数が不要
- ✅ ビルドエラーが発生しない

---

## 10. 次のステップ（MVP後の改善）

1. **App Check導入** - Firebase API Keyの保護強化
2. **bcrypt導入** - パスワードハッシュの強化
3. **ログ・モニタリング** - Cloud Logging統合
4. **エラーハンドリング強化** - ユーザーフレンドリーなエラーメッセージ
5. **パフォーマンス最適化** - コード分割、キャッシュ戦略

---

**作成日:** 2026年1月26日  
**作成者:** テックリード（AI Assistant）
