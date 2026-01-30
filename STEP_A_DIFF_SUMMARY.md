# STEP A 修正差分サマリー

## 変更ファイル一覧

1. `client/src/lib/csvProcessor.ts` - ProcessedDataインターフェース拡張
2. `client/src/pages/ZefrInsightReportFinal6.tsx` - 変換ロジック修正・堅牢性改善
3. `client/src/lib/firestoreService.ts` - 保存・取得ロジック修正・エラーメッセージ改善

---

## 1. ProcessedDataインターフェース拡張

**ファイル:** `client/src/lib/csvProcessor.ts`

```diff
export interface ProcessedData {
  accountName: string;
  reportingPeriod: string;
  performance: Record<string, any>[];
  suitability: Record<string, any>[];
  viewability: Record<string, any>[];
  exclusion: Record<string, any>[];
  kpis: {
    finalSuitability: number;
    lift: number;
    totalExclusions: number;
    budgetOptimization: number;
  };
  insights: string[];
  loadedReports: {
    performance: boolean;
    suitability: boolean;
    viewability: boolean;
    exclusion: boolean;
  };
+ // MVP: 追加フィールド（データ損失を防ぐため）
+ deviceViewabilityData?: Record<string, any>[]; // デバイス別Viewabilityデータ（オプショナル: 古いデータとの互換性）
+ totalImpressions?: number; // 実測値のTotal Impressions（オプショナル: 古いデータとの互換性）
+ estimatedCPM?: number; // ユーザー入力のCPM値（オプショナル: 古いデータとの互換性）
}
```

---

## 2. convertReportDataToProcessedData 修正

**ファイル:** `client/src/pages/ZefrInsightReportFinal6.tsx`

```diff
const convertReportDataToProcessedData = (reportData: any): ProcessedData => {
  return {
    accountName: reportData.clientName || '',
    reportingPeriod: reportData.createdAt || new Date().toLocaleString('ja-JP'),
    performance: reportData.performanceData || [],
    suitability: reportData.brandSuitabilityData || [],
    viewability: reportData.viewabilityData || [],
    exclusion: [],
    kpis: {
      finalSuitability: reportData.suitabilityRate || 0,
      lift: reportData.lift || 0,
      totalExclusions: reportData.lowQualityBlocked || 0,
      budgetOptimization: reportData.budgetOptimization || 0,
    },
    insights: [],
    loadedReports: {
      performance: !!(reportData.performanceData && reportData.performanceData.length > 0),
      suitability: !!(reportData.brandSuitabilityData && reportData.brandSuitabilityData.length > 0),
      viewability: !!(reportData.viewabilityData && reportData.viewabilityData.length > 0),
      exclusion: false,
    },
+   // MVP: データ損失を防ぐため、追加フィールドを保存
+   deviceViewabilityData: reportData.deviceViewabilityData || [],
+   totalImpressions: reportData.totalImpressions || undefined,
+   estimatedCPM: reportData.estimatedCPM || undefined,
  };
};
```

---

## 3. convertProcessedDataToReportData 修正

**ファイル:** `client/src/pages/ZefrInsightReportFinal6.tsx`

```diff
const convertProcessedDataToReportData = (processedData: ProcessedData, cpm: number): any => {
+ // 古いデータとの互換性: totalImpressionsが保存されていない場合は概算値を使用
+ const totalImpressions = processedData.totalImpressions !== undefined
+   ? processedData.totalImpressions
+   : (processedData.kpis.totalExclusions * 10); // フォールバック: 概算値
+ 
+ if (processedData.totalImpressions === undefined) {
+   console.log('[Data Migration] totalImpressions not found, using fallback calculation');
+ }
+ 
+ // 古いデータとの互換性: estimatedCPMが保存されていない場合は逆算値を使用
+ const estimatedCPM = processedData.estimatedCPM !== undefined
+   ? processedData.estimatedCPM
+   : cpm; // フォールバック: 逆算されたCPM値
+ 
+ if (processedData.estimatedCPM === undefined) {
+   console.log('[Data Migration] estimatedCPM not found, using fallback calculation');
+ }
+ 
+ // 古いデータとの互換性: deviceViewabilityDataが保存されていない場合は空配列を使用
+ const deviceViewabilityData = processedData.deviceViewabilityData !== undefined
+   ? processedData.deviceViewabilityData
+   : []; // フォールバック: 空配列
+ 
+ if (processedData.deviceViewabilityData === undefined) {
+   console.log('[Data Migration] deviceViewabilityData not found, using empty array');
+ }
+ 
  return {
    clientName: processedData.accountName,
-   totalImpressions: processedData.kpis.totalExclusions * 10, // 概算値（実際の値は保持されていない）
+   totalImpressions,
    lowQualityBlocked: processedData.kpis.totalExclusions,
-   estimatedCPM: cpm,
+   estimatedCPM,
    suitabilityRate: processedData.kpis.finalSuitability,
    lift: processedData.kpis.lift,
    budgetOptimization: processedData.kpis.budgetOptimization,
    performanceData: processedData.performance,
    brandSuitabilityData: processedData.suitability,
    viewabilityData: processedData.viewability,
-   deviceViewabilityData: {}, // デバイス別データは保持されていない
+   deviceViewabilityData,
    createdAt: processedData.reportingPeriod,
  };
};
```

