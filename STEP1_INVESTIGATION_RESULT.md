# STEP 1 動作確認とManus依存調査結果

## 1. App Check / reCAPTCHA v3 環境変数一覧

### 追加した環境変数

| 環境変数名 | 説明 | 参照ファイル | 参照行 | 必須/任意 |
|-----------|------|------------|--------|----------|
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA v3サイトキー | `client/src/lib/firebaseConfig.ts` | 33行目 | 🟡 本番環境で必須、開発環境ではテストキー使用可 |
| `VITE_APPCHECK_DEBUG_TOKEN` | App Checkデバッグトークン（開発環境用） | `client/src/lib/firebaseConfig.ts` | 41行目 | ❌ 任意（開発環境でのみ使用） |

### 参照箇所の詳細

**`client/src/lib/firebaseConfig.ts`**
- **33行目:** `import.meta.env.VITE_RECAPTCHA_SITE_KEY` - reCAPTCHA v3プロバイダーの初期化時に使用
  ```typescript
  provider: new ReCaptchaV3Provider(
    import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI' // デフォルトはテストキー
  )
  ```
- **41行目:** `import.meta.env.VITE_APPCHECK_DEBUG_TOKEN` - 開発環境でのデバッグトークン設定
  ```typescript
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  ```

### 設定手順

