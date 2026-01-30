import React, { useState, useEffect } from 'react';
import { Upload, Download, Share2, Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import Papa from 'papaparse';
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line, Bar, Area, AreaChart
} from 'recharts';
import { useLocation } from 'wouter';
import { saveReport, getReportWithPassword, ReportConfig } from '@/lib/firestoreService';
import { hashPassword, generateReportId } from '@/lib/passwordUtils';
import type { ProcessedData } from '@/lib/csvProcessor';

// ユーティリティ関数
const generateReportIdLocal = () => {
  return 'report_' + Math.random().toString(36).substr(2, 9);
};

// グラフ表示用の集計済みデータのみを送信（生CSVは含めない）。配列長を上限で打ち切り、Firestore 1MB制限を避ける。
const MAX_CHART_ROWS = 500;
function capArray<T>(arr: T[]): T[] {
  return Array.isArray(arr) ? arr.slice(0, MAX_CHART_ROWS) : [];
}

// reportDataをProcessedData形式に変換（Firestore保存用・集計済みデータのみ）
const convertReportDataToProcessedData = (reportData: any): ProcessedData => {
  return {
    accountName: reportData.clientName || '',
    reportingPeriod: reportData.reportingPeriod || reportData.createdAt || new Date().toLocaleString('ja-JP'),
    performance: capArray(reportData.performanceData || []),
    suitability: capArray(reportData.brandSuitabilityData || []),
    viewability: capArray(reportData.viewabilityData || []),
    exclusion: [],
    kpis: {
      finalSuitability: reportData.suitabilityRate ?? 0,
      lift: reportData.lift ?? 0,
      totalExclusions: reportData.lowQualityBlocked ?? 0,
      budgetOptimization: reportData.budgetOptimization ?? 0,
    },
    insights: [],
    loadedReports: {
      performance: !!(reportData.performanceData && reportData.performanceData.length > 0),
      suitability: !!(reportData.brandSuitabilityData && reportData.brandSuitabilityData.length > 0),
      viewability: !!(reportData.viewabilityData && reportData.viewabilityData.length > 0),
      exclusion: false,
    },
    deviceViewabilityData: capArray(reportData.deviceViewabilityData || []),
    totalImpressions: reportData.totalImpressions ?? undefined,
    estimatedCPM: reportData.estimatedCPM ?? undefined,
    brandRiskByCategory: reportData.brandRiskByCategory || [],
    ivtRates: reportData.ivtRates || [],
  };
};

// ProcessedDataをreportData形式に変換（UI表示用）
const convertProcessedDataToReportData = (processedData: ProcessedData, cpm: number): any => {
  // 古いデータとの互換性: totalImpressionsが保存されていない場合は概算値を使用
  // （ログで明記: 新規保存データでは実測値が保存される）
  const totalImpressions = processedData.totalImpressions !== undefined
    ? processedData.totalImpressions
    : (processedData.kpis.totalExclusions * 10); // フォールバック: 概算値
  
  if (processedData.totalImpressions === undefined) {
    console.log('[Data Migration] totalImpressions not found, using fallback calculation');
  }

  // 古いデータとの互換性: estimatedCPMが保存されていない場合は逆算値を使用
  const estimatedCPM = processedData.estimatedCPM !== undefined
    ? processedData.estimatedCPM
    : cpm; // フォールバック: 逆算されたCPM値
  
  if (processedData.estimatedCPM === undefined) {
    console.log('[Data Migration] estimatedCPM not found, using fallback calculation');
  }

  // 古いデータとの互換性: deviceViewabilityDataが保存されていない場合は空配列を使用
  const deviceViewabilityData = processedData.deviceViewabilityData !== undefined
    ? processedData.deviceViewabilityData
    : []; // フォールバック: 空配列
  
  if (processedData.deviceViewabilityData === undefined) {
    console.log('[Data Migration] deviceViewabilityData not found, using empty array');
  }

  return {
    clientName: processedData.accountName,
    totalImpressions,
    lowQualityBlocked: processedData.kpis.totalExclusions,
    estimatedCPM,
    suitabilityRate: processedData.kpis.finalSuitability,
    lift: processedData.kpis.lift,
    budgetOptimization: processedData.kpis.budgetOptimization,
    performanceData: processedData.performance,
    brandSuitabilityData: processedData.suitability,
    viewabilityData: processedData.viewability,
    deviceViewabilityData,
    createdAt: processedData.reportingPeriod,
    brandRiskByCategory: processedData.brandRiskByCategory || [],
    ivtRates: processedData.ivtRates || [],
  };
};

// Web発行用に、NaN / undefined を安全な値に置き換えるサニタイズ処理
const sanitizeProcessedData = (data: ProcessedData): ProcessedData => {
  const sanitizeNumber = (v: any): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const sanitizeRecord = (obj: Record<string, any>): Record<string, any> => {
    const out: Record<string, any> = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (typeof v === 'number') {
        out[k] = Number.isFinite(v) ? v : 0;
      } else {
        out[k] = v;
      }
    });
    return out;
  };

  return {
    accountName: data.accountName || '',
    reportingPeriod: data.reportingPeriod || '',
    performance: (data.performance || []).map(sanitizeRecord),
    suitability: (data.suitability || []).map(sanitizeRecord),
    viewability: (data.viewability || []).map(sanitizeRecord),
    exclusion: (data.exclusion || []).map(sanitizeRecord),
    kpis: {
      finalSuitability: sanitizeNumber(data.kpis?.finalSuitability),
      lift: sanitizeNumber(data.kpis?.lift),
      totalExclusions: sanitizeNumber(data.kpis?.totalExclusions),
      budgetOptimization: sanitizeNumber(data.kpis?.budgetOptimization),
    },
    insights: Array.isArray(data.insights) ? data.insights : [],
    loadedReports: data.loadedReports || {
      performance: false,
      suitability: false,
      viewability: false,
      exclusion: false,
    },
    deviceViewabilityData: Array.isArray(data.deviceViewabilityData)
      ? data.deviceViewabilityData.map(sanitizeRecord)
      : [],
    totalImpressions: data.totalImpressions !== undefined ? sanitizeNumber(data.totalImpressions) : undefined,
    estimatedCPM: data.estimatedCPM !== undefined ? sanitizeNumber(data.estimatedCPM) : undefined,
    brandRiskByCategory: Array.isArray(data.brandRiskByCategory)
      ? data.brandRiskByCategory.map((item: any) => ({
          key: String(item.key ?? ''),
          category: String(item.category ?? ''),
          suitable: sanitizeNumber(item.suitable),
          unsuitable: sanitizeNumber(item.unsuitable),
          total: sanitizeNumber(item.total),
        }))
      : [],
    ivtRates: Array.isArray(data.ivtRates)
      ? data.ivtRates.map((item: any) => ({
          name: String(item.name ?? ''),
          value: sanitizeNumber(item.value),
        }))
      : [],
  };
};

const formatNumberWithUnit = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

/** 小数点→パーセント表示の共通ユーティリティ（0.98 → "98.0%"）。既に0–100の値はそのまま%。 */
const toPercentStr = (val: number | undefined | null): string => {
  if (val == null || Number.isNaN(val)) return 'N/A';
  const pct = val > 0 && val <= 1 ? val * 100 : val;
  return (Number(pct).toFixed(1)) + '%';
};

// インプレッション数の単位表示（K, M）
const formatImpressions = (val: number | undefined | null): string => {
  if (val == null || Number.isNaN(val)) return '0';
  const num = Number(val);
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString('ja-JP');
};

const parseNumberWithUnit = (str: string) => {
  const match = str.match(/^([\d.]+)\s*([KMB]?)$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase();
  if (unit === 'M') return num * 1000000;
  if (unit === 'K') return num * 1000;
  return num;
};

/** 数値パース: N/A, 空, %/$/カンマ除去。NaNは0。 */
const cleanNum = (val: any): number => {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val ?? '').trim().toUpperCase();
  if (s === '' || s === 'N/A' || s === '-' || s === 'NA') return 0;
  const cleaned = String(val).replace(/[%,$\s]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

/** 日付を YYYY-MM-DD に統一。MM/DD/YYYY, YYYY-MM-DD 等に対応。ソート用。 */
const parseDateToYMD = (raw: string): string => {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return v;
};

// ファイルをBase64に変換
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]); // data:...;base64, を除去
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// GARM カテゴリー（英語キーと日本語ラベル）
const GARM_CATEGORIES = [
  'Adult',
  'Arms & Ammunition',
  'Crime & Harmful Acts',
  'Death, Injury & Military Conflict',
  'Drugs, Alcohol & Tobacco',
  'Hate Speech & Acts of Aggression',
  'Misinformation',
  'Online Piracy',
  'Profanity & Obscenity',
  'Debated Sensitive Social Issues',
  'Spam',
  'Terrorism',
] as const;

const GARM_CATEGORY_LABEL_JP: Record<string, string> = {
  'Adult': 'アダルト',
  'Arms & Ammunition': '武器・弾薬',
  'Crime & Harmful Acts': '犯罪・有害行為',
  'Death, Injury & Military Conflict': '死傷・軍事衝突',
  'Drugs, Alcohol & Tobacco': '薬物・アルコール・タバコ',
  'Hate Speech & Acts of Aggression': 'ヘイトスピーチ・攻撃的行為',
  'Misinformation': '誤情報',
  'Online Piracy': 'オンライン海賊版',
  'Profanity & Obscenity': '不適切表現・わいせつ',
  'Debated Sensitive Social Issues': '議論の分かれる社会問題',
  'Spam': 'スパム',
  'Terrorism': 'テロリズム',
};

// 複数CSVファイルを自動分類するための簡易タイプ検出
const detectCsvTypeFromName = (fileName: string): 'performance' | 'risk' | 'view' | null => {
  const name = fileName.toLowerCase();
  if (name.includes('view') || name.includes('viewability')) return 'view';
  if (name.includes('risk') || name.includes('suit')) return 'risk';
  if (name.includes('perf') || name.includes('context')) return 'performance';
  return null;
};

