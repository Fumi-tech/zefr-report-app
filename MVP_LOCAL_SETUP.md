# MVP動作確認手順（ローカル）

## 前提条件

- Node.js 18以上
- pnpm インストール済み
- Firebase プロジェクト作成済み

## 1. 環境変数の設定

`.env.local` ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください。

### **必須環境変数（Firebase）**

```bash
# Firebase設定（Firebase Consoleから取得）
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

### **推奨環境変数（App Check）**

```bash
# reCAPTCHA v3サイトキー（本番環境で必須、開発環境ではテストキー使用可）
VITE_RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI  # デフォルトはテストキー

# App Checkデバッグトークン（開発環境でオプション）
# ブラウザコンソールに表示されるトークンをコピーして設定
VITE_APPCHECK_DEBUG_TOKEN=your_debug_token_here
```

### **オプション環境変数**

```bash
# MVPモード（デフォルトで有効、server不要）
MVP_MODE=true

# Firestoreエミュレーター使用（オプション）
VITE_USE_FIRESTORE_EMULATOR=false
```

## 2. 依存パッケージのインストール

```bash
pnpm install
```

## 3. Firestore Security Rulesのデプロイ

**初回のみ必要:**

```bash
# Firebase CLIがインストールされていない場合
npm install -g firebase-tools

# Firebaseにログイン
firebase login

# Firestore Rulesをデプロイ
firebase deploy --only firestore:rules
```

## 4. 開発サーバーの起動

```bash
# clientのみ起動（server不要）
pnpm dev

# ブラウザで http://localhost:5173 を開く
```

## 5. App Checkデバッグトークンの設定（開発環境）

1. ブラウザコンソールを開く（F12）
2. 以下のようなメッセージを確認:
   ```
   [Firebase] App Check debug token: ABC123DEF456...
   ```
3. デバッグトークンをコピー
4. Firebase Console > App Check > Apps でデバッグトークンを登録
   - または、`.env.local` に `VITE_APPCHECK_DEBUG_TOKEN=ABC123DEF456...` を設定して再起動

## 6. 動作確認フロー

### **ステップ1: CSVファイルのアップロード**
1. ブラウザで `http://localhost:5173` を開く
2. 「Zefr CSVレポートをアップロード」セクションを表示
3. 以下のCSVファイルをアップロード:
   - Performance CSV
   - Risk (Suitability) CSV
   - View (Viewability) CSV
   - Exclusion CSV（オプション）

### **ステップ2: レポート生成**
1. クライアント名を入力
2. 総インプレッション数を入力
3. 低品質ブロック数を入力
4. CPM（デフォルト: 1500）を設定
5. 「ファイルを処理」ボタンをクリック
6. ダッシュボードが表示されることを確認

### **ステップ3: レポート保存・共有**
1. パスワードを設定
2. 「レポートを生成して共有」ボタンをクリック
3. 共有URLが表示されることを確認
4. 共有URLをコピー

### **ステップ4: 共有URLからの閲覧**
1. 新しいタブで共有URLを開く（または `/shared/{reportId}` にアクセス）
2. パスワード入力画面が表示されることを確認
3. パスワードを入力
4. ダッシュボードが表示されることを確認

## 7. よく起きるエラーと対処法

### **エラー1: permission-denied（Firestore書き込み拒否）**

**症状:**
```
レポートの保存が拒否されました。App Checkが正しく設定されているか確認してください。
```

**原因:**
- App Checkが有効でない
- デバッグトークンが未設定
- Firestore Security Rulesが正しくデプロイされていない

**対処法:**
1. **App Checkデバッグトークンの設定**
   - ブラウザコンソールでデバッグトークンを確認
   - Firebase Console > App Check > Apps でデバッグトークンを登録
   - または、`.env.local` に `VITE_APPCHECK_DEBUG_TOKEN=your_token` を設定

2. **Firestore Security Rulesの確認**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Firebase Consoleでの確認**
   - Firebase Console > Firestore > Rules でルールが正しくデプロイされているか確認

### **エラー2: Firebase設定エラー**

**症状:**
```
Firebase: Error (auth/invalid-api-key)
```

**原因:** `VITE_FIREBASE_*` 環境変数が未設定または不正

