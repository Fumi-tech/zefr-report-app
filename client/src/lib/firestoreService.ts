import {
  setDoc,
  getDoc,
  doc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ProcessedData } from './csvProcessor';
import { hashPassword } from './passwordUtils';

export interface ReportConfig {
  reportId: string;
  cpm: number;
  passwordHash: string;
  createdAt: number;
  expiresAt?: number;
}

export interface StoredReport {
  config: ReportConfig;
  processedData: ProcessedData;
}

/**
 * レポートをFirestoreに保存
 * 生CSVは含めず、軽量なJSON（集計済みデータのみ）を送信する。
 * App Checkで保護された書き込みのみ許可される。
 */
export const saveReport = async (
  reportId: string,
  config: ReportConfig,
  processedData: ProcessedData
): Promise<void> => {
  try {
    const reportRef = doc(db, 'reports', reportId);
    
    await setDoc(reportRef, {
      config,
      processedData: {
        accountName: processedData.accountName,
        reportingPeriod: processedData.reportingPeriod,
        kpis: processedData.kpis,
        insights: processedData.insights,
        loadedReports: processedData.loadedReports,
        // データ量を削減するため、詳細データは別途保存
        dataCount: {
          performance: processedData.performance.length,
          suitability: processedData.suitability.length,
          viewability: processedData.viewability.length,
          exclusion: processedData.exclusion.length,
        },
        // MVP: 追加フィールドを保存（データ損失を防ぐため）
        deviceViewabilityData: processedData.deviceViewabilityData || [],
        totalImpressions: processedData.totalImpressions,
        estimatedCPM: processedData.estimatedCPM,
        brandRiskByCategory: processedData.brandRiskByCategory || [],
        ivtRates: processedData.ivtRates || [],
      },
      // 詳細データは別コレクションに保存
      performance: processedData.performance,
      suitability: processedData.suitability,
      viewability: processedData.viewability,
      exclusion: processedData.exclusion,
    });
  } catch (error: any) {
    console.error('レポート保存エラー:', error);
    
    // Firestore Rules違反の場合のエラーメッセージ（原因候補を明確に提示）
    if (error?.code === 'permission-denied') {
      const errorMessage = [
        'レポートの保存が拒否されました。',
        '考えられる原因:',
        '1. App Checkが有効でない（VITE_RECAPTCHA_SITE_KEYの設定、Firebase ConsoleでのApp Check有効化を確認）',
        '2. Firestore Security Rulesが正しくデプロイされていない（firebase deploy --only firestore:rulesを実行）',
        '3. 環境変数が正しく設定されていない（.env.localのVITE_FIREBASE_*を確認）',
      ].join('\n');
      console.error('[Firestore] Permission denied details:', error);
      throw new Error(errorMessage);
    }
    
    throw new Error('レポートの保存に失敗しました: ' + (error?.message || String(error)));
  }
};

/**
 * レポートをFirestoreから取得
 */
export const getReport = async (reportId: string): Promise<StoredReport | null> => {
  try {
    const reportRef = doc(db, 'reports', reportId);
    const reportSnap = await getDoc(reportRef);

    if (!reportSnap.exists()) {
      return null;
    }

    const data = reportSnap.data();
    
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
        // MVP: 追加フィールドを復元（古いデータとの互換性: なければ空配列）
        deviceViewabilityData: Array.isArray(data.processedData?.deviceViewabilityData)
          ? data.processedData.deviceViewabilityData
          : [],
        totalImpressions: data.processedData?.totalImpressions ?? undefined,
        estimatedCPM: data.processedData?.estimatedCPM ?? undefined,
        ivtRates: Array.isArray(data.processedData?.ivtRates)
          ? data.processedData.ivtRates
          : [],
        brandRiskByCategory: Array.isArray(data.processedData?.brandRiskByCategory)
          ? data.processedData.brandRiskByCategory
          : [],
      } as ProcessedData,
    };
  } catch (error: any) {
    console.error('レポート取得エラー:', error);
    
    // Firestore Rules違反の場合のエラーメッセージ（原因候補を明確に提示）
    if (error?.code === 'permission-denied') {
      const errorMessage = [
        'レポートの取得が拒否されました。',
        '考えられる原因:',
        '1. レポートが存在しない（reportIdを確認）',
        '2. Firestore Security Rulesが正しくデプロイされていない（firebase deploy --only firestore:rulesを実行）',
        '3. 環境変数が正しく設定されていない（.env.localのVITE_FIREBASE_*を確認）',
      ].join('\n');
      console.error('[Firestore] Permission denied details:', error);
      throw new Error(errorMessage);
    }
    
    throw new Error('レポートの取得に失敗しました: ' + (error?.message || String(error)));
  }
};

/**
 * パスワードを検証してレポートを取得
 */
export const getReportWithPassword = async (
  reportId: string,
  password: string
): Promise<ProcessedData | null> => {
  try {
    const report = await getReport(reportId);
    
    if (!report) {
      return null;
    }

    const passwordHash = hashPassword(password);
    
    if (report.config.passwordHash !== passwordHash) {
      throw new Error('パスワードが正しくありません');
    }

    return report.processedData;
  } catch (error) {
    console.error('パスワード検証エラー:', error);
    throw error;
  }
};