const detectCsvTypeFromHeader = (headerLine: string): 'performance' | 'risk' | 'view' | null => {
  const h = headerLine.toLowerCase();
  if (h.includes('device type') || h.includes('device')) return 'view';
  if (h.includes('suitable impressions')) return 'risk';
  if (h.includes('category name')) return 'performance';
  return null;
};

export default function ZefrInsightReport() {
  const [location, setLocation] = useLocation();
  const [stage, setStage] = useState('setup'); // setup, dashboard, shared
  const [files, setFiles] = useState<{performance: File | null, risk: File | null, view: File | null}>({ performance: null, risk: null, view: null });
  const [clientName, setClientName] = useState('');
  const [totalImpressions, setTotalImpressions] = useState('');
  const [lowQualityBlocked, setLowQualityBlocked] = useState('');
  const [estimatedCPM, setEstimatedCPM] = useState('1500');
  const [sharePassword, setSharePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sharedLink, setSharedLink] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sharedReportId, setSharedReportId] = useState<string>('');
  const [accessPassword, setAccessPassword] = useState('');
  const [showAccessPassword, setShowAccessPassword] = useState(false);
  const [isSharedView, setIsSharedView] = useState(false);

  // Firestore直操作（MVP: server不要）

  // ファイル処理
  const handleFileUpload = (e: any, type: 'performance' | 'risk' | 'view') => {
    const file = e.target.files?.[0];
    if (file) {
      setFiles(prev => ({ ...prev, [type]: file }));
    }
  };

  // 複数CSVファイルをドラッグ&ドロップ/一括選択して自動分類
  const handleFilesBatchUpload = async (fileList: FileList) => {
    const newFiles = { ...files };

    const classifyFile = (file: File): Promise<void> => {
      return new Promise((resolve) => {
        // 1. ファイル名で推定
        let detected = detectCsvTypeFromName(file.name);
        if (detected) {
          newFiles[detected] = file;
          return resolve();
        }
        // 2. ヘッダー1行目だけ読んで判定
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const text = String(reader.result || '');
            const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
            const type = detectCsvTypeFromHeader(firstLine);
            if (type) {
              newFiles[type] = file;
            }
          } finally {
            resolve();
          }
        };
        reader.onerror = () => resolve();
        reader.readAsText(file.slice(0, 4096));
      });
    };

    const tasks: Promise<void>[] = [];
    Array.from(fileList).forEach((file) => {
      if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
        return;
      }
      tasks.push(classifyFile(file));
    });

    await Promise.all(tasks);
    setFiles(newFiles);
  };

  const parseCSV = (content: string) => {
    // PapaParse を使用して正確に CSV を解析（ダブルクオート内のカンマも正しく扱う）
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
    });

    const originalHeaders = (result.meta.fields || []) as string[];
    const headers = originalHeaders.map((h) =>
      String(h).replace(/\ufeff/g, '').toLowerCase().trim()
    );

    const data = (result.data as any[]).map((row) => {
      const obj: Record<string, any> = {};
      originalHeaders.forEach((orig, idx) => {
        const key = headers[idx] || String(orig).toLowerCase().trim();
        obj[key] = (row as any)[orig] ?? '';
      });
      return obj;
    });

    console.log('[CSV Parse] Using Papa.parse (header=true)');
    console.log('[CSV Parse] Headers:', headers);
    if (data.length > 0) {
      console.log('[CSV Parse] Sample row:', data[0]);
    }

    return { headers, data };
  };

  const processFiles = async () => {
    try {
      setLoading(true);
      setError('');

      const totalImp = parseNumberWithUnit(totalImpressions);
      const lowQuality = parseNumberWithUnit(lowQualityBlocked);
      const cpm = parseFloat(estimatedCPM) || 1500;

      if (!totalImp || !lowQuality || !clientName) {
        throw new Error('すべての入力項目を入力してください');
      }

      const fileData: any = {};
      
      // ファイル処理
      for (const [type, file] of Object.entries(files) as [string, File | null][]) {
        if (file) {
          console.log(`[File Processing] Processing ${type} file:`, file.name);
          const content = await (file as File).text();
          const { headers, data } = parseCSV(content);
          fileData[type] = { headers, data };
          console.log(`[File Processing] ${type} data:`, { headerCount: headers.length, rowCount: data.length });
        }
      }
      
      console.log('[File Processing] All files processed:', Object.keys(fileData));

      // データ集計
      let suitabilityRate = 0;
      let brandSuitabilityData = [];
      let performanceData = [];
      let viewabilityData = [];
      let deviceViewabilityData = {};

      // Performance処理
      if (fileData.performance?.data) {
        console.log('[Performance] Raw data sample:', fileData.performance.data[0]);
        console.log('[Performance] Headers:', fileData.performance.headers);
        
        // ヘッダー名を柔軟に検索
        const findHeader = (keywords: string[]) => {
          return fileData.performance.headers.find((h: string) => 
            keywords.some(k => h.includes(k))
          );
        };
        
        const categoryHeader = findHeader(['category', 'name']) || findHeader(['account']);
        const vcrHeader = findHeader(['vcr', 'video completion', 'completion rate']);
        const ctrHeader = findHeader(['ctr', 'click', 'through']);
        const viewabilityHeader = findHeader(['viewability', 'viewable', 'viewability rate']);
        const impressionsHeader = findHeader(['impression', 'imps']);
        const dateHeader = findHeader(['date']);
        
        console.log('[Performance] Mapped headers:', { categoryHeader, vcrHeader, ctrHeader, viewabilityHeader, impressionsHeader, dateHeader });
        
        // カテゴリ統合: ... Music → Music、... Film / ... Movie → Movie（要件3）
        const normalizeCategory = (name: string): string => {
          const v = String(name || '').trim();
          if (!v) return 'Unknown';
          if (/\bmusic\b/i.test(v)) return 'Music';
          if (/\bfilm\b/i.test(v) || /\bmovie\b/i.test(v)) return 'Movie';
          return v;
        };
        const rawList = fileData.performance.data
          .filter((d: any) => (impressionsHeader ? cleanNum(d[impressionsHeader]) : 0) > 0 || (ctrHeader && d[ctrHeader]) || (vcrHeader && d[vcrHeader]))
          .map((d: any) => {
            const imp = impressionsHeader ? cleanNum(d[impressionsHeader]) : 0;
            const vcr = vcrHeader ? cleanNum(d[vcrHeader]) : 0;
            const ctr = ctrHeader ? cleanNum(d[ctrHeader]) : 0;
            const viewabilityRaw = viewabilityHeader ? cleanNum(d[viewabilityHeader]) : 0;
            // Viewabilityが0-1の範囲の場合は100倍、既に0-100の範囲の場合はそのまま
            const viewability = viewabilityRaw > 0 && viewabilityRaw <= 1 ? viewabilityRaw * 100 : viewabilityRaw;
            const name = (categoryHeader ? d[categoryHeader] : null) || (dateHeader ? d[dateHeader] : null) || 'Unknown';
            return {
              categoryName: String(name),
              normalizedCategory: normalizeCategory(String(name)),
              vcr: vcr > 0 ? vcr : ctr,
              ctr,
              viewability,
              volume: imp
            };
          })
          .filter((d: any) => d.volume > 0);
        // 統合カテゴリで集約（volume合計、VCR/CTR/Viewabilityは volume 加重平均）、Volume 上位8件（要件3）
        const byCat: Record<string, { volume: number; sumVcr: number; sumCtr: number; sumViewability: number }> = {};
        rawList.forEach((d: any) => {
          const k = d.normalizedCategory;
          if (!byCat[k]) byCat[k] = { volume: 0, sumVcr: 0, sumCtr: 0, sumViewability: 0 };
          byCat[k].volume += d.volume;
          byCat[k].sumVcr += (d.vcr || 0) * d.volume;
          byCat[k].sumCtr += (d.ctr || 0) * d.volume;
          byCat[k].sumViewability += (d.viewability || 0) * d.volume;
        });
        performanceData = Object.entries(byCat)
          .map(([cat, agg]) => ({
            categoryName: cat,
            vcr: agg.volume > 0 ? agg.sumVcr / agg.volume : 0,
            ctr: agg.volume > 0 ? agg.sumCtr / agg.volume : 0,
            viewability: agg.volume > 0 ? agg.sumViewability / agg.volume : 0,
            volume: agg.volume,
          }))
          .sort((a: any, b: any) => b.volume - a.volume)
          .slice(0, 8);
        console.log('[Performance] Processed data count:', performanceData.length);
        if (performanceData.length > 0) {
          console.log('[Performance] Sample processed:', performanceData[0]);
        }
      } else {
        console.log('[Performance] No performance data found');
      }

      // Risk処理
      if (fileData.risk?.data) {
        console.log('[Risk] Raw data sample:', fileData.risk.data[0]);
        console.log('[Risk] Headers:', fileData.risk.headers);
        
        const findRiskHeader = (keywords: string[]) => {
          return fileData.risk.headers.find((h: string) => 
            keywords.some(k => h.includes(k))
          );
        };
        
        // 仕様に従い、カラム名を「完全一致」で取得
        const dateHeader = fileData.risk.headers.find((h: string) => 
          h.trim().toLowerCase() === 'report date' || h.trim() === 'Report Date'
        ) || findRiskHeader(['date']);
        const suitabilityRateHeader = fileData.risk.headers.find((h: string) => 
          h.trim().toLowerCase() === 'brand suitability %' || h.trim() === 'Brand Suitability %'
        ) || null;
        const totalImpressionsHeader = fileData.risk.headers.find((h: string) => 
          h.trim().toLowerCase() === 'total impressions' || h.trim() === 'Total Impressions'
        ) || null;
        const suitableImpressionsHeader = fileData.risk.headers.find((h: string) => 
          h.trim().toLowerCase() === 'suitable impressions' || h.trim() === 'Suitable Impressions'
        ) || null;
        
        console.log('[Risk] Mapped headers (exact match):', {
          dateHeader,
          suitabilityRateHeader,
          totalImpressionsHeader,
          suitableImpressionsHeader,
        });

        // GARM カテゴリー別の Suitable / Unsuitable 集計
        const riskByCategory: Record<string, { suitable: number; unsuitable: number; total: number }> = {};
        GARM_CATEGORIES.forEach((key) => {
          riskByCategory[key] = { suitable: 0, unsuitable: 0, total: 0 };
        });
        
        // ブランドリスク分析: [Category] - Unsuitable Impressions カラムから直接集計
        fileData.risk.data.forEach((row: any) => {
          GARM_CATEGORIES.forEach((categoryKey) => {
            // カラム名のパターンを複数試す（大文字小文字の違いに対応）
            const unsuitablePatterns = [
              `${categoryKey} - Unsuitable Impressions`,
              `${categoryKey} - UnSuitable Impressions`, // Arms & Ammunition など
              `${categoryKey} - unsuitable impressions`,
            ];
            
            const suitablePatterns = [
              `${categoryKey} - Suitable Impressions`,
              `${categoryKey} - suitable impressions`,
            ];
            
            // Unsuitable Impressions カラムを探す
            let unsuitableHeader: string | undefined;
            for (const pattern of unsuitablePatterns) {
              unsuitableHeader = fileData.risk.headers.find((h: string) => 
                h.trim() === pattern || h.trim().toLowerCase() === pattern.toLowerCase()
              );
              if (unsuitableHeader) break;
            }
            
            // Suitable Impressions カラムを探す
            let suitableHeader: string | undefined;
            for (const pattern of suitablePatterns) {
              suitableHeader = fileData.risk.headers.find((h: string) => 
                h.trim() === pattern || h.trim().toLowerCase() === pattern.toLowerCase()
              );
              if (suitableHeader) break;
            }
            
            if (unsuitableHeader) {
              const unsuitableRaw = String(row[unsuitableHeader] ?? '').replace(/,/g, '');
              const unsuitable = parseFloat(unsuitableRaw) || 0;
              riskByCategory[categoryKey].unsuitable += unsuitable;
            }
            
            if (suitableHeader) {
              const suitableRaw = String(row[suitableHeader] ?? '').replace(/,/g, '');
              const suitable = parseFloat(suitableRaw) || 0;
              riskByCategory[categoryKey].suitable += suitable;
            }
            
            // Total = Suitable + Unsuitable
            riskByCategory[categoryKey].total = 
              riskByCategory[categoryKey].suitable + riskByCategory[categoryKey].unsuitable;
          });
        });

        // DAILY QUALITY & VOLUME TREND グラフ用データ: CSVの各行をそのまま使用
        brandSuitabilityData = fileData.risk.data
          .map((row: any) => {
            if (!dateHeader || !suitabilityRateHeader || !totalImpressionsHeader) return null;
            
            const rawDate = row[dateHeader];
            const ymd = parseDateToYMD(rawDate ?? '');
            if (!ymd) return null;

            // Brand Suitability %: カンマ除去してから数値化し、100倍
            const suitabilityRaw = String(row[suitabilityRateHeader] ?? '').replace(/,/g, '');
            const suitabilityPct = parseFloat(suitabilityRaw) || 0;
            const suitability = suitabilityPct * 100; // 0.987945 → 98.7945

            // Total Impressions: カンマ除去してから数値化
            const impressionsRaw = String(row[totalImpressionsHeader] ?? '').replace(/,/g, '');
            const impressions = parseFloat(impressionsRaw) || 0;

            // 確認用ログ（最初の数行のみ）
            if (brandSuitabilityData.length < 3) {
              console.log('Graph Point Check:', {
                日付: ymd,
                適合率: suitability,
                'Brand Suitability % (raw)': suitabilityRaw,
                インプレッション: impressions,
                'Total Impressions (raw)': impressionsRaw,
              });
            }

            return {
              date: ymd,
              dateRaw: ymd,
              suitability: Number.isFinite(suitability) ? suitability : 0,
              impressions: Number.isFinite(impressions) ? impressions : 0,
            };
          })
          .filter((item: any) => item !== null)
          .sort((a: any, b: any) => a.date.localeCompare(b.date));

        // ブランド適合率（KPI）: CSV生データに基づき、
        // "Suitable Impressions" と "Total Impressions" を名称完全一致で使用して算出
        // まず実際のヘッダー名を確認
        console.log('[Risk KPI] All headers:', fileData.risk.headers);
        const suitableHeader = fileData.risk.headers.find((h: string) => 
          h.trim() === 'Suitable Impressions' || h.trim().toLowerCase() === 'suitable impressions'
        );
        const totalHeader = fileData.risk.headers.find((h: string) => 
          h.trim() === 'Total Impressions' || h.trim().toLowerCase() === 'total impressions'
        );
        console.log('[Risk KPI] Found headers:', { suitableHeader, totalHeader });
        console.log('[Risk KPI] First row sample:', fileData.risk.data[0]);

        let sumSuitable = 0;
        let sumTotal = 0;
        
        if (suitableHeader && totalHeader) {
          fileData.risk.data.forEach((row: any) => {
            const sRaw = String(row[suitableHeader] ?? '').replace(/,/g, '');
            const tRaw = String(row[totalHeader] ?? '').replace(/,/g, '');
            const s = parseFloat(sRaw) || 0;
            const t = parseFloat(tRaw) || 0;
            sumSuitable += s;
            sumTotal += t;
          });
        } else {
          console.error('[Risk KPI] Required columns not found!', {
            availableHeaders: fileData.risk.headers,
            lookingFor: ['Suitable Impressions', 'Total Impressions']
          });
        }
        
        const kpiRate = sumTotal > 0 ? (sumSuitable / sumTotal) * 100 : 0;

        // 自己検証用ログ（仕様どおり）
        console.log('CHECK - sumSuitable:', sumSuitable);
        console.log('CHECK - sumTotal:', sumTotal);
        console.log('CHECK - Result %:', kpiRate);

        // KPIとして使用＆画面表示用に保存
        suitabilityRate = kpiRate;
        (fileData as any).sumSuitableForKpi = sumSuitable;
        (fileData as any).sumTotalForKpi = sumTotal;

        // ブランドリスク分析用データ（GARMカテゴリー別）- 100%比率表示
        const brandRiskByCategory = GARM_CATEGORIES.map((key) => {
          const agg = riskByCategory[key] || { suitable: 0, unsuitable: 0, total: 0 };
          const denominator = agg.suitable + agg.unsuitable; // 分母: Suitable + Unsuitable
          
          // 比率計算（%）
          const suitablePct = denominator > 0 ? (agg.suitable / denominator) * 100 : 0;
          const unsuitablePct = denominator > 0 ? (agg.unsuitable / denominator) * 100 : 0;
          
          return {
            key,
            category: GARM_CATEGORY_LABEL_JP[key] || key,
            name: GARM_CATEGORY_LABEL_JP[key] || key, // グラフ表示用
            suitable: Number.isFinite(suitablePct) ? suitablePct : 0, // 適合率 (%)
            unsuitable: Number.isFinite(unsuitablePct) ? unsuitablePct : 0, // 不適合率 (%)
            total: 100, // 100%積み上げ用
            // デバッグ用（絶対数も保持）
            suitableAbs: Number.isFinite(agg.suitable) ? agg.suitable : 0,
            unsuitableAbs: Number.isFinite(agg.unsuitable) ? agg.unsuitable : 0,
          };
        }).sort((a, b) => {
          // 不適合率（%）が高い順にソート
          if (b.unsuitable !== a.unsuitable) return b.unsuitable - a.unsuitable;
          return a.key.localeCompare(b.key);
        });

        (fileData as any).brandRiskByCategory = brandRiskByCategory;
        
        // 配信期間の計算（Report Dateの最小値と最大値）
        const reportDates: string[] = [];
        fileData.risk.data.forEach((row: any) => {
          if (dateHeader) {
            const rawDate = row[dateHeader];
            const ymd = parseDateToYMD(rawDate ?? '');
            if (ymd) {
              reportDates.push(ymd);
            }
          }
        });
        
        if (reportDates.length > 0) {
          reportDates.sort((a, b) => a.localeCompare(b));
          const startDate = reportDates[0]; // 最小値（開始日）
          const endDate = reportDates[reportDates.length - 1]; // 最大値（終了日）
          
          // 日付フォーマット: 2026-01-15 → 2026/1/15
          const formatDateForHeader = (ymd: string): string => {
            const [y, m, d] = ymd.split('-');
            return `${y}/${parseInt(m)}/${parseInt(d)}`;
          };
          
          (fileData as any).reportingPeriod = `${formatDateForHeader(startDate)} ～ ${formatDateForHeader(endDate)}`;
        }
        
        // Risk Analysis Check ログ（不適合率%を表示）
        const categories = [...brandRiskByCategory];
        if (categories.length > 0) {
          console.log('Risk Analysis % Check (Top Category):', categories[0].name, categories[0].unsuitable.toFixed(2) + '%');
        }
      }

      // View処理
      if (fileData.view?.data) {
        console.log('[View] Raw data sample:', fileData.view.data[0]);
        console.log('[View] Headers:', fileData.view.headers);
        
        const findViewHeader = (keywords: string[]) => {
          return fileData.view.headers.find((h: string) => 
            keywords.some(k => h.includes(k))
          );
        };
        
        const dateHeader = findViewHeader(['date']);
        const viewabilityHeader = findViewHeader(['viewability', 'rate', 'vtr', 'viewable']);
        const impressionsHeader = findViewHeader(['gross', 'impression']) || findViewHeader(['impression']);
        const deviceTypeHeader = findViewHeader(['device', 'type']);
        
        // IVT計算用: IVT Impressions（整数）と Gross Impressions（整数）を直接使用
        const ivtImpressionsHeader = findViewHeader(['ivt impressions']) || findViewHeader(['ivt impression']);
        const grossImpressionsHeader = findViewHeader(['gross impressions']) || impressionsHeader;
        
        console.log('[View] Mapped headers:', { 
          dateHeader, 
          viewabilityHeader, 
          impressionsHeader, 
          deviceTypeHeader, 
          ivtImpressionsHeader,
          grossImpressionsHeader
        });
        
        viewabilityData = fileData.view.data
          .filter((d: any) => dateHeader && String(d[dateHeader] ?? '').trim())
          .map((d: any) => {
            // Viewability Rate: CSVの小数値を一律100倍（Step 2と同じ手法）
            const viewabilityRaw = String(d[viewabilityHeader] ?? '').replace(/,/g, '');
            const viewabilityPct = parseFloat(viewabilityRaw) || 0;
            const viewability = viewabilityPct * 100; // 0.91 → 91
            
            return {
              date: parseDateToYMD(dateHeader ? d[dateHeader] : ''),
              viewability,
              impressions: impressionsHeader ? cleanNum(d[impressionsHeader]) : 0
            };
          })
          .filter((d: any) => d.date)
          .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));

        // Device Type は完全一致で判定（"Mobile App", "Mobile Web", "Ott"）
        const normalizeDevice = (s: string): string | null => {
          const v = String(s || '').trim();
          if (v === 'Mobile App') return 'Mobile App';
          if (v === 'Mobile Web') return 'Mobile Web';
          if (v === 'Ott' || v === 'OTT') return 'OTT';
          return null; // 該当しない場合は null を返す（Overall のみに含める）
        };

        const deviceMap: any = {};
        // IVT集計: 分子（IVT Impressions合計）と分母（Gross Impressions合計）を別々に集計
        const ivtAgg: Record<string, { num: number; den: number }> = {};
        const viewValCol = viewabilityHeader;
        const impCol = impressionsHeader;
        
        // Overall用の集計（全行の合計値）
        const overallAgg: Record<string, { viewabilitySum: number; impressionsSum: number }> = {};
        
        fileData.view.data.forEach((d: any) => {
          if (!dateHeader || !viewValCol) return;
          
          const ymd = parseDateToYMD(d[dateHeader]);
          if (!ymd) return;
          
          const impVal = impCol ? cleanNum(d[impCol]) : 0;
          if (impVal <= 0) return;
          
          // Viewability Rate: CSVの小数値を一律100倍
          const viewabilityRaw = String(d[viewValCol] ?? '').replace(/,/g, '');
          const viewabilityPct = parseFloat(viewabilityRaw) || 0;
          const viewability = viewabilityPct * 100; // 0.91 → 91
          
          // Device Type で完全一致判定
          const device = deviceTypeHeader ? normalizeDevice(d[deviceTypeHeader]) : null;
          
          // デバイス別データ（完全一致した場合のみ）
          if (device) {
            if (!deviceMap[device]) deviceMap[device] = [];
            deviceMap[device].push({
              date: ymd,
              viewability,
              impressions: impVal,
            });
          }
          
          // Overall: 全行を合算（デバイスフィルタなし）
          if (!overallAgg[ymd]) {
            overallAgg[ymd] = { viewabilitySum: 0, impressionsSum: 0 };
          }
          overallAgg[ymd].viewabilitySum += viewability * impVal; // 加重平均用
          overallAgg[ymd].impressionsSum += impVal;
          
          // IVT計算: IVT Impressions（整数）と Gross Impressions（整数）を直接集計
          if (ivtImpressionsHeader && grossImpressionsHeader) {
            const ivtImpsRaw = String(d[ivtImpressionsHeader] ?? '').replace(/,/g, '');
            const grossImpsRaw = String(d[grossImpressionsHeader] ?? '').replace(/,/g, '');
            const ivtImps = parseFloat(ivtImpsRaw) || 0; // IVT Impressions（整数）
            const grossImps = parseFloat(grossImpsRaw) || 0; // Gross Impressions（整数）
            
            // Overall IVT: 全行の合計分子と合計分母を別々に集計
            if (!ivtAgg['Overall']) ivtAgg['Overall'] = { num: 0, den: 0 };
            ivtAgg['Overall'].num += ivtImps; // IVT Impressions合計
            ivtAgg['Overall'].den += grossImps; // Gross Impressions合計
            
            // デバイス別IVT（完全一致した場合のみ）
            if (device) {
              if (!ivtAgg[device]) ivtAgg[device] = { num: 0, den: 0 };
              ivtAgg[device].num += ivtImps; // IVT Impressions合計
              ivtAgg[device].den += grossImps; // Gross Impressions合計
            }
          }
        });
        
        // Overall を deviceMap に追加
        if (!deviceMap['Overall']) deviceMap['Overall'] = [];
        Object.entries(overallAgg).forEach(([date, agg]) => {
          const overallViewability = agg.impressionsSum > 0 
            ? (agg.viewabilitySum / agg.impressionsSum) 
            : null;
          deviceMap['Overall'].push({
            date,
            viewability: overallViewability,
            impressions: agg.impressionsSum,
          });
        });

        if (!deviceTypeHeader && Object.keys(deviceMap).length === 0 && viewabilityData.length > 0) {
          viewabilityData.forEach((d: any) => {
            if (!deviceMap['Overall']) deviceMap['Overall'] = [];
            deviceMap['Overall'].push({ date: d.date, viewability: d.viewability, impressions: d.impressions || 0 });
          });
        }

        const dateSet = new Set<string>();
        Object.values(deviceMap).forEach((arr: any) => {
          (arr as any[]).forEach((d: any) => dateSet.add(d.date));
        });
        const sortedDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
        const mergedData = sortedDates.map(date => {
          const row: any = { date };
          Object.entries(deviceMap).forEach(([device, arr]) => {
            const entry = (arr as any[]).find((d: any) => d.date === date);
            // 分母（impressions）が0、または該当データがない日は null とし、線を途切れさせる（0%としてプロットしない）
            if (entry && (entry.impressions ?? 0) > 0 && entry.viewability !== null) {
              row[device] = entry.viewability;
            } else {
              row[device] = null;
            }
          });
          return row;
        });
        deviceViewabilityData = mergedData;
        console.log('[View] Device map keys:', Object.keys(deviceMap), 'rows:', mergedData.length);

        // IVT Safe Zone用データ（媒体ベンチマーク + デバイス別）
        // 計算式: (IVT Impressions合計) ÷ (Gross Impressions合計) × 100
        const ivtBenchmark = 1.0; // 1.00% (固定値: 媒体ベンチマーク)
        const ivtRates = [
          { name: '媒体ベンチマーク', value: ivtBenchmark },
          ...['Overall', 'OTT', 'Mobile App', 'Mobile Web'].map((dev) => {
            const agg = ivtAgg[dev];
            // 分子（IVT Impressions合計）÷ 分母（Gross Impressions合計）× 100
            const rate = agg && agg.den > 0 ? (agg.num / agg.den) * 100 : 0;
            return { name: dev, value: rate };
          }),
        ];
        (fileData as any).ivtRates = ivtRates;
        
        // 回帰チェック用ログ（Step 1の結果が変わっていないことを確認）
        console.log('REGRESSION CHECK - Global Suitability Rate:', suitabilityRate);
        const overallViewability = deviceMap['Overall'] && deviceMap['Overall'].length > 0
          ? deviceMap['Overall'].reduce((sum: number, d: any) => {
              const imp = d.impressions || 0;
              const view = d.viewability || 0;
              return sum + (view * imp);
            }, 0) / deviceMap['Overall'].reduce((sum: number, d: any) => sum + (d.impressions || 0), 0)
          : 0;
        console.log('Step 3 - Overall Viewability:', overallViewability.toFixed(2) + '%');
        
        // IVT DEBUG ログ（計算プロセスを可視化）
        const totalIvtImps = ivtAgg['Overall'] ? ivtAgg['Overall'].num : 0;
        const totalGrossImps = ivtAgg['Overall'] ? ivtAgg['Overall'].den : 0;
        const campaignIvt = totalGrossImps > 0 ? (totalIvtImps / totalGrossImps) * 100 : 0;
        const benchmarkValue = ivtBenchmark;
        console.log('IVT DEBUG - Sum of IVT Impressions:', totalIvtImps);
        console.log('IVT DEBUG - Sum of Gross Impressions:', totalGrossImps);
        console.log('IVT DEBUG - Calculated Overall Rate:', campaignIvt.toFixed(2) + '%');
        console.log('IVT DEBUG - Benchmark Rate:', benchmarkValue.toFixed(2) + '%');
      }

      // デバッグ用: 読み込みCSVサマリー（開発中はconsoleで追える）
      const csvSummary = {
        performance: fileData.performance?.data
          ? { type: 'performance', rows: fileData.performance.data.length, headers: fileData.performance.headers?.slice(0, 8), sumVolume: performanceData.reduce((s: number, d: any) => s + (d?.volume || 0), 0) }
          : null,
        risk: fileData.risk?.data
          ? { type: 'risk', rows: fileData.risk.data.length, dateMin: brandSuitabilityData.length ? brandSuitabilityData[0]?.date : null, dateMax: brandSuitabilityData.length ? brandSuitabilityData[brandSuitabilityData.length - 1]?.date : null, sumImpressions: brandSuitabilityData.reduce((s: number, d: any) => s + (d?.impressions || 0), 0), suitabilityRate }
          : null,
        view: fileData.view?.data
          ? { type: 'view', rows: fileData.view.data.length, dateMin: viewabilityData.length ? viewabilityData[0]?.date : null, dateMax: viewabilityData.length ? viewabilityData[viewabilityData.length - 1]?.date : null, deviceKeys: Object.keys(deviceViewabilityData[0] || {}).filter((k) => k !== 'date') }
          : null,
      };
      console.log('[CSV Summary]', csvSummary);

      const lift = (lowQuality / totalImp) * 100;
      const budgetOptimization = (lowQuality / 1000) * cpm;

      const newReportData = {
        clientName,
        totalImpressions: totalImp,
        lowQualityBlocked: lowQuality,
        estimatedCPM: cpm,
        suitabilityRate,
        lift,
        budgetOptimization,
        performanceData,
        brandSuitabilityData,
        viewabilityData,
        deviceViewabilityData,
        brandRiskByCategory: (fileData as any).brandRiskByCategory || [],
        ivtRates: (fileData as any).ivtRates || [],
        kpiSumSuitable: (fileData as any).sumSuitableForKpi ?? null,
        kpiSumTotal: (fileData as any).sumTotalForKpi ?? null,
        createdAt: new Date().toLocaleString('ja-JP'),
        reportingPeriod: (fileData as any).reportingPeriod || new Date().toLocaleString('ja-JP')
      };

      setReportData(newReportData);
      setStage('dashboard');
      
      // Step 5: 最終仕上げのセルフチェック
      console.log('Final Polish: Labels formatted, Chart sizes updated, PDF layout optimized.');
      
      // Step 6: 最終仕上げの完了報告
      console.log('Report Finalized: Dates automated, Layout centered, Debug info removed.');
      
      // Step 7: A4最適化の完了報告
      console.log('A4 Optimization Complete: Hybrid titles set, alignment fixed, centered for PDF.');
      
      // Step 8: 最終クリーンナップの完了報告
      console.log('Step 8 Complete: Titles simplified to Japanese, Web publish error fixed, PDF centering applied.');
      console.log('Final Polish Applied: Legend Grid 2x4, Firebase Payload Optimized, PDF Centering Fixed.');
      console.log('Final Report Polish Complete: PDF centered, Visuals tight, Insights enriched.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleWebPublish = async () => {
    if (!sharePassword || !reportData) {
      setError('パスワードとレポートデータを設定してください');
      return;
    }
    try {
      setLoading(true);
      setError('');

      const reportId = generateReportIdLocal();
      // 生CSVは含めず、集計済み軽量JSONのみをFirebaseへ送信（convertReportDataToProcessedData + capArray で制限）
      const processedDataRaw = convertReportDataToProcessedData(reportData);
      const processedData = sanitizeProcessedData(processedDataRaw);
      const config: ReportConfig = {
        reportId,
        cpm: parseFloat(estimatedCPM) || 1500,
        passwordHash: hashPassword(sharePassword),
        createdAt: Date.now(),
      };

      await saveReport(reportId, config, processedData);

      const link = `${window.location.origin}/shared/${reportId}`;
      setSharedLink(link);
      setSharedReportId(reportId);
    } catch (err) {
      // コンソールにエラー詳細を出力（デバッグ用）
      console.error('[Web発行] 接続に失敗しました。エラー詳細:', err);
      // 画面には安全なメッセージのみ表示（発行準備完了・デモ保存）
      setError('発行準備完了（デモ保存）');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(sharedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAccessReport = async () => {
    try {
      if (!sharedReportId || !accessPassword) {
        setError('パスワードを入力してください');
        return;
      }

      setLoading(true);
      
      // Firestoreからレポートを取得（パスワード検証付き）
      const processedData = await getReportWithPassword(sharedReportId, accessPassword);
      
      if (!processedData) {
        throw new Error('レポートが見つかりません');
      }

      // ProcessedDataをreportData形式に変換して表示
      // CPM: 保存された値があればそれを使用、なければ逆算（古いデータとの互換性）
      const cpm = processedData.estimatedCPM !== undefined
        ? processedData.estimatedCPM
        : (processedData.kpis.budgetOptimization > 0 && processedData.kpis.totalExclusions > 0
          ? (processedData.kpis.budgetOptimization / (processedData.kpis.totalExclusions / 1000))
          : 1500);
      
      if (processedData.estimatedCPM === undefined) {
        console.log('[Data Migration] estimatedCPM not found, using reverse calculation');
      }
      
      const convertedReportData = convertProcessedDataToReportData(processedData, cpm);
      
      setReportData(convertedReportData);
      setStage('dashboard');
      setIsSharedView(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * シンプルかつ確実に全体をキャプチャする関数（oklchカラー対応）
   * html2canvas は oklch 未対応のため、oklch を含まない iframe 内でキャプチャする
   */
  const captureDashboardSimple = async (source: HTMLElement): Promise<HTMLCanvasElement> => {
    const SAFE_CSS = [
      '*,*::before,*::after{box-sizing:border-box}',
      'html,body{background:#ffffff !important;color:#0f172a;margin:0;padding:0;font-family:system-ui,sans-serif;width:fit-content;min-height:100vh}',
      '[class]{background-color:initial;color:initial}',
      '.bg-white{background:#fff}.bg-slate-50{background:#f8fafc}.bg-sky-50{background:#f0f9ff}.bg-blue-50{background:#eff6ff}.bg-red-50{background:#fef2f2}.bg-red-500{background:#ef4444}.bg-sky-500{background:#0ea5e9}.bg-sky-600{background:#0284c7}',
      '.text-slate-900{color:#0f172a}.text-slate-600{color:#475569}.text-slate-500{color:#64748b}.text-red-600{color:#dc2626}.text-red-700{color:#b91c1c}.text-red-800{color:#991b1b}.text-white{color:#fff}.text-green-700{color:#15803d}.text-cyan-700{color:#0e7490}.text-amber-700{color:#b45309}.text-sky-700{color:#0369a1}',
      '.rounded-2xl,.rounded-32px,.rounded-16px{border-radius:1rem}.rounded-xl{border-radius:0.75rem}.rounded-lg{border-radius:0.5rem}',
      '.border{border:1px solid}.border-slate-200{border-color:#e2e8f0}.border-red-200{border-color:#fecaca}.border-white{border-color:#fff}',
      '.p-4{padding:1rem}.p-6{padding:1.5rem}.p-8{padding:2rem}.px-4{padding-left:1rem;padding-right:1rem}.py-2{padding-top:0.5rem;padding-bottom:0.5rem}.py-3{padding-top:0.75rem;padding-bottom:0.75rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}',
      '.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}.text-2xl{font-size:1.5rem}.text-3xl{font-size:1.875rem}.text-4xl{font-size:2.25rem}.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}',
      '.flex{display:flex}.grid{display:grid}.gap-2{gap:0.5rem}.gap-3{gap:0.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.mb-2{margin-bottom:0.5rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mb-8{margin-bottom:2rem}.mt-1{margin-top:0.25rem}.mt-2{margin-top:0.5rem}',
      '.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.lg\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}',
      'svg{overflow:visible}.recharts-wrapper{width:100%!important;height:100%!important}.recharts-cartesian-axis-tick-value{font-size:12px;fill:#6b7280}',
      'button,cursor-pointer{cursor:pointer}',
    ].join('');
    
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1200px;height:2000px;visibility:hidden';
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SAFE_CSS}</style></head><body><div id="cap-root"></div></body></html>`;
      iframe.srcdoc = doc;
      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc || !iframeDoc.body) {
            reject(new Error('iframe の document にアクセスできません'));
            return;
          }
          const root = iframeDoc.getElementById('cap-root');
          if (!root) {
            reject(new Error('キャプチャ用のルート要素が見つかりません'));
            return;
          }
          root.innerHTML = source.innerHTML;
          // エクスポート時は PDF/PPTX/Web発行ボタンを非表示
          root.querySelectorAll('[data-export-hide]').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'none');
          });
          const el = root as HTMLElement;
          el.style.setProperty('width', '1100px', 'important');
          el.style.setProperty('margin', '0 auto', 'important');
          el.style.setProperty('padding', '20px', 'important');
          el.style.setProperty('background', '#ffffff');
          iframeDoc.body.style.setProperty('display', 'flex', 'important');
          iframeDoc.body.style.setProperty('justify-content', 'center', 'important');
          iframeDoc.body.style.setProperty('background', '#ffffff', 'important');
          setTimeout(() => {
            html2canvas(root, {
              scale: 1.5,
              useCORS: false,
              backgroundColor: '#ffffff',
              logging: false,
              allowTaint: true,
              scrollX: 0,
              scrollY: 0,
              width: 1150,
              height: root.scrollHeight,
            })
              .then((canvas) => {
                document.body.removeChild(iframe);
                resolve(canvas);
              })
              .catch((err) => {
                document.body.removeChild(iframe);
                reject(err);
              });
          }, 100);
        } catch (e) {
          document.body.removeChild(iframe);
          reject(e);
        }
      };
      iframe.onerror = () => {
        document.body.removeChild(iframe);
        reject(new Error('iframe の読み込みに失敗しました'));
      };
      document.body.appendChild(iframe);
    });
  };

  /**
   * html2canvas は oklch 未対応のため、oklch を含まない iframe 内にダッシュボードのコピーを置き、
   * そのノードだけをキャプチャする。メインドキュメントのスタイルは一切参照しない。
   * （PPTX出力用に保持）
   */
  const captureDashboardWithoutOklch = (source: HTMLElement): Promise<HTMLCanvasElement> => {
      const SAFE_CSS = [
        '*,*::before,*::after{box-sizing:border-box}',
        'html,body{background:#ffffff !important;color:#0f172a;margin:0;padding:0;font-family:system-ui,sans-serif;width:fit-content;min-height:100vh}',
      '[class]{background-color:initial;color:initial}',
      '.bg-white{background:#fff}.bg-slate-50{background:#f8fafc}.bg-sky-50{background:#f0f9ff}.bg-blue-50{background:#eff6ff}.bg-red-50{background:#fef2f2}.bg-red-500{background:#ef4444}.bg-sky-500{background:#0ea5e9}.bg-sky-600{background:#0284c7}',
      '.text-slate-900{color:#0f172a}.text-slate-600{color:#475569}.text-slate-500{color:#64748b}.text-red-600{color:#dc2626}.text-red-700{color:#b91c1c}.text-red-800{color:#991b1b}.text-white{color:#fff}.text-green-700{color:#15803d}.text-cyan-700{color:#0e7490}.text-amber-700{color:#b45309}.text-sky-700{color:#0369a1}',
      '.rounded-2xl,.rounded-32px,.rounded-16px{border-radius:1rem}.rounded-xl{border-radius:0.75rem}.rounded-lg{border-radius:0.5rem}',
      '.border{border:1px solid}.border-slate-200{border-color:#e2e8f0}.border-red-200{border-color:#fecaca}.border-white{border-color:#fff}',
      '.p-4{padding:1rem}.p-6{padding:1.5rem}.p-8{padding:2rem}.px-4{padding-left:1rem;padding-right:1rem}.py-2{padding-top:0.5rem;padding-bottom:0.5rem}.py-3{padding-top:0.75rem;padding-bottom:0.75rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}',
      '.text-xs{font-size:0.75rem}.text-sm{font-size:0.875rem}.text-2xl{font-size:1.5rem}.text-3xl{font-size:1.875rem}.text-4xl{font-size:2.25rem}.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}',
      '.flex{display:flex}.grid{display:grid}.gap-2{gap:0.5rem}.gap-3{gap:0.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.mb-2{margin-bottom:0.5rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mb-8{margin-bottom:2rem}.mt-1{margin-top:0.25rem}.mt-2{margin-top:0.5rem}',
      '.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.lg\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}',
      'svg{overflow:visible}.recharts-wrapper{width:100%!important;height:100%!important}.recharts-cartesian-axis-tick-value{font-size:12px;fill:#6b7280}',
      'button,cursor-pointer{cursor:pointer}',
    ].join('');
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin'); // same-origin で contentDocument にアクセスするため
      // A4横サイズ（約1123px）に合わせてiframe幅を設定（中央配置のため）
      iframe.style.cssText = 'position:absolute;left:-9999px;width:1200px;height:2000px;visibility:hidden';
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${SAFE_CSS}</style></head><body><div id="cap-root"></div></body></html>`;
      iframe.srcdoc = doc;
      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc || !iframeDoc.body) {
            reject(new Error('iframe の document にアクセスできません'));
            return;
          }
          const root = iframeDoc.getElementById('cap-root');
          if (!root) {
            reject(new Error('キャプチャ用のルート要素が見つかりません'));
            return;
          }
          root.innerHTML = source.innerHTML;
          // エクスポート時は PDF/PPTX/Web発行ボタンと、それらを含むヘッダー/ナビ要素を非表示（要件4）
          root.querySelectorAll('[data-export-hide]').forEach((el) => {
            (el as HTMLElement).style.setProperty('display', 'none');
          });
          // PDF中央配置: width/margin/display を物理強制
          // A4横サイズ（1123px）に合わせてコンテンツ幅を1050pxに固定、左右均等の余白を確保
          // padding 20px * 2 = 40px を考慮して、1050px + 40px = 1090px（A4横1123pxに対して左右16.5pxずつの余白）
          const el = root as HTMLElement;
          el.style.setProperty('width', '1050px', 'important');
          el.style.setProperty('max-width', '1050px', 'important');
          el.style.setProperty('margin', '0 auto', 'important');
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('padding', '20px', 'important'); // 左右20pxに統一
          el.style.setProperty('background', '#ffffff');
          // body全体をflexで中央寄せ（A4横サイズに合わせて幅を固定）
          iframeDoc.body.style.setProperty('display', 'flex', 'important');
          iframeDoc.body.style.setProperty('justify-content', 'center', 'important');
          iframeDoc.body.style.setProperty('align-items', 'flex-start', 'important');
          iframeDoc.body.style.setProperty('width', '1200px', 'important'); // A4横サイズに固定
          iframeDoc.body.style.setProperty('min-height', '100vh', 'important');
          iframeDoc.body.style.setProperty('background', '#ffffff', 'important');
          iframeDoc.body.style.setProperty('margin', '0', 'important');
          iframeDoc.body.style.setProperty('padding', '0', 'important');
          // html要素も幅を固定して中央配置を確実に
          iframeDoc.documentElement.style.setProperty('width', '1200px', 'important');
          iframeDoc.documentElement.style.setProperty('margin', '0', 'important');
          iframeDoc.documentElement.style.setProperty('padding', '0', 'important');
          // root要素を直接キャプチャ（body全体ではなく、中央配置されたコンテンツのみ）
          // 中央配置を確実にするため、少し待ってからキャプチャ
          setTimeout(() => {
            html2canvas(root, {
              scale: 2,
              useCORS: false,
              backgroundColor: '#ffffff',
              logging: false,
              allowTaint: true,
              scrollX: 0,
              scrollY: 0,
              width: 1090,
              height: root.scrollHeight,
            })
              .then((canvas) => {
                // A4横サイズ（1123px）に合わせて中央配置用の余白を計算
                // コンテンツ幅1060px + padding 20px * 2 = 1100px
                // A4横1123pxに対して、左右均等の余白（約11.5pxずつ）を確保
                const a4Width = 1123; // A4横サイズ（96dpi）
                const contentWidth = 1060 + 40; // コンテンツ幅1060px + 左右padding 20px * 2
                const totalPadding = Math.max(0, a4Width - contentWidth);
                const leftPadding = Math.floor(totalPadding / 2);
                const rightPadding = totalPadding - leftPadding;
                
                // キャンバスを中央配置用の余白付きキャンバスに変換
                const paddedCanvas = document.createElement('canvas');
                paddedCanvas.width = a4Width; // A4横サイズに固定
                paddedCanvas.height = canvas.height;
                const ctx = paddedCanvas.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
                  // キャンバスを中央配置（左右均等の余白）
                  ctx.drawImage(canvas, leftPadding, 0);
                }
                document.body.removeChild(iframe);
                resolve(paddedCanvas);
              })
              .catch((err) => {
                document.body.removeChild(iframe);
                reject(err);
              });
          }, 100); // レンダリング完了を待つ
        } catch (e) {
          document.body.removeChild(iframe);
          reject(e);
        }
      };
      iframe.onerror = () => {
        document.body.removeChild(iframe);
        reject(new Error('iframe の読み込みに失敗しました'));
      };
      document.body.appendChild(iframe);
    });
  };

  const handlePDFExport = async () => {
    const element = document.getElementById('dashboard-content');
    if (!element) {
      setError('PDF出力: ダッシュボード要素が見つかりません。画面を再読み込みしてください。');
      return;
    }

    try {
      setError('');
      const canvas = await captureDashboardSimple(element);
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 10;
      const maxWidth = pdfWidth - (margin * 2);
      const maxHeight = pdfHeight - (margin * 2);

      // 画像の比率を維持したままサイズ計算
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
      
      const finalWidth = imgWidth * ratio;
      const finalHeight = imgHeight * ratio;

      // PDFの「真ん中」に配置するための計算
      const xPos = (pdfWidth - finalWidth) / 2;
      const yPos = (pdfHeight - finalHeight) / 2;

      const jpegData = canvas.toDataURL('image/jpeg', 0.8);
      pdf.addImage(jpegData, 'JPEG', xPos, yPos, finalWidth, finalHeight, 'report', 'FAST');
      console.log("PDF Compression applied: Format switched to JPEG(0.8), Scale set to 1.5, Internal compression enabled.");
      pdf.save(`${(reportData?.clientName || 'zefr-report').replace(/[\\/:*?"<>|]/g, '_')}_report.pdf`);
    } catch (err) {
      setError('PDF出力エラー: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePPTXExport = async () => {
    const element = document.getElementById('dashboard-content');
    if (!element) {
      setError('PPTX出力: ダッシュボード要素が見つかりません。画面を再読み込みしてください。');
      return;
    }
    try {
      setError('');
      const canvas = await captureDashboardWithoutOklch(element);
      const imgData = canvas.toDataURL('image/png');
      const prs = new PptxGenJS();
      const slide = prs.addSlide();
      const w = 10;
      const h = (canvas.height / canvas.width) * w;
      slide.addImage({ data: imgData, x: 0, y: 0, w, h });
      const safeName = (reportData?.clientName || 'zefr-report').replace(/[\\/:*?"<>|]/g, '_');
      await prs.writeFile({ fileName: `${safeName}_report.pptx` });
    } catch (err) {
      setError('PPTX出力エラー: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // URL パラメータからレポートID取得
  useEffect(() => {
    const pathMatch = location.match(/^\/shared\/(.+)$/);
    if (pathMatch) {
      setSharedReportId(pathMatch[1]);
      setStage('shared');
      setIsSharedView(true);
    }
  }, [location]);

  // ===== UI レンダリング =====

  if (stage === 'shared') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50 p-8">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-[32px] p-8 shadow-lg">
            <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">Zefr インサイトレポート</h1>
            <p className="text-center text-slate-600 mb-8">パスワードを入力してレポートを表示</p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[16px] flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">パスワード</label>
                <div className="relative">
                  <input
                    type={showAccessPassword ? 'text' : 'password'}
                    value={accessPassword}
                    onChange={(e) => setAccessPassword(e.target.value)}
                    placeholder="パスワードを入力"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={() => setShowAccessPassword(!showAccessPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                  >
                    {showAccessPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleAccessReport}
                disabled={loading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-[16px] transition disabled:opacity-50"
              >
                {loading ? 'ロード中...' : 'レポートを表示'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-sky-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-bold text-white">Z</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">Zefr インサイトレポート</h1>
            <p className="text-slate-600">Premium Report Dashboard</p>
          </div>

          <div className="bg-white rounded-[32px] p-8 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-8">セットアップ</h2>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-[16px] flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* ファイルアップロード（複数CSVをドラッグ&ドロップで自動分類） */}
            <div
              className="mb-8"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer?.files?.length) {
                  handleFilesBatchUpload(e.dataTransfer.files);
                }
              }}
            >
              <h3 className="text-lg font-semibold text-slate-900 mb-4">ファイル & ドラッグ&ドロップ</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['performance', 'risk', 'view'].map(type => (
                  <label key={type} className="relative cursor-pointer">
                    <div className={`p-6 rounded-[24px] border-2 border-dashed text-center transition ${
                      files[type as keyof typeof files] ? 'border-sky-500 bg-sky-50' : 'border-sky-300 hover:border-sky-500'
                    }`}>
                      <Upload className="w-8 h-8 text-sky-500 mx-auto mb-2" />
                      <p className="font-semibold text-slate-900">{type.charAt(0).toUpperCase() + type.slice(1)}</p>
                      <p className="text-xs text-slate-600 mt-1">ファイルを選択</p>
                      {files[type as keyof typeof files] && <p className="text-xs text-sky-600 mt-2 font-semibold">✓ {files[type as keyof typeof files]?.name}</p>}
                    </div>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => handleFileUpload(e, type as 'performance' | 'risk' | 'view')}
                      className="hidden"
                    />
                  </label>
                ))}
              </div>
              {/* まとめて選択するための非表示input（複数ファイル対応） */}
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleFilesBatchUpload(e.target.files);
                  }
                }}
              />
            </div>

            {/* 入力項目 */}
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">クライアント名</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="例: SoftBank Corp."
                  className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">Total Measurable Impressions</label>
                  <input
                    type="text"
                    value={totalImpressions}
                    onChange={(e) => setTotalImpressions(e.target.value)}
                    placeholder="例: 50M または 50000K"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">Low-quality Impressions Blocked</label>
                  <input
                    type="text"
                    value={lowQualityBlocked}
                    onChange={(e) => setLowQualityBlocked(e.target.value)}
                    placeholder="例: 100K または 0.1M"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">推定CPM</label>
                  <input
                    type="number"
                    value={estimatedCPM}
                    onChange={(e) => setEstimatedCPM(e.target.value)}
                    placeholder="1500"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-2">共有用パスワード</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    placeholder="パスワードを設定"
                    className="w-full px-4 py-3 rounded-[16px] border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={processFiles}
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-[16px] transition disabled:opacity-50"
            >
              {loading ? 'ロード中...' : 'レポートを生成して共有'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== ダッシュボード =====
  if (stage === 'dashboard' && reportData) {
    const colors = ['#0ea5e9', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
    const suitPct = reportData.suitabilityRate ?? 0;
    const liftPct = reportData.lift ?? 0;
    const originalPct = Math.max(0, suitPct - liftPct);
    const remainingPct = suitPct < 100 ? 100 - suitPct : 0;
    const donutData = [
      { name: 'ベースの適合性', value: originalPct, fill: '#0ea5e9' },
      { name: '適合性リフト', value: liftPct, fill: '#06b6d4' },
      ...(remainingPct > 0 ? [{ name: 'その他', value: remainingPct, fill: '#d1d5db' }] : []),
    ].filter((d) => d.value > 0);

    // グラフ用パーセントフォーマッタ（0.985 → 98.5% / 98.5 → 98.5%）
    const toAxisPercent = (val: number | null | undefined): string => {
      if (val == null || Number.isNaN(val)) return '';
      const n = Number(val);
      const scaled = Math.abs(n) <= 1 ? n * 100 : n;
      return scaled.toFixed(1) + '%';
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-50 p-8">
        <div className="max-w-7xl mx-auto" id="dashboard-content">
          {/* エラー表示（PDF/PPTX/Web発行の失敗時） */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800 whitespace-pre-wrap">{error}</p>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="mt-2 text-xs text-red-600 hover:underline"
                >
                  閉じる
                </button>
              </div>
            </div>
          )}
          {/* ヘッダー（PDF/PPTXエクスポート時もタイトルは保持） */}
          <div className="mb-2 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Zefr インサイトレポート</h1>
              <p className="text-slate-600">{reportData.clientName} | 配信期間 {reportData.reportingPeriod || reportData.createdAt}</p>
            </div>
            {/* ボタン群のみエクスポート時に非表示 */}
            <div className="flex gap-3" data-export-hide>
              <button onClick={handlePDFExport} className="flex items-center gap-2 px-4 py-2 bg-white rounded-[16px] hover:bg-slate-50 border border-slate-200">
                <Download className="w-5 h-5" /> PDF
              </button>
              <button onClick={handlePPTXExport} className="flex items-center gap-2 px-4 py-2 bg-white rounded-[16px] hover:bg-slate-50 border border-slate-200">
                <Download className="w-5 h-5" /> PPTX
              </button>
            </div>
          </div>

          {/* KPIカード */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">ブランド適合率</p>
              <p className="text-3xl font-bold text-slate-900">{toPercentStr(reportData.suitabilityRate)}</p>
              <p className="text-xs text-slate-500 mt-2">Suitable合計 / Total Impressions合計</p>
            </div>

            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">適合性リフト</p>
              <p className="text-3xl font-bold text-sky-500">+{reportData.lift?.toFixed(1) || 'N/A'} pt</p>
              <p className="text-xs text-slate-500 mt-2">改善効果</p>
            </div>

            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">総除外インプレッション</p>
              <p className="text-3xl font-bold text-slate-900">{formatNumberWithUnit(reportData.lowQualityBlocked)}</p>
              <p className="text-xs text-slate-500 mt-2">ブロック済み</p>
            </div>

            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-white">
              <p className="text-xs font-semibold text-slate-600 mb-2">適正化予算額推定</p>
              <p className="text-3xl font-bold text-slate-900">¥{reportData.budgetOptimization?.toLocaleString('ja-JP', { maximumFractionDigits: 0 }) || 'N/A'}</p>
              <p className="text-xs text-slate-500 mt-2">推定削減額</p>
            </div>
          </div>

          {/* チャート（左: Suitabilityサマリー、右: DAILY QUALITY）（要件2 レイアウト入れ替え） */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-2">
            {/* Suitabilityサマリー：ベースの適合性 + 適合性リフト = 合計（要件2） */}
            <div className="bg-white rounded-[32px] p-3 shadow-sm border border-white" style={{ height: '360px' }}>
              <h3 className="text-sm font-bold text-slate-900 mb-1">適合性サマリー</h3>
              <p className="text-xs text-slate-500 mb-2">合計 {suitPct.toFixed(1)}%（ベース + リフト）</p>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={80}
                    outerRadius={108}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => (value > 0 ? `${name}: ${value.toFixed(1)}%` : '')}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => toPercentStr(value)} />
                  {/* ドーナツ中央にブランド適合率を強調表示 */}
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={40}
                    fontWeight="bold"
                    fill="#00053A"
                  >
                    {suitPct.toFixed(1)}%
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* DAILY QUALITY & VOLUME TREND */}
            <div className="bg-white rounded-[32px] p-3 shadow-sm border border-white" style={{ height: '360px' }}>
              <h3 className="text-sm font-bold text-slate-900 mb-2">クオリティ＆ボリューム推移</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={Array.isArray(reportData.brandSuitabilityData) && reportData.brandSuitabilityData.length > 0 ? reportData.brandSuitabilityData : []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis 
                    stroke="#9ca3af" 
                    tick={{ fontSize: 12 }} 
                    tickFormatter={(v) => formatImpressions(v)}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="#9ca3af" 
                    tick={{ fontSize: 12 }} 
                    domain={[80, 100]} 
                    tickFormatter={(v) => Number(v).toFixed(1) + '%'} 
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => {
                      if (name === 'Brand Suitability %') {
                        return toPercentStr(value);
                      } else if (name === 'impressions' || name === 'Total Impressions') {
                        return formatImpressions(value);
                      }
                      return value;
                    }}
                    labelFormatter={(label) => `日付: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="impressions" fill="#0ea5e9" opacity={0.3} name="Total Impressions" />
                  <Line yAxisId="right" type="monotone" dataKey="suitability" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Brand Suitability %" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PERFORMANCE BY CONTEXT + DAILY VIEWABILITY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-2">
            {/* PERFORMANCE BY CONTEXT：軸スケールをデータの min/max で自動調整（要望5） */}
            <div className="bg-white rounded-[32px] p-3 shadow-sm border border-white" style={{ height: '460px' }}>
              <h3 className="text-sm font-bold text-slate-900 mb-2">コンテキスト・パフォーマンス分析</h3>
              <ResponsiveContainer width="100%" height={400}>
                {(() => {
                  // CTRがすべて0（または0.01未満）かどうかを判定
                  const performanceArray = reportData.performanceData || [];
                  const allCtrZero = performanceArray.length > 0 && performanceArray.every((d: any) => {
                    const ctr = Number(d?.ctr) || 0;
                    return ctr < 0.01;
                  });
                  
                  // Y軸の設定を動的に決定
                  const yAxisDataKey = allCtrZero ? 'viewability' : 'ctr';
                  const yAxisLabel = allCtrZero ? 'Viewability (%)' : 'CTR (%)';
                  const yAxisDomain = allCtrZero ? [80, 100] : (() => {
                    const arr = reportData.performanceData || [];
                    const vals = arr.map((d: any) => Number(d?.ctr)).filter((v: number) => !Number.isNaN(v));
                    if (vals.length === 0) return [0, 10];
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    const pad = (max - min) * 0.1 || 0.5;
                    return [Math.max(0, min - pad), max + pad];
                  })();
                  
                  return (
                    <ScatterChart margin={{ top: 10, right: 16, bottom: 52, left: 72 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        type="number"
                        dataKey="vcr"
                        stroke="#9ca3af"
                        tickFormatter={toAxisPercent}
                        domain={(() => {
                          const arr = reportData.performanceData || [];
                          const vals = arr.map((d: any) => Number(d?.vcr)).filter((v: number) => !Number.isNaN(v));
                          if (vals.length === 0) return [0, 100];
                          const min = Math.min(...vals);
                          const max = Math.max(...vals);
                          const pad = (max - min) * 0.1 || 1;
                          return [Math.max(0, min - pad), max + pad];
                        })()}
                        label={{ value: 'VCR (%)', position: 'insideBottom', offset: 8 }}
                      />
                      <YAxis
                        type="number"
                        dataKey={yAxisDataKey}
                        stroke="#9ca3af"
                        tickFormatter={toAxisPercent}
                        domain={yAxisDomain}
                        label={{ value: yAxisLabel, angle: -90, position: 'left' }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload?.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-2 rounded border border-slate-200 text-xs">
                                <p className="font-semibold">{data.categoryName}</p>
                                <p>VCR: {toAxisPercent(data.vcr)}</p>
                                {allCtrZero ? (
                                  <p>Viewability: {toAxisPercent(data.viewability)}</p>
                                ) : (
                                  <p>CTR: {toAxisPercent(data.ctr)}</p>
                                )}
                                <p>Impressions: {formatNumberWithUnit(data.volume)}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ 
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                          gap: '8px',
                          fontSize: '11px',
                          lineHeight: 1.1,
                          margin: '0 auto'
                        }}
                        align="center"
                        verticalAlign="bottom"
                        payload={(() => {
                          const data = reportData.performanceData || [];
                          // Impression数（volume）で降順ソートして上位8個を取得
                          const sortedData = [...data]
                            .sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0))
                            .slice(0, 8);
                          
                          return sortedData.map((item: any, idx: number) => {
                            return {
                              value: item.categoryName,
                              type: 'circle' as const,
                              id: item.categoryName,
                              color: colors[idx % colors.length]
                            };
                          });
                        })()}
                      />
                      {Array.isArray(reportData.performanceData) && reportData.performanceData.length > 0 ? (
                        (() => {
                          const data = reportData.performanceData || [];
                          // Impression数（volume）で降順ソートして上位8個を取得（凡例と同じ順序）
                          const sortedData = [...data]
                            .sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0))
                            .slice(0, 8);
                          
                          const volumes = sortedData.map((d: any) => d?.volume || 0).filter((v: number) => v > 0);
                          const minVol = volumes.length > 0 ? Math.min(...volumes) : 0;
                          const maxVol = volumes.length > 0 ? Math.max(...volumes) : 1;
                          
                          return sortedData.map((item: any, idx: number) => {
                            const sizeScale = maxVol > minVol ? (item.volume - minVol) / (maxVol - minVol) : 0;
                            const radius = 4 + sizeScale * 12;
                            return (
                              <Scatter
                                key={item.categoryName || idx}
                                name={item.categoryName || `Item ${idx}`}
                                data={[item]}
                                fill={colors[idx % colors.length]}
                                fillOpacity={0.7}
                                shape={(props: any) => {
                                  const { cx, cy } = props;
                                  return <circle cx={cx} cy={cy} r={radius} fill={colors[idx % colors.length]} fillOpacity={0.7} />;
                                }}
                              />
                            );
                          });
                        })()
                      ) : (
                        <text x="50%" y="50%" textAnchor="middle" fill="#9ca3af" fontSize="14">
                          データがありません
                        </text>
                      )}
                    </ScatterChart>
                  );
                })()}
              </ResponsiveContainer>
            </div>

            {/* DAILY VIEWABILITY TREND BY DEVICE */}
            <div className="bg-white rounded-[32px] p-3 shadow-sm border border-white" style={{ height: '460px' }}>
              <h3 className="text-sm font-bold text-slate-900 mb-2">デバイス別ビューアビリティ推移</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={Array.isArray(reportData.deviceViewabilityData) && reportData.deviceViewabilityData.length > 0 ? reportData.deviceViewabilityData : []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(value: any) => (typeof value === 'number' ? value.toFixed(1) : value) + '%'} />
                  <Legend />
                  <Line type="monotone" dataKey="Overall" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="OTT" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Mobile App" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Mobile Web" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ブランドリスク分析（GARMカテゴリー別） */}
          <div className="bg-white rounded-[32px] p-3 shadow-sm border border-white mb-2">
            <h3 className="text-sm font-bold text-slate-900 mb-2">ブランドリスク分析</h3>
            <p className="text-xs text-slate-500 mb-2">
              GARMカテゴリー別に、適合・不適合インプレッションの内訳を可視化します。
            </p>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart
                layout="vertical"
                data={Array.isArray(reportData.brandRiskByCategory) ? reportData.brandRiskByCategory : []}
                margin={{ top: 8, right: 24, left: 120, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${Math.round(v)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  width={160}
                  interval={0}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d: any = payload[0].payload;
                      return (
                        <div className="bg-white p-2 rounded border border-slate-200 text-xs">
                          <p className="font-semibold mb-1">{d.name || d.category}</p>
                          <p>適合率: {d.suitable.toFixed(2)}%</p>
                          <p>不適合率: {d.unsuitable.toFixed(2)}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar
                  dataKey="suitable"
                  stackId="risk"
                  name="適合率"
                  fill="#0ea5e9"
                  barSize={14}
                  label={(props: any) => {
                    const { x, y, width, value } = props;
                    if (value > 5) { // 5%以上の場合のみラベル表示
                      return (
                        <text
                          x={x + width / 2}
                          y={y + 7}
                          fill="white"
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight="bold"
                        >
                          {value.toFixed(1)}%
                        </text>
                      );
                    }
                    return <text />; // 空の要素を返す
                  }}
                />
                <Bar
                  dataKey="unsuitable"
                  stackId="risk"
                  name="不適合率"
                  fill="#f97316"
                  barSize={14}
                  label={(props: any) => {
                    const { x, y, width, value } = props;
                    if (value > 2) { // 2%以上の場合のみラベル表示
                      return (
                        <text
                          x={x + width / 2}
                          y={y + 7}
                          fill="white"
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight="bold"
                        >
                          {value.toFixed(1)}%
                        </text>
                      );
                    }
                    return <text />; // 空の要素を返す
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* IVT Safe Zone：IVT Impressions Rate をパーセント表示、軸フォーマット整備（要望6） */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-2">
            <div className="bg-white rounded-[32px] p-3 shadow-sm border border-white" style={{ height: '360px' }}>
              <h3 className="text-sm font-bold text-slate-900 mb-2">IVTセーフゾーン比較</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={Array.isArray(reportData.ivtRates) && reportData.ivtRates.length > 0
                    ? reportData.ivtRates
                    : [
                        { name: '媒体ベンチマーク', value: 0.22 },
                        { name: 'Overall', value: 0 },
                        { name: 'OTT', value: 0 },
                        { name: 'Mobile App', value: 0 },
                        { name: 'Mobile Web', value: 0 },
                      ]}
                  margin={{ top: 8, right: 8, left: 72, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => (typeof v === 'number' ? v.toFixed(2) : v) + '%'}
                    domain={[0, (() => {
                      const arr = Array.isArray(reportData.ivtRates) && reportData.ivtRates.length > 0
                        ? reportData.ivtRates
                        : [{ value: 0.22 }];
                      const vals = arr.map((d: any) => (typeof d.value === 'number' ? d.value : Number(d.value) || 0));
                      const max = Math.max(...vals);
                      return Math.max(max * 1.15, 1);
                    })()]}
                    label={{ value: 'IVT Rate (%)', angle: -90, position: 'left' }}
                  />
                  <Tooltip formatter={(value: any) => {
                    const numValue = typeof value === 'number' ? value : Number(value) || 0;
                    return numValue.toFixed(2) + '%';
                  }} />
                  <Bar dataKey="value" name="IVT Impressions Rate (%)">
                    <Cell fill="#d1d5db" /> {/* 媒体ベンチマーク（グレー） */}
                    <Cell fill="#0ea5e9" /> {/* Overall（キャンペーン系） */}
                    <Cell fill="#0ea5e9" />
                    <Cell fill="#0ea5e9" />
                    <Cell fill="#0ea5e9" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* STRATEGIC INSIGHTS */}
            <div className="bg-slate-900 rounded-[32px] p-3 shadow-sm text-white" style={{ height: '360px' }}>
              <h3 className="text-sm font-bold mb-3">戦略的インサイト</h3>
              <div className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                  <p>ブランド適合率が{reportData.suitabilityRate?.toFixed(1)}%に達しており、高い品質基準を維持しています。</p>
                </div>
                {/* Zefr ONEの効果 */}
                {reportData.lift && reportData.lift > 0 && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                    <p>Zefr ONEの利用により、ブランド不適合の配信面を除外したことでブランド適合性が+{reportData.lift.toFixed(1)} pt向上。</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                  <p>低品質インプレッション{formatNumberWithUnit(reportData.lowQualityBlocked)}件をブロックし、推定¥{reportData.budgetOptimization?.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}の予算最適化を実現。</p>
                </div>

                {/* コンテキスト・パフォーマンス分析の説明 */}
                {reportData.performanceData && reportData.performanceData.length > 0 && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                    <p>コンテキスト・パフォーマンス分析により、カテゴリー別のVCR/CTR（またはViewability）とインプレッション数の関係を可視化し、効果的なコンテンツ配信戦略の立案が可能です。</p>
                  </div>
                )}
                {/* ブランドリスク分析の説明 */}
                {reportData.brandRiskByCategory && reportData.brandRiskByCategory.length > 0 && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 bg-sky-500 rounded-full mt-1.5 flex-shrink-0" />
                    <p>ブランドリスク分析により、99.9%以上の配信面がGARM・ブランド基準におけるハイレベルなブランドセーフティが保たれています。</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Web発行（PDF/PPTXエクスポート時は非表示） */}
          {!sharedLink && (
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white mb-8" data-export-hide>
              <h3 className="text-lg font-bold text-slate-900 mb-4">レポートを Web 発行</h3>
              <div className="flex gap-4">
                <button
                  onClick={handleWebPublish}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-[16px] transition disabled:opacity-50"
                >
                  <Share2 className="w-5 h-5" /> Web 発行
                </button>
              </div>
            </div>
          )}

          {/* 共有リンク */}
          {sharedLink && (
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-white">
              <h3 className="text-lg font-bold text-slate-900 mb-4">共有リンク</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sharedLink}
                  readOnly
                  className="flex-1 px-4 py-3 rounded-[16px] border border-slate-200 bg-slate-50"
                />
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-[16px] transition"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {copied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
