# PHASE 2（PDF/PPTX）・PHASE 3（Web発行）対応メモ

## PHASE 2: PDF/PPTX エクスポート

### 修正内容

| ファイル | 修正内容 |
|----------|----------|
| `client/src/pages/ZefrInsightReportFinal6.tsx` | ・`handlePDFExport` / `handlePPTXExport`: 要素未取得時に `setError` で理由を表示<br>・html2canvas 失敗時は scale=1, allowTaint でリトライ<br>・PDF: A4 に収まるよう画像サイズを自動調整（はみ出し時は縮小）<br>・PPTX: アスペクト比を保ってスライドに画像を配置<br>・ファイル名に使えない文字を除去<br>・ダッシュボード上にエラーバナーを追加（PDF/PPTX 失敗時に表示・閉じる可能） |

### 再現手順

1. `npm run dev` で起動し、http://localhost:5173 を開く。
2. セットアップで 3 種類の CSV と必須項目を入力し、「レポートを生成して共有」でダッシュボードへ進む。
3. ダッシュボードで「PDF」または「PPTX」をクリックする。

### 期待値

- **PDF:** ダッシュボード 1 枚分が A4 縦でダウンロードされる。長い場合は高さでトリムされず、縦横比を保ったまま A4 内に収まる。
- **PPTX:** 同じく 1 枚のスライドにダッシュボードが画像として出力され、縦横比が保たれたままダウンロードされる。
- **失敗時:** ダッシュボード上部に赤いエラーバナーが表示され、原因が分かる（例: 要素未取得、キャプチャ失敗）。「閉じる」で非表示にできる。

### 確認観点

- [ ] ダッシュボード表示後に PDF を押すと、PDF がダウンロードされる（または明確なエラーメッセージが出る）。
- [ ] 同様に PPTX を押すと、PPTX がダウンロードされる（または明確なエラーメッセージが出る）。
- [ ] キャプチャ失敗時などは、「画面のキャプチャに失敗しました: …」など具体的な文言がエラーバナーに表示される。
- [ ] エラーバナーの「閉じる」でメッセージが消える。

---

## PHASE 3: Web発行（Firestore保存/共有URL）

### 修正内容

| ファイル | 修正内容 |
|----------|----------|
| `client/src/pages/ZefrInsightReportFinal6.tsx` | ・`handleWebPublish`: 失敗時に `setError` で詳細を表示（permission-denied などは firestoreService のメッセージをそのまま表示）<br>・ダッシュボードにエラーバナーを追加（Web発行失敗時も同じバナーで表示） |
| `client/src/lib/firestoreService.ts` | ・`getReport`: `deviceViewabilityData` が配列でない場合でも `[]` を返すようにし、 ProcessedData と整合させる |

### ProcessedData スキーマ（保存・復元の整合）

- **保存時（convertReportDataToProcessedData）:**  
  `performance`, `suitability`, `viewability`, `exclusion`, `deviceViewabilityData`, `totalImpressions`, `estimatedCPM`, `kpis`, `loadedReports` などを渡す。
- **Firestore 保存（saveReport）:**  
  `performance` / `suitability` / `viewability` / `exclusion` はドキュメント直下に保存。  
  `deviceViewabilityData`, `totalImpressions`, `estimatedCPM` は `processedData` 内に保存。
- **取得時（getReport）:**  
  直下の配列と `processedData` 内のフィールドを組み合わせて ProcessedData を復元。  
  `deviceViewabilityData` が無い/配列でない場合は `[]` を渡す。
- **復元後（convertProcessedDataToReportData）:**  
  `deviceViewabilityData` などが欠けていても空配列で補完し、共有URLから開いたときも同じレイアウトで表示される。

### 再現手順

1. ダッシュボードまで進み、共有用パスワードを入力して「Web発行」をクリックする。
2. 成功時: 共有URLが表示され、コピーできる。
3. 別タブまたはシークレットで、その共有URLを開く。
4. 保存時に設定したパスワードを入力して「レポートを表示」をクリックする。

### 期待値

- **保存成功時:** 共有URLが表示され、コピーでクリップボードに反映される。
- **保存失敗時（例: permission-denied）:** ダッシュボード上のエラーバナーに「レポートの保存が拒否されました。考えられる原因: …」など、firestoreService で定義した詳細が表示される。
- **共有URLで開く:** パスワード入力後、元のダッシュボードと同じ KPI・チャート・デバイス別 Viewability（Overall/OTT/Mobile App/Mobile Web など）が表示される。

### 確認観点

- [ ] Web発行に失敗したとき、ダッシュボード上部のエラーバナーに「保存が拒否されました」や「考えられる原因」が含まれる。
- [ ] 保存に成功したあと、共有URLを開いてパスワードを入力すると、同じレポートが表示される。
- [ ] 共有URL経由でも、DAILY VIEWABILITY TREND BY DEVICE に Overall/OTT 等の系列が欠けず表示される（deviceViewabilityData が正しく保存・復元されていること）。