---

## 4. handleAccessReport のCPM逆算ロジック修正

**ファイル:** `client/src/pages/ZefrInsightReportFinal6.tsx`

```diff
- // ProcessedDataをreportData形式に変換して表示
- const cpm = processedData.kpis.budgetOptimization > 0 && processedData.kpis.totalExclusions > 0
-   ? (processedData.kpis.budgetOptimization / (processedData.kpis.totalExclusions / 1000))
-   : 1500;
+ // ProcessedDataをreportData形式に変換して表示
+ // CPM: 保存された値があればそれを使用、なければ逆算（古いデータとの互換性）
+ const cpm = processedData.estimatedCPM !== undefined
+   ? processedData.estimatedCPM
+   : (processedData.kpis.budgetOptimization > 0 && processedData.kpis.totalExclusions > 0
+     ? (processedData.kpis.budgetOptimization / (processedData.kpis.totalExclusions / 1000))
+     : 1500);
+ 
+ if (processedData.estimatedCPM === undefined) {
+   console.log('[Data Migration] estimatedCPM not found, using reverse calculation');
+ }
+ 
  const convertedReportData = convertProcessedDataToReportData(processedData, cpm);
```

---

## 5. Firestore保存ロジック修正

**ファイル:** `client/src/lib/firestoreService.ts`

```diff
    await setDoc(reportRef, {
      config,
      processedData: {
        accountName: processedData.accountName,
        reportingPeriod: processedData.reportingPeriod,
        kpis: processedData.kpis,
        insights: processedData.insights,
        loadedReports: processedData.loadedReports,
        dataCount: {
          performance: processedData.performance.length,
          suitability: processedData.suitability.length,
          viewability: processedData.viewability.length,
          exclusion: processedData.exclusion.length,
        },
+       // MVP: 追加フィールドを保存（データ損失を防ぐため）
+       deviceViewabilityData: processedData.deviceViewabilityData || [],
+       totalImpressions: processedData.totalImpressions,
+       estimatedCPM: processedData.estimatedCPM,
      },
      performance: processedData.performance,
      suitability: processedData.suitability,
      viewability: processedData.viewability,
      exclusion: processedData.exclusion,
    });
```

---

## 6. Firestore取得ロジック修正

**ファイル:** `client/src/lib/firestoreService.ts`

```diff
    return {
      config: data.config as ReportConfig,
      processedData: {
        accountName: data.processedData.accountName,
        reportingPeriod: data.processedData.reportingPeriod,
        kpis: data.processedData.kpis,
        insights: data.processedData.insights,
        loadedReports: data.processedData.loadedReports || {
          performance: false,
          suitability: false,
          viewability: false,
          exclusion: false,
        },
        performance: data.performance || [],
        suitability: data.suitability || [],
        viewability: data.viewability || [],
        exclusion: data.exclusion || [],
+       // MVP: 追加フィールドを復元（古いデータとの互換性: オプショナル）
+       deviceViewabilityData: data.processedData.deviceViewabilityData || undefined,
+       totalImpressions: data.processedData.totalImpressions || undefined,
+       estimatedCPM: data.processedData.estimatedCPM || undefined,
      } as ProcessedData,
    };
```

