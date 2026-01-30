import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ZefrReport {
  type: 'performance' | 'suitability' | 'viewability' | 'exclusion';
  data: Record<string, any>[];
  headers: string[];
  fileName: string;
}

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
  // MVP: 追加フィールド（データ損失を防ぐため）
  deviceViewabilityData?: Record<string, any>[]; // デバイス別Viewabilityデータ（オプショナル: 古いデータとの互換性）
  totalImpressions?: number; // 実測値のTotal Impressions（オプショナル: 古いデータとの互換性）
  estimatedCPM?: number; // ユーザー入力のCPM値（オプショナル: 古いデータとの互換性）
  // GARMカテゴリー別ブランドリスク分析（オプショナル）
  brandRiskByCategory?: {
    key: string;        // 英語のGARMカテゴリ名（例: Adult）
    category: string;   // 表示用の日本語カテゴリ名
    suitable: number;   // Suitable Impressions 合計
    unsuitable: number; // Unsuitable Impressions 合計
    total: number;      // Total Impressions 合計
  }[];
  // IVT Safe Zone比較用のデバイス別IVT率（%）
  ivtRates?: {
    name: string;  // 媒体ベンチマーク / Overall / OTT / Mobile App / Mobile Web
    value: number; // 表示用のパーセント値（例: 0.22 → 0.22%）
  }[];
}

/**
 * 数値クリーニング関数
 * "%", ",", "$" などの記号を除去してFloat型に変換
 */
export const cleanNum = (value: any): number => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  
  const str = String(value).trim();
  
  // 記号を除去
  const cleaned = str
    .replace(/[%,\$¥]/g, '')
    .replace(/\s+/g, '');
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * ファイルを解析してZefrレポートタイプを特定する（CSV/XLSX対応）
 * スマート検出ロジック: ファイルの内容をスキャンしてヘッダーを自動認識
 */
export const parseCSVFile = (file: File): Promise<ZefrReport | null> => {
  return new Promise((resolve) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      // XLSX形式の処理
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, any>[];
          
          if (jsonData.length === 0) {
            resolve(null);
            return;
          }

          const result = detectReportTypeFromData(jsonData, file.name);
          resolve(result);
        } catch (error) {
          console.error('XLSX解析エラー:', error);
          resolve(null);
        }
      };
      reader.onerror = () => {
        resolve(null);
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV形式の処理
      Papa.parse(file, {
        header: false,
        skipEmptyLines: false,
        complete: (results) => {
          try {
            const rawData = results.data as any[];
            
            if (rawData.length === 0) {
              resolve(null);
              return;
            }

            // 免責事項などのテキストをスキップしてヘッダーを探す
            const headerRowIndex = findHeaderRowIndex(rawData);
            
            if (headerRowIndex === -1) {
              resolve(null);
              return;
            }

            // ヘッダー行を取得
            const headers = rawData[headerRowIndex] as string[];
            
            // ヘッダー以降のデータを抽出
            const dataRows = rawData.slice(headerRowIndex + 1)
              .filter(row => row && row.some((cell: any) => cell !== ''))
              .map(row => {
                const obj: Record<string, any> = {};
                headers.forEach((header, index) => {
                  obj[header] = row[index] || '';
                });
                return obj;
              });

            if (dataRows.length === 0) {
              resolve(null);
              return;
            }

            const type = identifyReportType(headers);
            
            if (!type) {
              resolve(null);
              return;
            }

            resolve({
              type,
              data: dataRows,
              headers,
              fileName: file.name,
            });
          } catch (error) {
            console.error('CSV解析エラー:', error);
            resolve(null);
          }
        },
        error: (error) => {
          console.error('PapaParse エラー:', error);
          resolve(null);
        },
      });
    }
  });
};

/**
 * CSVデータからレポートタイプを検出
 */
const detectReportTypeFromData = (data: Record<string, any>[], fileName: string): ZefrReport | null => {
  // 免責事項を含むファイルは無視
  const firstRow = data[0];
  if (firstRow && Object.values(firstRow).some(val => 
    String(val).toLowerCase().includes('disclaimer') || 
    String(val).toLowerCase().includes('免責事項')
  )) {
    return null;
  }

  const headers = Object.keys(data[0] || {});
  const type = identifyReportType(headers);
  
  if (!type) {
    return null;
  }

  return {
    type,
    data,
    headers,
    fileName,
  };
};

/**
 * CSVデータ内でヘッダー行を探す
 * 免責事項などのテキストをスキップ
 */
