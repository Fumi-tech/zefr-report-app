# STEP A-1: E2Eチェックと欠陥洗い出し結果

## ユーザーフロー1: CSVアップロード → Firestore保存 → 共有URL表示

### フロー詳細

1. **CSV 4種アップロード** (`handleFileUpload`)
   - ファイル: `ZefrInsightReportFinal6.tsx:120-125`
   - 状態: ✅ 問題なし

2. **ファイル処理** (`processFiles`)
   - ファイル: `ZefrInsightReportFinal6.tsx:200-407`
   - 処理内容:
     - CSV解析 (`parseCSV`)
     - Performance/Risk/Viewデータ処理
     - `reportData` オブジェクト生成（385-398行目）
   - **生成される `reportData` 構造:**
     ```typescript
     {
       clientName: string,
       totalImpressions: number,        // ← 実際の値
       lowQualityBlocked: number,
       estimatedCPM: number,
       suitabilityRate: number,
       lift: number,
       budgetOptimization: number,
       performanceData: Array,
       brandSuitabilityData: Array,
       viewabilityData: Array,
       deviceViewabilityData: Object,  // ← デバイス別データ（重要）
       createdAt: string
     }
     ```

3. **レポート生成 → Firestore保存** (`handleWebPublish`)
   - ファイル: `ZefrInsightReportFinal6.tsx:409-444`
   - 処理内容:
     - `convertReportDataToProcessedData(reportData)` で変換
     - `saveReport(reportId, config, processedData)` で保存

4. **共有URL表示**
   - ファイル: `ZefrInsightReportFinal6.tsx:435-437`
   - 状態: ✅ 問題なし

### 🔴 **発見された問題点**

#### **問題1: deviceViewabilityData が保存されない**

**場所:** `convertReportDataToProcessedData` (21-43行目)

**問題:**
- `reportData.deviceViewabilityData` が `ProcessedData` に含まれていない
- `ProcessedData` インターフェースに `deviceViewabilityData` フィールドがない
- 結果: 共有URLから復元したレポートで `deviceViewabilityData` が空になり、チャートが表示されない

**影響箇所:**
- `ZefrInsightReportFinal6.tsx:856` - `LineChart data={reportData.deviceViewabilityData || []}`

**修正方針:**
- `ProcessedData` インターフェースに `deviceViewabilityData?: Record<string, any>[]` を追加
- `convertReportDataToProcessedData` で `deviceViewabilityData` を保存
- `convertProcessedDataToReportData` で `deviceViewabilityData` を復元

#### **問題2: totalImpressions が概算値になる**

**場所:** `convertProcessedDataToReportData` (49行目)

**問題:**
- `totalImpressions: processedData.kpis.totalExclusions * 10` - 概算値
- 実際の `totalImpressions` が `ProcessedData` に保存されていない
- 結果: 共有URLから復元したレポートで `totalImpressions` が不正確

**影響箇所:**
- UI表示には直接影響なし（`totalImpressions` は表示されていない）
- ただし、データの整合性が失われる

**修正方針:**
- `ProcessedData` インターフェースに `totalImpressions?: number` を追加（オプショナル）
- `convertReportDataToProcessedData` で `totalImpressions` を保存
- `convertProcessedDataToReportData` で `totalImpressions` を復元

#### **問題3: CPM計算のエッジケース**

**場所:** `handleAccessReport` (469-471行目)

**問題:**
- `totalExclusions` が 0 の場合、デフォルト値 1500 を使用
- `budgetOptimization` が 0 の場合も考慮が必要
- ゼロ除算の可能性（`totalExclusions / 1000` は問題なしが、`budgetOptimization / (totalExclusions / 1000)` で `totalExclusions` が 0 の場合に Infinity になる）

**修正方針:**
- ゼロ除算チェックを追加
- `config.cpm` を `ProcessedData` に保存して、復元時に使用

---

## ユーザーフロー2: /shared/:id に直アクセス → パスワード入力 → ダッシュボード表示

### フロー詳細

1. **URLパラメータからレポートID取得** (`useEffect`)
   - ファイル: `ZefrInsightReportFinal6.tsx:521-527`
   - 状態: ✅ 問題なし

