# STEP A 修正完了: データ損失と堅牢性の改善

## 修正内容サマリー

### P0: データ損失の修正（完了）

#### 1) deviceViewabilityData の保存・復元

**変更ファイル:**
- `client/src/lib/csvProcessor.ts` - `ProcessedData` インターフェースに `deviceViewabilityData?: Record<string, any>[]` を追加
- `client/src/pages/ZefrInsightReportFinal6.tsx` - `convertReportDataToProcessedData` と `convertProcessedDataToReportData` を修正
- `client/src/lib/firestoreService.ts` - 保存・取得ロジックを修正

**変更内容:**
```diff
// csvProcessor.ts
export interface ProcessedData {
  ...
+ deviceViewabilityData?: Record<string, any>[]; // デバイス別Viewabilityデータ
}

// ZefrInsightReportFinal6.tsx - convertReportDataToProcessedData
+ deviceViewabilityData: reportData.deviceViewabilityData || [],

// ZefrInsightReportFinal6.tsx - convertProcessedDataToReportData
- deviceViewabilityData: {}, // デバイス別データは保持されていない
+ const deviceViewabilityData = processedData.deviceViewabilityData !== undefined
+   ? processedData.deviceViewabilityData
+   : []; // フォールバック: 空配列（古いデータとの互換性）

// firestoreService.ts - saveReport
+ deviceViewabilityData: processedData.deviceViewabilityData || [],

// firestoreService.ts - getReport
+ deviceViewabilityData: data.processedData.deviceViewabilityData || undefined,
```

**互換性:**
- 古いデータで `deviceViewabilityData` が存在しない場合、空配列でフォールバック
- コンソールログでフォールバック使用を通知

#### 2) totalImpressions の実測値保存

**変更内容:**
```diff
// csvProcessor.ts
export interface ProcessedData {
  ...
+ totalImpressions?: number; // 実測値のTotal Impressions
}

// ZefrInsightReportFinal6.tsx - convertReportDataToProcessedData
+ totalImpressions: reportData.totalImpressions || undefined,

// ZefrInsightReportFinal6.tsx - convertProcessedDataToReportData
- totalImpressions: processedData.kpis.totalExclusions * 10, // 概算値
+ const totalImpressions = processedData.totalImpressions !== undefined
+   ? processedData.totalImpressions
+   : (processedData.kpis.totalExclusions * 10); // フォールバック: 概算値（古いデータ用）

// firestoreService.ts - saveReport
+ totalImpressions: processedData.totalImpressions,

// firestoreService.ts - getReport
+ totalImpressions: data.processedData.totalImpressions || undefined,
```

**互換性:**
- 古いデータで `totalImpressions` が存在しない場合、`totalExclusions * 10` で概算値を計算
- コンソールログでフォールバック使用を通知

#### 3) estimatedCPM の保存

**変更内容:**
```diff
// csvProcessor.ts
export interface ProcessedData {
  ...
+ estimatedCPM?: number; // ユーザー入力のCPM値
}

// ZefrInsightReportFinal6.tsx - convertReportDataToProcessedData
+ estimatedCPM: reportData.estimatedCPM || undefined,

// ZefrInsightReportFinal6.tsx - convertProcessedDataToReportData
- estimatedCPM: cpm,
+ const estimatedCPM = processedData.estimatedCPM !== undefined
+   ? processedData.estimatedCPM
+   : cpm; // フォールバック: 逆算されたCPM値

// ZefrInsightReportFinal6.tsx - handleAccessReport
- const cpm = processedData.kpis.budgetOptimization > 0 && processedData.kpis.totalExclusions > 0
-   ? (processedData.kpis.budgetOptimization / (processedData.kpis.totalExclusions / 1000))
-   : 1500;
+ const cpm = processedData.estimatedCPM !== undefined
+   ? processedData.estimatedCPM
+   : (processedData.kpis.budgetOptimization > 0 && processedData.kpis.totalExclusions > 0
+     ? (processedData.kpis.budgetOptimization / (processedData.kpis.totalExclusions / 1000))
+     : 1500);

// firestoreService.ts - saveReport
+ estimatedCPM: processedData.estimatedCPM,

// firestoreService.ts - getReport
+ estimatedCPM: data.processedData.estimatedCPM || undefined,
```

**互換性:**
- 古いデータで `estimatedCPM` が存在しない場合、逆算ロジックでフォールバック
- コンソールログでフォールバック使用を通知

### P1: 堅牢性の改善（完了）

#### 4) null/undefined/空配列のガード

**変更内容:**
```diff
// ZefrInsightReportFinal6.tsx - ComposedChart
- data={reportData.brandSuitabilityData || []}
+ data={Array.isArray(reportData.brandSuitabilityData) && reportData.brandSuitabilityData.length > 0 ? reportData.brandSuitabilityData : []}

// ZefrInsightReportFinal6.tsx - LineChart
- data={reportData.deviceViewabilityData || []}
+ data={Array.isArray(reportData.deviceViewabilityData) && reportData.deviceViewabilityData.length > 0 ? reportData.deviceViewabilityData : []}

// ZefrInsightReportFinal6.tsx - ScatterChart (performanceData.map)
- {reportData.performanceData?.map((item: any, idx: number) => {
-   const minVol = Math.min(...reportData.performanceData.map((d: any) => d.volume));
-   const maxVol = Math.max(...reportData.performanceData.map((d: any) => d.volume));
+ {Array.isArray(reportData.performanceData) && reportData.performanceData.length > 0 ? (
+   reportData.performanceData.map((item: any, idx: number) => {
+     const performanceArray = reportData.performanceData || [];
+     const volumes = performanceArray.map((d: any) => d?.volume || 0).filter((v: number) => v > 0);
+     const minVol = volumes.length > 0 ? Math.min(...volumes) : 0;
+     const maxVol = volumes.length > 0 ? Math.max(...volumes) : 1;
+     ...
+   })
+ ) : (
+   <text>データがありません</text>
+ )}
```