1. **reCAPTCHA v3サイトキーの取得**
   - Google reCAPTCHA Admin Console (https://www.google.com/recaptcha/admin) でサイトを登録
   - reCAPTCHA v3を選択
   - サイトキーを取得して `.env.local` に設定:
     ```
     VITE_RECAPTCHA_SITE_KEY=your_site_key_here
     ```

2. **開発環境でのデバッグトークン（オプション）**
   - ブラウザコンソールに表示されるデバッグトークンをコピー
   - Firebase Console > App Check > Apps でデバッグトークンを登録
   - `.env.local` に設定（オプション）:
     ```
     VITE_APPCHECK_DEBUG_TOKEN=your_debug_token_here
     ```

---

## 2. firestore.rules 全文と読み取り条件の妥当性

### firestore.rules 全文

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // reportsコレクション: レポートデータ
    match /reports/{reportId} {
      // 読み取り: 共有URL用途を考慮し、reportIdが存在する場合は読み取り可能
      // パスワード保護はアプリケーション側で実施
      allow read: if resource != null 
                  && resource.data.keys().hasAll(['config', 'processedData']);
      
      // 書き込み: App Checkトークンが存在し、かつ適切な構造である場合のみ許可
      // App Checkで保護されたクライアントからの書き込みを許可
      allow create: if request.appCheck.token != null
                    && request.resource.data.keys().hasAll(['config', 'processedData'])
                    && request.resource.data.config.keys().hasAll(['reportId', 'cpm', 'passwordHash', 'createdAt'])
                    && request.resource.data.config.reportId == reportId;
      
      // 更新・削除は禁止（レポートは作成のみ）
      allow update, delete: if false;
    }
    
    // その他のコレクション: デフォルトで全拒否
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 読み取り条件の妥当性評価

#### ✅ **現在の読み取り条件は妥当**

**現在のルール:**
```javascript
allow read: if resource != null 
            && resource.data.keys().hasAll(['config', 'processedData']);
```

**評価:**
- ✅ **共有URL用途で問題なし**: `resource != null` により、ドキュメントが存在する限り読み取り可能
- ✅ **パスワード保護はアプリ側で実施**: Firestore Rulesでは認証情報を検証できないため、アプリケーション側（`getReportWithPassword()`）でパスワード検証を行う設計は適切
- ✅ **データ構造の検証**: `hasAll(['config', 'processedData'])` により、必要なフィールドが存在することを確認

**潜在的なリスクと対策:**
- ⚠️ **リスク**: 誰でもreportIdを知っていれば読み取り可能（パスワードはアプリ側で検証）
- ✅ **対策**: 
  - パスワード検証は `client/src/lib/firestoreService.ts` の `getReportWithPassword()` で実施
  - reportIdは推測困難なID（`nanoid(12)`）を使用
  - 必要に応じて、reportIdに有効期限を追加可能

**推奨改善案（オプション）:**
```javascript
// より厳格な読み取り制御（オプション）
allow read: if resource != null 
            && resource.data.keys().hasAll(['config', 'processedData'])
            && (!('expiresAt' in resource.data.config) || resource.data.config.expiresAt > request.time);
```
→ 有効期限が設定されている場合は、期限切れのレポートを読み取り不可にする

---

## 3. Manus依存の実使用箇所（importされているだけ vs 実行されている）

### A. **実行されている箇所（MVPで影響あり）**

#### 1. **OAuth認証フロー**
- **`server/_core/context.ts`** (17行目)
  - `sdk.authenticateRequest(opts.req)` - **実行されている**
  - tRPCコンテキスト作成時に毎回呼び出される
  - **影響**: MVPで認証が必要な場合、この処理が失敗するとエラーになる
  - **現状**: `try-catch`でエラーを握りつぶし、`user = null` を返す（認証はオプション）

- **`server/_core/oauth.ts`** (23-24行目, 39行目)
  - `sdk.exchangeCodeForToken(code, state)` - **実行されている**（OAuthコールバック時）
  - `sdk.getUserInfo(tokenResponse.accessToken)` - **実行されている**（OAuthコールバック時）
  - `sdk.createSessionToken(userInfo.openId, ...)` - **実行されている**（OAuthコールバック時）
  - **影響**: `/api/oauth/callback` エンドポイントが呼ばれると実行される
  - **現状**: MVPで認証が不要なら、このエンドポイントは呼ばれない

- **`server/_core/index.ts`** (37行目)
  - `registerOAuthRoutes(app)` - **実行されている**（サーバー起動時）
  - **影響**: OAuthルートが登録されるが、呼ばれなければ問題なし

#### 2. **ストレージ操作**
- **`server/routers.ts`** (65行目, 72行目, 79行目)
  - `storagePut(key, buffer, 'text/csv')` - **実行されている**（レポート保存時）
  - **影響**: **MVPでレポート保存機能を使用する場合、必須**
  - **現状**: `server/storage.ts` がManus Forge APIを使用しているため、環境変数未設定でエラーになる

- **`server/storage.ts`** (9-10行目)
  - `ENV.forgeApiUrl`, `ENV.forgeApiKey` - **実行されている**（ストレージ操作時）
  - **影響**: 環境変数未設定で `throw new Error()` が発生

#### 3. **認証関連UI**
- **`client/src/_core/hooks/useAuth.ts`** (46行目)
  - `localStorage.setItem("manus-runtime-user-info", ...)` - **実行されている**
  - **影響**: ローカルストレージに書き込むだけなので、MVPには影響なし

- **`client/src/const.ts`** (4-17行目)
  - `getLoginUrl()` - **実行されている**（認証が必要なページで）
  - **影響**: `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` が未設定だとURL生成が失敗する可能性

### B. **importされているだけ（実行されていない）**

#### 1. **ManusDialogコンポーネント**
- **`client/src/components/ManusDialog.tsx`**
  - **import箇所**: なし（どこからもimportされていない）
  - **状態**: 未使用のコンポーネント

#### 2. **Manusデバッグコレクター**
- **`vite.config.ts`** (7行目, 153行目)
  - `vitePluginManusRuntime()` - **importされているが、開発環境でのみ動作**
  - `vitePluginManusDebugCollector()` - **importされているが、開発環境でのみ動作**
  - **影響**: 開発環境でのみログ収集が行われるが、MVPには影響なし

- **`client/public/__manus__/debug-collector.js`**
  - **実行箇所**: `vite.config.ts` の `transformIndexHtml` で開発環境でのみ読み込まれる
  - **影響**: 開発環境でのみ動作、本番環境には影響なし

#### 3. **Manus型定義**
- **`server/_core/types/manusTypes.ts`**
  - **import箇所**: `server/_core/sdk.ts` (16行目)
  - **状態**: SDK内で使用されているが、SDK自体が実行されなければ問題なし

### C. **実行経路での使用状況まとめ**

| ファイル | シンボル | 実行状況 | MVPへの影響 |
|---------|---------|---------|------------|
| `server/_core/context.ts` | `sdk.authenticateRequest()` | ✅ 実行される（tRPCリクエストごと） | 🟡 認証がオプションなら問題なし |
| `server/_core/oauth.ts` | `sdk.exchangeCodeForToken()` | ✅ 実行される（OAuthコールバック時） | 🟢 OAuthコールバックが呼ばれなければ問題なし |
| `server/_core/oauth.ts` | `sdk.getUserInfo()` | ✅ 実行される（OAuthコールバック時） | 🟢 同上 |
| `server/_core/oauth.ts` | `sdk.createSessionToken()` | ✅ 実行される（OAuthコールバック時） | 🟢 同上 |
| `server/routers.ts` | `storagePut()` | ✅ **実行される（レポート保存時）** | 🔴 **MVPで必須（エラーになる）** |
| `server/storage.ts` | `ENV.forgeApiUrl` | ✅ 実行される（ストレージ操作時） | 🔴 **MVPで必須（エラーになる）** |
| `client/src/const.ts` | `getLoginUrl()` | ✅ 実行される（認証ページで） | 🟡 認証が不要なら問題なし |
| `client/src/_core/hooks/useAuth.ts` | `localStorage.setItem()` | ✅ 実行される | 🟢 ローカルストレージのみ、問題なし |
| `vite.config.ts` | `vitePluginManusRuntime()` | 🟡 開発環境でのみ | 🟢 本番環境には影響なし |
| `client/src/components/ManusDialog.tsx` | - | ❌ 未使用 | 🟢 問題なし |

---

## 4. MySQL使用箇所とMVPでの必要性判断

### MySQL使用箇所の特定

#### **使用されているファイル**

1. **`server/db.ts`**
   - `getDb()` - Drizzleインスタンス取得（10-18行目）
   - `upsertUser()` - ユーザー情報のupsert（21-78行目）
   - `getUserByOpenId()` - ユーザー情報取得（80-90行目）
   - `createReport()` - レポート作成（93-101行目）
   - `getReportByReportId()` - レポート取得（103-111行目）
   - `getReportsByUserId()` - ユーザー別レポート一覧（113-121行目）

2. **`server/routers.ts`**
   - `createReport()` - レポート保存時に呼び出し（84行目）
   - `getReportByReportId()` - レポート取得時に呼び出し（109行目）
   - `getReportsByUserId()` - レポート一覧取得時に呼び出し（128行目）

3. **`server/_core/oauth.ts`**
   - `db.upsertUser()` - OAuthコールバック時にユーザー情報を保存（31行目）

4. **`server/_core/context.ts`**
   - `sdk.authenticateRequest()` 内で `db.getUserByOpenId()` が呼ばれる（間接的）

5. **`drizzle/schema.ts`**
   - `users` テーブル定義（8-23行目）
   - `reports` テーブル定義（31-43行目）

### MVPでの必要性判断

#### 🔴 **MySQLはMVPで不要（Firestoreに置き換え可能）**

**理由:**
1. **レポート保存・取得**: 現在 `server/routers.ts` でMySQLを使用しているが、`client/src/lib/firestoreService.ts` でFirestore操作が既に実装されている
2. **ユーザー認証**: MVPで認証が不要なら、ユーザー関連のMySQL操作は不要
3. **二重データストア**: 現在MySQLとFirestoreの両方を使用しているが、Firestore一本に統一可能

**現状の問題:**
- `server/routers.ts` の `report.save` と `report.get` がMySQLを使用
- `client/src/pages/ZefrInsightReportFinal6.tsx` はtRPC経由でMySQLを使用
- `client/src/lib/firestoreService.ts` はFirestoreを直接使用（未使用）

### Firestore一本化のための最小変更案

#### **案1: tRPCルーターをFirestore操作に置き換え（推奨）**

**変更ファイル:**
- `server/routers.ts` - MySQL操作をFirestore操作に置き換え

**変更内容:**
```typescript
// 変更前（MySQL使用）
import { createReport, getReportByReportId } from "./db";

// 変更後（Firestore使用）
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

// createReport() を Firestore操作に置き換え
// getReportByReportId() を Firestore操作に置き換え
```

**メリット:**
- ✅ 既存のtRPC APIを維持
- ✅ クライアント側の変更不要
- ✅ サーバー側でパスワード検証を実施可能

**デメリット:**
- ❌ Firebase Admin SDKの導入が必要
- ❌ サーバー側の実装が必要

#### **案2: クライアント側でFirestore直接操作（MVP向け・簡易）**

**変更ファイル:**
- `client/src/pages/ZefrInsightReportFinal6.tsx` - tRPC呼び出しをFirestore直接操作に置き換え

**変更内容:**
```typescript
// 変更前（tRPC経由）
const saveReportMutation = trpc.report.save.useMutation();
await saveReportMutation.mutateAsync({ ... });

// 変更後（Firestore直接操作）
import { saveReport } from '@/lib/firestoreService';
await saveReport(reportId, config, processedData);
```

**メリット:**
- ✅ サーバー側の変更不要
- ✅ 実装が簡単
- ✅ MVPで動作確認しやすい

**デメリット:**
- ❌ パスワード検証がクライアント側で実施される（セキュリティリスク）
- ❌ 将来的にサーバー側検証が必要になる可能性

#### **案3: MySQL操作をno-op化（段階的移行）**

**変更ファイル:**
- `server/db.ts` - MySQL操作をno-op化

**変更内容:**
```typescript
// getDb() を常にnullを返すように変更
export async function getDb() {
  return null; // MySQL接続を無効化
}

// createReport() をno-op化
export async function createReport(report: InsertReport) {
  console.warn("[Database] MySQL is disabled. Use Firestore instead.");
  // Firestore操作に移行するまでの暫定対応
  return;
}

// getReportByReportId() をno-op化
export async function getReportByReportId(reportId: string) {
  console.warn("[Database] MySQL is disabled. Use Firestore instead.");
  return undefined;
}
```

**メリット:**
- ✅ 既存コードの変更が最小限
- ✅ 段階的に移行可能
- ✅ エラーを発生させずに無効化可能

**デメリット:**
- ❌ レポート保存・取得が動作しなくなる
- ❌ クライアント側でFirestore操作に切り替える必要がある

### 推奨アプローチ

**MVPでは案2（クライアント側でFirestore直接操作）を推奨**

**理由:**
1. サーバー側の変更が不要で、実装が簡単
2. MVPの目的（「動くこと」）を最優先
3. セキュリティはFirestore Rulesで担保（App Check + データ構造検証）
4. 将来的にサーバー側検証が必要になった場合、案1に移行可能

**実装手順:**
1. `client/src/pages/ZefrInsightReportFinal6.tsx` のtRPC呼び出しをFirestore直接操作に置き換え
2. `server/routers.ts` のMySQL操作をno-op化（エラーを発生させない）
3. 動作確認後、必要に応じてサーバー側実装に移行

---

## まとめ

### 動作確認に必要な最小設定

1. **Firebase設定**（既存）
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

2. **App Check設定**（新規追加）
   - `VITE_RECAPTCHA_SITE_KEY` - 本番環境で必須
   - `VITE_APPCHECK_DEBUG_TOKEN` - 開発環境でオプション

3. **Manus依存の無効化**（MVPで不要な場合）
   - `BUILT_IN_FORGE_API_URL` - 未設定でOK（ストレージ操作を無効化）
   - `BUILT_IN_FORGE_API_KEY` - 未設定でOK（同上）
   - `OAUTH_SERVER_URL` - 未設定でOK（認証を無効化）
   - `VITE_APP_ID` - 未設定でOK（同上）
   - `VITE_OAUTH_PORTAL_URL` - 未設定でOK（同上）

4. **MySQL設定**（MVPで不要）
   - `DATABASE_URL` - 未設定でOK（Firestoreのみ使用）

### MVPで必要な変更

1. **ストレージ操作の無効化**: `server/storage.ts` をno-op化
2. **認証の無効化**: `server/_core/context.ts` の認証をno-op化（既にオプション）
3. **レポート操作の切り替え**: tRPC経由のMySQL操作をFirestore直接操作に切り替え