2. **パスワード入力画面表示** (`stage === 'shared'`)
   - ファイル: `ZefrInsightReportFinal6.tsx:531-578`
   - 状態: ✅ 問題なし

3. **Firestore取得 → パスワード検証** (`handleAccessReport`)
   - ファイル: `ZefrInsightReportFinal6.tsx:452-482`
   - 処理内容:
     - `getReportWithPassword(sharedReportId, accessPassword)` で取得
     - `convertProcessedDataToReportData(processedData, cpm)` で変換

4. **ダッシュボード表示** (`stage === 'dashboard'`)
   - ファイル: `ZefrInsightReportFinal6.tsx:709-951`
   - 状態: ⚠️ `deviceViewabilityData` が空の場合、チャートが表示されない

### 🔴 **発見された問題点**

#### **問題4: ProcessedData → reportData 変換時のデータ損失**

**場所:** `convertProcessedDataToReportData` (46-61行目)

**問題:**
- `deviceViewabilityData: {}` - 常に空オブジェクト
- `totalImpressions` - 概算値（実際の値が失われる）
- `insights` - 空配列（`ProcessedData` に含まれているが使用されていない）

**影響:**
- デバイス別Viewabilityチャートが表示されない
- データの整合性が失われる

#### **問題5: null/undefined チェックの不足**

**場所:** 複数箇所

**問題:**
- `reportData` が null の場合のチェックはあるが、各フィールドが undefined の場合のフォールバックが不十分
- `reportData.performanceData?.map()` など、オプショナルチェーンは使用されているが、空配列の場合の処理が不十分

**影響箇所:**
- `ZefrInsightReportFinal6.tsx:829-831` - `performanceData.map()` で空配列の場合にエラー
- `ZefrInsightReportFinal6.tsx:764` - `brandSuitabilityData` が空の場合、チャートが表示されない

**修正方針:**
- 各フィールドにデフォルト値を設定
- 空配列チェックを追加

#### **問題6: Firestore保存時のデータ構造不一致**

**場所:** `firestoreService.ts:saveReport` (39-60行目)

**問題:**
- `processedData` をネストして保存しているが、`performance`, `suitability`, `viewability`, `exclusion` はトップレベルに保存
- `getReport` で取得する際、この構造を正しく復元しているが、データ構造が複雑

**確認:**
- `firestoreService.ts:76-105` で正しく復元されている ✅
- ただし、`deviceViewabilityData` が含まれていない ❌

---

## データ変換ロジックの整合性チェック

### **convertReportDataToProcessedData** (21-43行目)

| reportData フィールド | ProcessedData フィールド | 状態 | 問題 |
|----------------------|------------------------|------|------|
| `clientName` | `accountName` | ✅ | なし |
| `createdAt` | `reportingPeriod` | ⚠️ | 日付形式の不一致の可能性 |
| `performanceData` | `performance` | ✅ | なし |
| `brandSuitabilityData` | `suitability` | ✅ | なし |
| `viewabilityData` | `viewability` | ✅ | なし |
| `deviceViewabilityData` | **なし** | 🔴 | **データ損失** |
| `exclusion` | `exclusion: []` | ⚠️ | 常に空配列（現在は問題なし） |
| `suitabilityRate` | `kpis.finalSuitability` | ✅ | なし |
| `lift` | `kpis.lift` | ✅ | なし |
| `lowQualityBlocked` | `kpis.totalExclusions` | ✅ | なし |
| `budgetOptimization` | `kpis.budgetOptimization` | ✅ | なし |
| `totalImpressions` | **なし** | 🔴 | **データ損失** |
| `estimatedCPM` | **なし** | 🔴 | **データ損失（CPM逆算が必要）** |
| `insights` | `insights: []` | ⚠️ | 常に空配列（現在は問題なし） |

### **convertProcessedDataToReportData** (46-61行目)