const findHeaderRowIndex = (rawData: any[]): number => {
  for (let i = 0; i < Math.min(rawData.length, 30); i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // 免責事項行をスキップ
    const rowText = row.join('|').toLowerCase();
    if (rowText.includes('disclaimer') || rowText.includes('免責事項') || rowText.includes('注記')) {
      continue;
    }

    // ヘッダー候補を検査
    const headers = row.filter((cell: any) => cell !== '');
    if (headers.length > 0) {
      const type = identifyReportType(headers);
      if (type) {
        return i;
      }
    }
  }
  return -1;
};

/**
 * ヘッダーからZefrレポートタイプを特定
 * スマート検出ロジック
 */
const identifyReportType = (headers: string[]): ZefrReport['type'] | null => {
  const headerStr = headers.map(h => String(h).toLowerCase()).join('|');

  // Performance: Category Name と VCR が含まれる行
  if (headerStr.includes('category name') && (headerStr.includes('vcr') || headerStr.includes('vcr%'))) {
    return 'performance';
  }

  // Suitability: Brand Suitability % と Suitable Impressions が含まれる行
  if (headerStr.includes('brand suitability') && headerStr.includes('suitable impressions')) {
    return 'suitability';
  }

  // Viewability: Viewability Rate と Gross Impressions が含まれる行
  if ((headerStr.includes('viewability rate') || headerStr.includes('viewability%')) && headerStr.includes('gross impressions')) {
    return 'viewability';
  }

  // Exclusion (Video-level): Video Suitability と Placement Name が含まれる行
  if (headerStr.includes('video suitability') && headerStr.includes('placement name')) {
    return 'exclusion';
  }

  return null;
};

/**
 * 複数のZefrレポートを処理してダッシュボード用データを生成
 */
export const processReports = (
  reports: (ZefrReport | null)[],
  cpm: number = 1500
): ProcessedData => {
  const validReports = reports.filter((r): r is ZefrReport => r !== null);
  
  const performanceReport = validReports.find(r => r.type === 'performance');
  const suitabilityReport = validReports.find(r => r.type === 'suitability');
  const viewabilityReport = validReports.find(r => r.type === 'viewability');
  const exclusionReport = validReports.find(r => r.type === 'exclusion');

  // アカウント名とレポート期間を抽出
  const accountName = extractAccountName(performanceReport?.data || suitabilityReport?.data || []);
  const reportingPeriod = extractReportingPeriod(performanceReport?.data || suitabilityReport?.data || []);

  // KPI計算
  const kpis = calculateKPIs(
    suitabilityReport?.data || [],
    exclusionReport?.data || [],
    viewabilityReport?.data || [],
    performanceReport?.data || [],
    cpm
  );

  // 自動インサイト生成
  const insights = generateInsights(kpis, suitabilityReport?.data || []);

  return {
    accountName,
    reportingPeriod,
    performance: performanceReport?.data || [],
    suitability: suitabilityReport?.data || [],
    viewability: viewabilityReport?.data || [],
    exclusion: exclusionReport?.data || [],
    kpis,
    insights,
    loadedReports: {
      performance: !!performanceReport,
      suitability: !!suitabilityReport,
      viewability: !!viewabilityReport,
      exclusion: !!exclusionReport,
    },
  };
};

/**
 * アカウント名を抽出
 */
const extractAccountName = (data: Record<string, any>[]): string => {
  if (data.length === 0) return 'アカウント';
  
  const firstRow = data[0];
  
  // 複数の可能なキー名を試す
  const possibleKeys = ['Account', 'account', 'アカウント', 'Account Name', 'account name'];
  for (const key of possibleKeys) {
    if (firstRow[key] && String(firstRow[key]).trim()) {
      return String(firstRow[key]).trim();
    }
  }
  
  return 'アカウント';
};

/**
 * レポート期間を抽出
 */
const extractReportingPeriod = (data: Record<string, any>[]): string => {
  if (data.length === 0) return '期間不明';
  
  const firstRow = data[0];
  
  // 複数の可能なキー名を試す
  const possibleKeys = ['Date', 'date', '日付', 'Period', 'period', 'Report Date', 'report date'];
  for (const key of possibleKeys) {
    if (firstRow[key] && String(firstRow[key]).trim()) {
      return String(firstRow[key]).trim();
    }
  }
  
  return '期間不明';
};

/**
 * KPIを計算
 */
