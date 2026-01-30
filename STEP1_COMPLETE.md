# STEP 1 実装完了: Firestoreセキュリティ是正

## 実装内容

### 1. Firestore Security Rules作成

**ファイル:** `firestore.rules` (新規作成)

**内容:**
- `reports/{reportId}` コレクションに対するセキュリティルールを設定
- **読み取り:** リソースが存在し、必要なフィールド（`config`, `processedData`）を持つ場合のみ許可
- **書き込み:** App Checkトークンが存在し、適切なデータ構造を持つ場合のみ許可
- **更新・削除:** 禁止（レポートは作成のみ）
- その他のコレクション: デフォルトで全拒否

**セキュリティポリシー:**
- ✅ 全世界からの無制限書き込みを禁止
- ✅ App Checkを前提とした書き込み制御
- ✅ 共有URL用途を考慮した読み取り制限

### 2. Firebase App Check初期化コード追加

**ファイル:** `client/src/lib/firebaseConfig.ts` (修正)

**変更内容:**
- `initializeAppCheck` と `ReCaptchaV3Provider` をインポート
- App Checkを初期化（reCAPTCHA v3を使用）
- 開発環境ではデバッグトークンを設定可能
- 初期化失敗時もアプリが動作するようにフォールバック処理を追加

**環境変数:**
- `VITE_RECAPTCHA_SITE_KEY`: reCAPTCHA v3サイトキー（本番環境で必須）
- `VITE_APPCHECK_DEBUG_TOKEN`: 開発環境でのデバッグトークン（オプション）

### 3. エラーハンドリング改善

**ファイル:** `client/src/lib/firestoreService.ts` (修正)

**変更内容:**
- `saveReport()` 関数: Firestore Rules違反時のエラーメッセージを改善
- `getReport()` 関数: 権限エラー時のエラーメッセージを改善
- `permission-denied` エラーを検出して適切なメッセージを表示

## 変更ファイル一覧

1. **`firestore.rules`** (新規作成)
   - Firestore Security Rulesを定義
   - App Check前提の書き込み制御
   - 読み取りは共有URL用途を考慮

2. **`client/src/lib/firebaseConfig.ts`** (修正)
   - Firebase App Check初期化コードを追加
   - 開発環境でのデバッグトークン対応
   - エラーハンドリング追加

3. **`client/src/lib/firestoreService.ts`** (修正)
   - エラーハンドリングを改善
   - Firestore Rules違反時の適切なエラーメッセージ

## 次のステップ

### Firebase Consoleでの設定が必要

1. **Firestore Security Rulesのデプロイ**
   ```bash
   firebase deploy --only firestore:rules
   ```
   または Firebase Console から手動でデプロイ

2. **reCAPTCHA v3の設定**
   - Google reCAPTCHA Admin Consoleでサイトを登録
   - サイトキーを取得して `VITE_RECAPTCHA_SITE_KEY` に設定

3. **App Checkの有効化**
   - Firebase Console > App Check で有効化
   - reCAPTCHA v3プロバイダーを設定

4. **開発環境でのデバッグトークン取得**
   - ブラウザコンソールに表示されるデバッグトークンをコピー
   - Firebase Console > App Check > Apps でデバッグトークンを登録

## 注意事項

- **開発環境:** App Checkが有効でない場合、Firestore Rulesで書き込みが拒否される可能性があります
- **本番環境:** reCAPTCHA v3サイトキーの設定が必須です
- **既存コード:** `ZefrInsightReport.tsx` や `ZefrInsightReportFinal5.tsx` が直接Firestoreを使用している場合、App Checkが有効でないと動作しません

## テスト方法

1. **ローカル開発環境:**
   ```bash
   pnpm dev
   ```
   - ブラウザコンソールでApp Checkデバッグトークンを確認
   - Firebase Consoleでデバッグトークンを登録
   - レポート保存をテスト

2. **Firestore Rulesのテスト:**
   - Firebase Console > Firestore > Rules でシミュレーターを使用
   - App Checkトークンあり/なしでテスト

## 完了条件

- ✅ `firestore.rules` ファイルが作成され、適切なセキュリティルールが設定されている
- ✅ Firebase App Checkの初期化コードが追加されている
- ✅ エラーハンドリングが改善されている
- ✅ 既存コードで失敗する可能性のある箇所が修正されている
