# PHASE 1: CSVパース／集計 問題箇所の特定

メイン画面: **ZefrInsightReportFinal6**（`client/src/pages/ZefrInsightReportFinal6.tsx`）。
CSVは「performance / risk / view」の3スロットで受け取り、`parseCSV` → `processFiles` で集計している。

---

## サンプルCSVの実ヘッダ（client/public/sample-data/）

| ファイル | 実ヘッダ |
|----------|----------|
| performance.csv | Date, Account, Impressions, Clicks, CTR |
| suitability.csv | Date, Account, Impressions, Suitable Impressions, Suitability Rate |
| viewability.csv | Date, Account, Impressions, Viewable Impressions, VTR, VCR |
| exclusion.csv | （Final6では未使用スロット） |

---

## A) 型検出／ヘッダ正規化

### 1. Performance が一度も「ヘッダ」と判定されない（parseCSV L184–202）

- **箇所:** `ZefrInsightReportFinal6.tsx` の `parseCSV` 内、`(hasCategory || hasVCR) && (hasVCR || hasCTR) && hasImpressions`
- **原因:** サンプルには `Category Name` / `VCR` がなく、`hasCategory` と `hasVCR` が常に false。そのため performance 用のヘッダ行判定が通らず、**performance スロットに performance.csv を入れても data が空**になる。
- **期待:** `Impressions` と `CTR`（または `Clicks`）があれば performance とみなす。
- **修正方針:** 条件に「`hasImpressions && (hasCTR || hasClicks)`」を追加するか、別分支で performance と判定する。

### 2. ヘッダの BOM／前後スペース未除去

- **箇所:** `parseCSV` で `cells.map(h => h.toLowerCase().trim())` のみ。先頭セルに BOM がつくと `"\ufeffdate"` のようになる。
- **原因:** BOM を考慮していない。
- **修正方針:** 先頭セルに `\ufeff` が含まれる場合は除去してから正規化する。

### 3. Risk / View の型検出

- **Risk:** `(hasBrandSuitability || hasSuitableImpressions) && hasDate` → サンプルは「Suitable Impressions」があるため **検出される**。この部分は維持でよい。
- **View:** `(hasViewability || hasGrossImpressions || hasDeviceType) && hasDate` → サンプルは「Viewable Impressions」「VTR」があるので **検出される**。維持でよい。

---

## B) 日付パース／ソート

### 4. 日付が文字列のまま・ソートが文字列順

- **箇所:** `brandSuitabilityData` / `viewabilityData` / `deviceViewabilityData` の `date` をそのまま文字列で保持し、`.sort()` していない。
- **原因:** `Date` 列が "2024-01-15" や "01/18/2024" など複数形式で入っても、日付として解釈・ソートしていない。
- **結果:** DAILY QUALITY & VOLUME TREND / DAILY VIEWABILITY で**日付順にならず、並びがおかしい**。
- **修正方針:** YYYY-MM-DD / MM/DD/YYYY などを `Date` にパースする関数を用意し、表示用に YYYY-MM-DD に統一。集計前に `date` で昇順ソートする。

---

## C) 数値パース

### 5. cleanNum が "N/A" や "-" を未処理

- **箇所:** `ZefrInsightReportFinal6.tsx` の `cleanNum(val)`（L109–113）。`String(val).replace(/[%,$,]/g,'')` のみ。
- **原因:** `"N/A"`, `"n/a"`, `"-"`, 空文字の扱いが明示的でない。`parseFloat("N/A")` は NaN → 現状は NaN のとき 0 にしていない可能性がある（実装次第）。
- **修正方針:** 空・`"N/A"`・`"n/a"`・`"-"` などは 0 にし、それ以外で `parseFloat` が NaN のときも 0 を返す。

---

## D) 集計ロジックと列名マッピング

### 6. Risk: 「Suitability Rate」をそのまま ×100 している（L331）

- **箇所:** `brandSuitabilityData` の `suitability: suitabilityHeader ? cleanNum(d[suitabilityHeader]) * 100 : 0`
- **原因:** サンプルの "Suitability Rate" は **すでに 0–100**（例: 84.0）。ここでさらに ×100 すると 8400 になり、**DAILY QUALITY の Brand Suitability % が異常値**になる。
- **修正方針:** 列が「レート／％」系で値が 0–100 の範囲ならそのまま使う。または **行ごとに (Suitable Impressions / Impressions) * 100** で統一する（推奨）。

### 7. Risk: totalImpressionsHeader の候補に "Impressions" のみのパターン

- **箇所:** `findRiskHeader(['total','impression'])`
- **原因:** サンプルは "Impressions" のみ。`'impression'` で部分一致するため現状でも取れるが、将来「Total Measurable Impressions」など別名が出た場合を考慮すると、「impression」単独も明示的に許容した方が安全。
- **修正方針:** 既に `'impression'` があるので、意図をコメントで明記する程度で可。必要なら `['total','impression','impressions']` にしておく。

### 8. View: viewability の列が VTR/VCR に対応していない（L364–375）

- **箇所:** `viewabilityHeader = findViewHeader(['viewability','rate'])`。サンプルには "Viewability Rate" がなく、"VTR","VCR" しかない。
- **原因:** `viewabilityHeader` が null のままになり、**viewability が常に 0**。
- **修正方針:** `['viewability','rate','vtr','viewable']` の順で探す。サンプルは "VTR" が viewability に相当するので、VTR を優先して使う。

### 9. View: インプレッション列が "Gross Impressions" 前提（L365）