const calculateKPIs = (
  suitabilityData: Record<string, any>[],
  exclusionData: Record<string, any>[],
  viewabilityData: Record<string, any>[],
  performanceData: Record<string, any>[],
  cpm: number
): ProcessedData['kpis'] => {
  // 加重平均適合率（Suitability）
  let finalSuitability = 0;
  if (suitabilityData.length > 0) {
    let totalImpressions = 0;
    let suitableImpressions = 0;

    suitabilityData.forEach(row => {
      // 複数の可能なキー名を試す
      let impressions = 0;
      const impressionKeys = ['Gross Impressions', 'gross impressions', 'Impressions', 'impressions'];
      for (const key of impressionKeys) {
        if (row[key]) {
          impressions = cleanNum(row[key]);
          break;
        }
      }

      let suitable = 0;
      const suitableKeys = ['Suitable Impressions', 'suitable impressions'];
      for (const key of suitableKeys) {
        if (row[key]) {
          suitable = cleanNum(row[key]);
          break;
        }
      }

      totalImpressions += impressions;
      suitableImpressions += suitable;
    });

    finalSuitability = totalImpressions > 0 ? (suitableImpressions / totalImpressions) * 100 : 0;
  }

  // Lift計算（Viewabilityから）
  let lift = 0;
  if (viewabilityData.length > 0) {
    let totalVTR = 0;
    let count = 0;

    viewabilityData.forEach(row => {
      // 複数の可能なキー名を試す
      let vtr = 0;
      const vtrKeys = ['Viewability Rate', 'viewability rate', 'Viewability%', 'viewability%', 'VTR', 'vtr'];
      for (const key of vtrKeys) {
        if (row[key]) {
          vtr = cleanNum(row[key]);
          break;
        }
      }

      if (vtr > 0) {
        totalVTR += vtr;
        count++;
      }
    });

    const avgVTR = count > 0 ? totalVTR / count : 0;
    lift = avgVTR * 1.2; // 20%のリフト係数を適用
  }

  // 総除外インプレッション数
  // Video-level reportの場合: Video Suitability が "Unsuitable" の行の Impressions を合計
  let totalExclusions = 0;
  if (exclusionData.length > 0) {
    exclusionData.forEach(row => {
      const videoSuitability = String(row['Video Suitability'] || row['video suitability'] || '').toLowerCase().trim();
      
      let impressions = 0;
      const impressionKeys = ['Impressions', 'impressions', 'Gross Impressions', 'gross impressions'];
      for (const key of impressionKeys) {
        if (row[key]) {
          impressions = cleanNum(row[key]);
          break;
        }
      }
      
      // "Unsuitable" の行のみカウント
      if (videoSuitability === 'unsuitable') {
        totalExclusions += impressions;
      }
    });
  }

  // 適正化予算額推定（¥）
  const budgetOptimization = (totalExclusions / 1000) * cpm;

  return {
    finalSuitability: Math.round(finalSuitability * 100) / 100,
    lift: Math.round(lift * 100) / 100,
    totalExclusions: Math.round(totalExclusions),
    budgetOptimization: Math.round(budgetOptimization),
  };
};

/**
 * 自動インサイト生成（日本語）
 */
const generateInsights = (
  kpis: ProcessedData['kpis'],
  suitabilityData: Record<string, any>[]
): string[] => {
  const insights: string[] = [];

  // インサイト1: 適合性について
  if (kpis.finalSuitability > 80) {
    insights.push(`ブランド適合性が${kpis.finalSuitability.toFixed(1)}%と高い水準を維持しており、ターゲット層への到達が効果的です。`);
  } else if (kpis.finalSuitability > 60) {
    insights.push(`ブランド適合性が${kpis.finalSuitability.toFixed(1)}%です。さらに改善の余地があります。`);
  } else if (kpis.finalSuitability > 0) {
    insights.push(`ブランド適合性が${kpis.finalSuitability.toFixed(1)}%と低い水準です。配置戦略の見直しをお勧めします。`);
  } else {
    insights.push('ブランド適合性データが利用できません。');
  }

  // インサイト2: 予算最適化について
  if (kpis.budgetOptimization > 100000) {
    insights.push(`除外インプレッションの削減により、推定${kpis.budgetOptimization.toLocaleString()}円の予算最適化が可能です。`);
  } else if (kpis.budgetOptimization > 0) {
    insights.push(`除外インプレッションの削減により、推定${kpis.budgetOptimization.toLocaleString()}円の予算最適化が可能です。`);
  } else {
    insights.push('除外インプレッションデータが利用できません。');
  }

  // インサイト3: Liftについて
  if (kpis.lift > 0) {
    insights.push(`ビューアビリティリフトが${kpis.lift.toFixed(1)}%で、コンテンツの視認性が向上しています。`);
  } else {
    insights.push('ビューアビリティデータが利用できません。');
  }

  return insights.slice(0, 3);
};