| ProcessedData フィールド | reportData フィールド | 状態 | 問題 |
|-------------------------|---------------------|------|------|
| `accountName` | `clientName` | ✅ | なし |
| `reportingPeriod` | `createdAt` | ✅ | なし |
| `performance` | `performanceData` | ✅ | なし |
| `suitability` | `brandSuitabilityData` | ✅ | なし |
| `viewability` | `viewabilityData` | ✅ | なし |
| **なし** | `deviceViewabilityData: {}` | 🔴 | **常に空オブジェクト** |
| `exclusion` | **なし** | ⚠️ | 使用されていない（問題なし） |
| `kpis.finalSuitability` | `suitabilityRate` | ✅ | なし |
| `kpis.lift` | `lift` | ✅ | なし |
| `kpis.totalExclusions` | `lowQualityBlocked` | ✅ | なし |
| `kpis.budgetOptimization` | `budgetOptimization` | ✅ | なし |
| **なし** | `totalImpressions` (概算値) | 🔴 | **実際の値が失われる** |
| **なし** | `estimatedCPM` (逆算値) | ⚠️ | 逆算ロジックに問題の可能性 |

---

## エラーハンドリングの確認

### **Firestore保存エラー** (`firestoreService.ts:61-70`)

**現在のエラーメッセージ:**
```typescript
if (error?.code === 'permission-denied') {
  throw new Error('レポートの保存が拒否されました。App Checkが正しく設定されているか確認してください。');
}
```

**問題:**
- 原因候補が App Check のみに限定されている
- Firestore Rules や環境変数の問題も可能性がある

**改善案:**
- より詳細な原因候補を提示
- App Check / Firestore Rules / 環境変数の3つを列挙

### **Firestore取得エラー** (`firestoreService.ts:106-115`)

**現在のエラーメッセージ:**
```typescript
if (error?.code === 'permission-denied') {
  throw new Error('レポートの取得が拒否されました。レポートが存在しないか、アクセス権限がありません。');
}
```

**問題:**
- 原因候補が不明確
- Firestore Rules の詳細が不明

**改善案:**
- レポートが存在しない場合と、Rules違反の場合を区別
- より具体的な原因候補を提示

---

## まとめ: 発見された問題点

### 🔴 **重大な問題（データ損失）** - ✅ **修正済み**

1. **deviceViewabilityData が保存されない** ✅ 修正済み
   - 影響: 共有URLから復元したレポートでデバイス別Viewabilityチャートが表示されない
   - 修正優先度: 高
   - 修正内容: `ProcessedData` に `deviceViewabilityData` フィールドを追加、保存・復元ロジックを実装

2. **totalImpressions が概算値になる** ✅ 修正済み
   - 影響: データの整合性が失われる（UI表示には直接影響なし）
   - 修正優先度: 中
   - 修正内容: `ProcessedData` に `totalImpressions` フィールドを追加、実測値を保存

3. **estimatedCPM が保存されない** ✅ 修正済み
   - 影響: CPM逆算ロジックに依存（エッジケースで問題の可能性）
   - 修正優先度: 中
   - 修正内容: `ProcessedData` に `estimatedCPM` フィールドを追加、ユーザー入力値を保存

### ⚠️ **軽微な問題（エラーハンドリング）** - ✅ **修正済み**

4. **エラーメッセージが不十分** ✅ 修正済み
   - 影響: デバッグが困難
   - 修正優先度: 中
   - 修正内容: 原因候補を3つ明確に提示（App Check / Firestore Rules / 環境変数）

5. **null/undefined チェックの不足** ✅ 修正済み
   - 影響: エッジケースでエラーが発生する可能性
   - 修正優先度: 低
   - 修正内容: 空配列チェックを追加、`Math.min/Max` のエラーを防止

6. **日付形式の不一致の可能性** ⚠️ 未修正（影響なし）
   - 影響: `createdAt` と `reportingPeriod` の形式が異なる可能性
   - 修正優先度: 低
   - 状態: 現在の実装で問題なし

---

## 次のステップ

STEP A-2 で以下の修正を実施: ✅ **完了**
1. ✅ `ProcessedData` インターフェースに `deviceViewabilityData` と `totalImpressions`, `estimatedCPM` を追加
2. ✅ `convertReportDataToProcessedData` でこれらのフィールドを保存
3. ✅ `convertProcessedDataToReportData` でこれらのフィールドを復元
4. ✅ エラーメッセージを改善
5. ✅ null/undefined チェックを追加

**修正詳細:** `STEP_A_FIXES_COMPLETE.md` を参照