- **箇所:** `grossImpressionsHeader = findViewHeader(['gross','impression'])`
- **原因:** サンプルは "Impressions" のみ。"gross" がないため **grossImpressionsHeader が null** になり、viewability の impression が取れない。
- **修正方針:** フォールバックで `['impression']` 単独でも検索する（または view 用の find で 'gross' を必須にしない）。

### 10. View: デバイス列がない場合に OTT / Mobile App が一切出ない（L379–415）

- **箇所:** `deviceTypeHeader = findViewHeader(['device','type'])`。サンプルには Device 列がない。
- **原因:** `deviceTypeHeader` が null → 全行が "Unknown" → `deviceViewabilityData` は `date` + "Unknown" のみ。一方、チャートは **"OTT" / "Mobile App" / "Mobile Web"** を前提にしているため、**どの系列も描画されない**。
- **修正方針:**  
  - Device 列があるとき: 値を正規化（"OTT","Mobile App","Mobile Web","Desktop" など）してチャートの dataKey と揃える。  
  - Device 列がないとき: 日別 viewability を "Overall"（あるいは単一の仮デバイス名）として 1 本の折れ線で出す。

### 11. Performance: Category Name / VCR がないサンプルでのマッピング（L279–281, L293–297）

- **箇所:** `categoryHeader` / `vcrHeader`。サンプル performance.csv には "Category Name" も "VCR" もない。
- **原因:** `categoryHeader` / `vcrHeader` が null → PERFORMANCE BY CONTEXT の点がすべて "Unknown", vcr=0 になり、**縦軸・横軸が意図と合わない**。
- **修正方針:**  
  - Category がないときは "Account" や "Date" をコンテキスト名のフォールバックに使う。  
  - VCR がないときは "CTR" を横軸用に使うなど、**存在する列で軸を組み替える**。  
  - サンプル程度の MVP なら「Impressions + CTR のみ」で、x=CTR, y=別指標 or 固定、などにしてもよい。

---

## E) デバッグ用サマリー（要件 C）

- **箇所:** 現状なし。
- **やること:** アップロード直後（各ファイルの `parseCSV` 後、または `processFiles` 内で fileData が揃った直後）に、  
  - 検出タイプ（performance/risk/view）、行数、date の min/max、主要列の合計（impressions など）を **console に出す**。  
  - 任意で、簡易の **UI 用サマリー**（「Performance: 4 行, 2024-01-15–2024-01-18, Sum Impressions: 205000」など）を表示する。
- **目的:** 数字がどこでずれたか追いやすくする。

---

## 修正対象ファイル（PHASE 1）

| ファイル | 修正内容 |
|----------|----------|
| `client/src/pages/ZefrInsightReportFinal6.tsx` | parseCSV の型検出・BOM除去、日付パース／ソート、cleanNum の N/A 扱い、Risk/View/Performance の列マッピングと集計ロジック、デバッグサマリーの追加 |

※ `client/src/lib/csvProcessor.ts` は、現行のメインルート（ZefrInsightReportFinal6）では使われていない。別ルート（ZefrInsightReport）で parseCSVFile / processReports を使う場合は、同様の考え方で別途修正する。

---

## PHASE 1 再現手順・期待値・確認観点

### 再現手順

1. `npm run dev` で起動し、http://localhost:5173 を開く。
2. セットアップで以下を入力する。
   - **Performance:** `client/public/sample-data/performance.csv` を選択。
   - **Risk:** `client/public/sample-data/suitability.csv` を選択。
   - **View:** `client/public/sample-data/viewability.csv` を選択。
   - クライアント名・Total Measurable Impressions（例: 205000 または 205K）・Low-quality Blocked（例: 30800）・推定CPM・共有用パスワードを入力。
3. 「レポートを生成して共有」をクリックする。

### 期待値（サンプルCSV前提）

- **ブランド適合率:** suitability.csv の合計 Suitable / 合計 Impressions × 100 ≒ 84.5%（205000 中 173750 等）。
- **DAILY QUALITY & VOLUME TREND:** 日付が 2024-01-15 → 2024-01-18 の順で並び、日別の Bar（impressions）と Line（Brand Suitability %）が一致する。
- **適合性サマリー:** 上記適合率と一致し、サマリー円グラフの % が同じ値になる。
- **PERFORMANCE BY CONTEXT:** performance.csv の行が点で表示され、横軸・縦軸に CTR または VCR、大きさに Impressions が反映される（Category がなければ Account/Date で代用）。
- **DAILY VIEWABILITY TREND BY DEVICE:** viewability.csv に Device 列がなければ「Overall」1本の折れ線で VTR 相当の % が表示される。Device 列があれば OTT / Mobile App / Mobile Web などが系列になる。
- **コンソール:** `[CSV Summary]` に performance / risk / view の検出タイプ・行数・date min/max・主要列の合計が出る。

### 確認観点

- [ ] Performance スロットに performance.csv を入れたとき、データが空にならず PERFORMANCE BY CONTEXT に点が表示される。
- [ ] Risk スロットに suitability.csv を入れたとき、ブランド適合率が「Suitable合計/Impressions合計×100」と一致する。
- [ ] DAILY QUALITY の日付が昇順で、Brand Suitability % が 0–100 の範囲で表示される。
- [ ] View スロットに viewability.csv を入れたとき、Viewability が 0 ばかりにならず、VTR 相当の値が表示される。
- [ ] Device 列のない viewability では「Overall」が 1 本でも描画される。
- [ ] 開発者ツールの Console に `[CSV Summary]` が出力され、行数・date min/max・sum が確認できる。