**対処法:**
1. Firebase Console > プロジェクト設定 > 全般 > アプリ で設定値を確認
2. `.env.local` に正しく設定
3. 開発サーバーを再起動

### **エラー3: レポート取得エラー**

**症状:**
```
レポートの取得が拒否されました。レポートが存在しないか、アクセス権限がありません。
```

**原因:**
- Firestore Security Rulesで読み取りが拒否された
- レポートIDが存在しない

**対処法:**
1. Firestore Security Rulesを確認:
   ```javascript
   allow read: if resource != null 
               && resource.data.keys().hasAll(['config', 'processedData']);
   ```
2. Firebase Console > Firestore > データ でレポートが存在するか確認
3. 必要に応じて `firebase deploy --only firestore:rules` を実行

### **エラー4: App Checkモジュールが見つからない**

**症状:**
```
[Firebase] App Check module not available
```

**原因:** `firebase/app-check` モジュールが読み込めない

**対処法:**
- 警告のみで動作は継続可能（Firestore書き込みは拒否される）
- `firebase` パッケージが正しくインストールされているか確認:
  ```bash
  pnpm list firebase
  ```

## 8. 動作確認チェックリスト

- [ ] `pnpm dev` でエラーなく起動する
- [ ] ブラウザで `http://localhost:5173` が開ける
- [ ] CSVファイルをアップロードできる
- [ ] レポート生成ができる（ダッシュボード表示）
- [ ] レポート保存（Firestore）ができる
- [ ] 共有URLが生成される
- [ ] 共有URLからレポートを閲覧できる（パスワード入力）
- [ ] App Checkデバッグトークンがコンソールに表示される
- [ ] Firebase Consoleでレポートデータが保存されていることを確認

## 9. トラブルシューティング

### **開発サーバーが起動しない**

```bash
# ポートが使用中の場合
# vite.config.ts でポートを変更するか、別のターミナルで使用中のプロセスを終了

# 依存パッケージの問題
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### **Firestoreに接続できない**

1. Firebase ConsoleでFirestoreが有効化されているか確認
2. `.env.local` の `VITE_FIREBASE_PROJECT_ID` が正しいか確認
3. ネットワーク接続を確認

### **App Checkが動作しない**

1. ブラウザコンソールでエラーメッセージを確認
2. `firebase/app-check` モジュールが正しくインストールされているか確認
3. reCAPTCHA v3サイトキーが正しく設定されているか確認

## 10. 次のステップ

1. **本番環境へのデプロイ準備**
   - reCAPTCHA v3サイトキーの取得（本番用）
   - Firebase Hostingの設定
   - `firebase.json` の作成

2. **Firebase Hostingへのデプロイ**
   ```bash
   pnpm build
   firebase deploy --only hosting
   ```

---

## 11. E2Eチェックリスト（実際に手で操作する手順）

### **チェック1: CSVアップロード → レポート生成 → Firestore保存 → 共有URL表示**

**手順:**
1. `pnpm dev` で開発サーバーを起動
2. ブラウザで `http://localhost:5173` を開く
3. **CSVファイルをアップロード:**
   - Performance CSV を選択
   - Risk (Suitability) CSV を選択
   - View (Viewability) CSV を選択
   - Exclusion CSV を選択（オプション）
4. **入力項目を設定:**
   - クライアント名: テスト用の名前を入力（例: "Test Client"）
   - Total Measurable Impressions: "50M" または "50000K" を入力
   - Low-quality Impressions Blocked: "100K" または "0.1M" を入力
   - 推定CPM: "1500"（デフォルト値）
   - 共有用パスワード: 任意のパスワードを設定（例: "test123"）
5. **「レポートを生成して共有」ボタンをクリック**
6. **確認事項:**
   - ✅ ダッシュボードが表示される
   - ✅ KPIカードに数値が表示される
   - ✅ チャートが表示される（データがある場合）
   - ✅ 共有URLが表示される
   - ✅ ブラウザコンソールにエラーが表示されない
   - ✅ Firestoreにデータが保存されている（Firebase Consoleで確認）

**期待結果:**
- エラーなくレポートが生成される
- 共有URLが表示される
- Firestoreに `reports/{reportId}` が作成される

---

### **チェック2: /shared/:id に直アクセス → パスワード入力 → Firestore取得 → ダッシュボード表示**