**改善点:**
- 空配列の場合に `Math.min/Max` でエラーが発生しないようにガード
- 空データの場合に「データがありません」メッセージを表示

### P1: エラーメッセージの改善（完了）

#### 5) Firestore permission-denied エラーメッセージの改善

**変更内容:**
```diff
// firestoreService.ts - saveReport
if (error?.code === 'permission-denied') {
- throw new Error('レポートの保存が拒否されました。App Checkが正しく設定されているか確認してください。');
+ const errorMessage = [
+   'レポートの保存が拒否されました。',
+   '考えられる原因:',
+   '1. App Checkが有効でない（VITE_RECAPTCHA_SITE_KEYの設定、Firebase ConsoleでのApp Check有効化を確認）',
+   '2. Firestore Security Rulesが正しくデプロイされていない（firebase deploy --only firestore:rulesを実行）',
+   '3. 環境変数が正しく設定されていない（.env.localのVITE_FIREBASE_*を確認）',
+ ].join('\n');
+ console.error('[Firestore] Permission denied details:', error);
+ throw new Error(errorMessage);
}

// firestoreService.ts - getReport
if (error?.code === 'permission-denied') {
- throw new Error('レポートの取得が拒否されました。レポートが存在しないか、アクセス権限がありません。');
+ const errorMessage = [
+   'レポートの取得が拒否されました。',
+   '考えられる原因:',
+   '1. レポートが存在しない（reportIdを確認）',
+   '2. Firestore Security Rulesが正しくデプロイされていない（firebase deploy --only firestore:rulesを実行）',
+   '3. 環境変数が正しく設定されていない（.env.localのVITE_FIREBASE_*を確認）',
+ ].join('\n');
+ console.error('[Firestore] Permission denied details:', error);
+ throw new Error(errorMessage);
}
```

**改善点:**
- 原因候補を3つ明確に提示（App Check / Firestore Rules / 環境変数）
- 開発者向けに `console.error` で元エラーも出力

---

## 変更ファイル一覧

1. **`client/src/lib/csvProcessor.ts`** - `ProcessedData` インターフェースに3つのフィールドを追加
2. **`client/src/pages/ZefrInsightReportFinal6.tsx`** - 変換ロジックと堅牢性の改善
3. **`client/src/lib/firestoreService.ts`** - 保存・取得ロジックとエラーメッセージの改善

---

## 保存スキーマ（ProcessedData）の差分

### 追加フィールド

```typescript
export interface ProcessedData {
  // ... 既存フィールド ...
  
  // MVP: 追加フィールド（データ損失を防ぐため）
  deviceViewabilityData?: Record<string, any>[]; // デバイス別Viewabilityデータ（オプショナル）
  totalImpressions?: number;                     // 実測値のTotal Impressions（オプショナル）
  estimatedCPM?: number;                         // ユーザー入力のCPM値（オプショナル）
}
```

### Firestore保存構造

```typescript
{
  config: ReportConfig,
  processedData: {
    accountName: string,
    reportingPeriod: string,
    kpis: {...},
    insights: string[],
    loadedReports: {...},
    dataCount: {...},
    // 新規追加
    deviceViewabilityData: Record<string, any>[] | undefined,
    totalImpressions: number | undefined,
    estimatedCPM: number | undefined,
  },
  performance: Record<string, any>[],
  suitability: Record<string, any>[],
  viewability: Record<string, any>[],
  exclusion: Record<string, any>[],
}
```

---

## 互換性対応

### 古いデータとの互換性

1. **deviceViewabilityData**
   - 存在しない場合: 空配列 `[]` でフォールバック
   - コンソールログ: `[Data Migration] deviceViewabilityData not found, using empty array`

2. **totalImpressions**
   - 存在しない場合: `totalExclusions * 10` で概算値を計算
   - コンソールログ: `[Data Migration] totalImpressions not found, using fallback calculation`

3. **estimatedCPM**
   - 存在しない場合: `budgetOptimization` と `totalExclusions` から逆算
   - コンソールログ: `[Data Migration] estimatedCPM not found, using reverse calculation`

---

## 検証チェックリスト

- [ ] CSVアップロード → レポート生成 → Firestore保存 → 共有URL表示
- [ ] `/shared/:id` に直アクセス → パスワード入力 → Firestore取得 → ダッシュボード表示
- [ ] `deviceViewabilityData` が正しく保存・復元される
- [ ] `totalImpressions` が実測値で保存・復元される
- [ ] `estimatedCPM` が正しく保存・復元される
- [ ] 空配列の場合にエラーが発生しない
- [ ] エラーメッセージが分かりやすい
