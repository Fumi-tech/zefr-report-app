# 1) レポート保存/取得の呼び出し元一覧

## 現在のルーティング

**`client/src/App.tsx`** で使用されているコンポーネント:
- `/` → `ZefrInsightReportFinal6` ✅ **現在使用中**
- `/shared/:id` → `ZefrInsightReportFinal6` ✅ **現在使用中**

## レポート保存（saveReport）の呼び出し元

### 🔴 **server経由（tRPC）**

| ファイル | 関数名 | 行番号 | 呼び出し方法 | 状態 |
|---------|--------|--------|------------|------|
| `client/src/pages/ZefrInsightReportFinal6.tsx` | `handleGenerateReport()` | 395行目 | `saveReportMutation.mutateAsync()` | ✅ **現在使用中（MVPで修正必要）** |

**詳細:**
```typescript
// 73行目: tRPC mutation定義
const saveReportMutation = trpc.report.save.useMutation();

// 395行目: レポート保存実行
const result = await saveReportMutation.mutateAsync({
  clientName: reportData.clientName,
  reportData: JSON.stringify(reportData),
  password: sharePassword,
  performanceFile,
  riskFile,
  viewFile,
});
```

### 🟢 **Firestore直操作**

| ファイル | 関数名 | 行番号 | 呼び出し方法 | 状態 |
|---------|--------|--------|------------|------|
| `client/src/pages/ZefrInsightReport.tsx` | `handleGenerateAndShare()` | 112行目 | `saveReport(reportId, config, processedData)` | ❌ 未使用（別バージョン） |
| `client/src/pages/ZefrInsightReportFinal5.tsx` | `handleShare()` | 287行目 | `firebase.saveReport(reportId, reportData, sharePassword)` | ❌ 未使用（別バージョン） |

**詳細:**
- `ZefrInsightReport.tsx`: `@/lib/firestoreService` から `saveReport` をimportして使用
- `ZefrInsightReportFinal5.tsx`: `firebase.saveReport` という別の実装を使用（詳細未確認）

## レポート取得（getReport/getReportWithPassword）の呼び出し元

### 🔴 **server経由（tRPC）**

| ファイル | 関数名 | 行番号 | 呼び出し方法 | 状態 |
|---------|--------|--------|------------|------|
| `client/src/pages/ZefrInsightReportFinal6.tsx` | `handleAccessReport()` | 429行目 | `getReportQuery.refetch()` | ✅ **現在使用中（MVPで修正必要）** |

**詳細:**
```typescript
// 74-77行目: tRPC query定義
const getReportQuery = trpc.report.get.useQuery(
  { reportId: sharedReportId, password: accessPassword },
  { enabled: false }
);

// 429行目: レポート取得実行
const result = await getReportQuery.refetch();
```

### 🟢 **Firestore直操作**

| ファイル | 関数名 | 行番号 | 呼び出し方法 | 状態 |
|---------|--------|--------|------------|------|
| `client/src/pages/ZefrInsightReport.tsx` | `handlePasswordSubmit()` | 149行目 | `getReportWithPassword(appData.reportId, password)` | ❌ 未使用（別バージョン） |
| `client/src/pages/ZefrInsightReportFinal5.tsx` | `handleAccessReport()` | 314行目 | `firebase.loadReport(sharedReportId, accessPassword)` | ❌ 未使用（別バージョン） |

**詳細:**
- `ZefrInsightReport.tsx`: `@/lib/firestoreService` から `getReportWithPassword` をimportして使用
- `ZefrInsightReportFinal5.tsx`: `firebase.loadReport` という別の実装を使用（詳細未確認）

## まとめ

### MVPで修正が必要な箇所

**`client/src/pages/ZefrInsightReportFinal6.tsx`** のみ修正が必要:

1. **レポート保存** (395行目)
   - 現在: `saveReportMutation.mutateAsync()` (tRPC経由)
   - 変更後: `saveReport()` (Firestore直操作)

2. **レポート取得** (429行目)
   - 現在: `getReportQuery.refetch()` (tRPC経由)
   - 変更後: `getReportWithPassword()` (Firestore直操作)

### その他のファイル

- `ZefrInsightReport.tsx` - 既にFirestore直操作を使用（未使用）
- `ZefrInsightReportFinal5.tsx` - 別実装を使用（未使用）

### 修正方針

1. `ZefrInsightReportFinal6.tsx` のtRPC呼び出しをFirestore直操作に置き換え
2. `@/lib/firestoreService` から `saveReport`, `getReportWithPassword` をimport
3. 既存のUI/計算ロジックは変更しない
4. 共有URL (`/shared/:id`) での復元も動作するようにする