**手順:**
1. チェック1で生成された共有URLをコピー
2. **新しいタブ（またはシークレットモード）で共有URLを開く**
   - 例: `http://localhost:5173/shared/report_xxxxx`
3. **パスワード入力画面が表示されることを確認**
4. **パスワードを入力**（チェック1で設定したパスワード）
5. **「レポートを表示」ボタンをクリック**
6. **確認事項:**
   - ✅ ダッシュボードが表示される
   - ✅ KPIカードの数値がチェック1と同じである
   - ✅ チャートが表示される（データがある場合）
   - ✅ デバイス別Viewabilityチャートが表示される（`deviceViewabilityData` が保存されている場合）
   - ✅ ブラウザコンソールにエラーが表示されない
   - ✅ ブラウザコンソールに `[Data Migration]` ログが表示されない（新規データの場合）

**期待結果:**
- エラーなくレポートが表示される
- チェック1で生成したレポートと同じ内容が表示される
- `deviceViewabilityData` が正しく復元される（デバイス別チャートが表示される）

---

### **チェック3: データ損失の確認（deviceViewabilityData, totalImpressions, estimatedCPM）**

**手順:**
1. チェック1でレポートを生成
2. Firebase Console > Firestore > データ で保存されたデータを確認
3. **確認事項:**
   - ✅ `processedData.deviceViewabilityData` が存在する（配列形式）
   - ✅ `processedData.totalImpressions` が存在する（数値）
   - ✅ `processedData.estimatedCPM` が存在する（数値）
4. チェック2で共有URLから復元
5. **確認事項:**
   - ✅ デバイス別Viewabilityチャートが表示される
   - ✅ `totalImpressions` が実測値で復元される（概算値ではない）
   - ✅ `estimatedCPM` が保存された値で復元される（逆算値ではない）

**期待結果:**
- データ損失が発生しない
- 共有URLから復元したレポートが、ローカル生成時と同じ表示になる

---

### **チェック4: 空データ・エッジケースの確認**

**手順:**
1. **空のCSVファイルをアップロード**（または、データが少ないCSV）
2. レポート生成を試行
3. **確認事項:**
   - ✅ エラーが発生しない
   - ✅ 空データの場合でもダッシュボードが表示される
   - ✅ チャートに「データがありません」メッセージが表示される（空データの場合）

**期待結果:**
- 空データでもクラッシュしない
- 適切なフォールバック表示がされる

---

### **チェック5: エラーメッセージの確認**

**手順:**
1. **App Checkを無効化**（`.env.local` から `VITE_RECAPTCHA_SITE_KEY` を削除）
2. レポート保存を試行
3. **確認事項:**
   - ✅ エラーメッセージに「考えられる原因」が3つ表示される
   - ✅ App Check / Firestore Rules / 環境変数の3つが列挙されている
   - ✅ ブラウザコンソールに `[Firestore] Permission denied details:` が表示される

**期待結果:**
- エラーメッセージが分かりやすい
- 原因候補が明確に示される

---

### **チェック6: 古いデータとの互換性確認（オプション）**

**手順:**
1. 古い形式で保存されたレポート（`deviceViewabilityData`, `totalImpressions`, `estimatedCPM` が存在しない）を共有URLから開く
2. **確認事項:**
   - ✅ エラーが発生しない
   - ✅ ブラウザコンソールに `[Data Migration]` ログが表示される
   - ✅ フォールバック値で表示される（`deviceViewabilityData` は空配列、`totalImpressions` は概算値、`estimatedCPM` は逆算値）

**期待結果:**
- 古いデータでも動作する
- フォールバック処理が正しく機能する

---

## 12. 修正済み項目の確認

### **STEP A-1 で指摘された問題の修正状況**

| 問題 | 修正状況 | 確認方法 |
|------|---------|---------|
| deviceViewabilityData が保存されない | ✅ 修正済み | チェック3で確認 |
| totalImpressions が概算値になる | ✅ 修正済み | チェック3で確認 |
| estimatedCPM が保存されない | ✅ 修正済み | チェック3で確認 |
| null/undefined/空配列で落ちる | ✅ 修正済み | チェック4で確認 |
| エラーメッセージが不十分 | ✅ 修正済み | チェック5で確認 |

**詳細:** `STEP_A_FIXES_COMPLETE.md` を参照