---

## 7. 堅牢性の改善（空配列ガード）

**ファイル:** `client/src/pages/ZefrInsightReportFinal6.tsx`

```diff
- <ComposedChart data={reportData.brandSuitabilityData || []}>
+ <ComposedChart data={Array.isArray(reportData.brandSuitabilityData) && reportData.brandSuitabilityData.length > 0 ? reportData.brandSuitabilityData : []}>

- <LineChart data={reportData.deviceViewabilityData || []}>
+ <LineChart data={Array.isArray(reportData.deviceViewabilityData) && reportData.deviceViewabilityData.length > 0 ? reportData.deviceViewabilityData : []}>

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

---

## 8. エラーメッセージの改善

**ファイル:** `client/src/lib/firestoreService.ts`

```diff
  } catch (error: any) {
    console.error('レポート保存エラー:', error);
    
    if (error?.code === 'permission-denied') {
-     throw new Error('レポートの保存が拒否されました。App Checkが正しく設定されているか確認してください。');
+     const errorMessage = [
+       'レポートの保存が拒否されました。',
+       '考えられる原因:',
+       '1. App Checkが有効でない（VITE_RECAPTCHA_SITE_KEYの設定、Firebase ConsoleでのApp Check有効化を確認）',
+       '2. Firestore Security Rulesが正しくデプロイされていない（firebase deploy --only firestore:rulesを実行）',
+       '3. 環境変数が正しく設定されていない（.env.localのVITE_FIREBASE_*を確認）',
+     ].join('\n');
+     console.error('[Firestore] Permission denied details:', error);
+     throw new Error(errorMessage);
    }
  }
```

```diff
  } catch (error: any) {
    console.error('レポート取得エラー:', error);
    
    if (error?.code === 'permission-denied') {
-     throw new Error('レポートの取得が拒否されました。レポートが存在しないか、アクセス権限がありません。');
+     const errorMessage = [
+       'レポートの取得が拒否されました。',
+       '考えられる原因:',
+       '1. レポートが存在しない（reportIdを確認）',
+       '2. Firestore Security Rulesが正しくデプロイされていない（firebase deploy --only firestore:rulesを実行）',
+       '3. 環境変数が正しく設定されていない（.env.localのVITE_FIREBASE_*を確認）',
+     ].join('\n');
+     console.error('[Firestore] Permission denied details:', error);
+     throw new Error(errorMessage);
    }
  }
```

---

## 保存スキーマ（ProcessedData）の差分

### 追加されたフィールド

| フィールド名 | 型 | オプショナル | 説明 |
|------------|-----|------------|------|
| `deviceViewabilityData` | `Record<string, any>[]` | ✅ | デバイス別Viewabilityデータ |
| `totalImpressions` | `number` | ✅ | 実測値のTotal Impressions |
| `estimatedCPM` | `number` | ✅ | ユーザー入力のCPM値 |

### Firestore保存構造

```typescript
{
  config: {
    reportId: string,
    cpm: number,
    passwordHash: string,
    createdAt: number,
    expiresAt?: number,
  },
  processedData: {
    accountName: string,
    reportingPeriod: string,
    kpis: {...},
    insights: string[],
    loadedReports: {...},
    dataCount: {...},
    // 新規追加（オプショナル）
    deviceViewabilityData?: Record<string, any>[],
    totalImpressions?: number,
    estimatedCPM?: number,
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

すべての追加フィールドはオプショナル（`?`）として定義されているため、古いデータでも動作します。

**フォールバック処理:**
1. `deviceViewabilityData` が存在しない → 空配列 `[]`
2. `totalImpressions` が存在しない → `totalExclusions * 10` で概算値
3. `estimatedCPM` が存在しない → `budgetOptimization` と `totalExclusions` から逆算

**ログ出力:**
- フォールバック使用時に `[Data Migration]` ログを出力
- 開発者が古いデータを使用していることを認識可能

---

## 修正完了チェックリスト

- [x] `deviceViewabilityData` を保存・復元できるようにする
- [x] `totalImpressions` の実測値を保存する
- [x] `estimatedCPM` を保存する
- [x] 古いデータとの互換性を確保（フォールバック処理）
- [x] null/undefined/空配列のガードを追加
- [x] エラーメッセージを改善
