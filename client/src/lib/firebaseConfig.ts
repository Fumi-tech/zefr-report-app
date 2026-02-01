import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

// Firebase App Checkのインポート（オプション）
// firebase/app-check が利用可能な場合のみインポート
let appCheckInitialized = false;

// Firebase設定（環境変数から取得）
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoKey',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'zefr-demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'zefr-demo',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'zefr-demo.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef123456',
};

// Firebase初期化
const app = initializeApp(firebaseConfig);

// Firebase App Check初期化（セキュリティ強化）
// 開発環境ではデバッグトークンを使用、本番環境ではreCAPTCHA v3を使用
// App Check の初期化 + 初回トークン取得までを待てるように Promise を公開する。
const isBrowser = typeof (globalThis as any).window !== 'undefined';
export const appCheckReady: Promise<boolean> = (async () => {
  if (!isBrowser) return false;
  try {
    const appCheckModule = await import('firebase/app-check');
    const { initializeAppCheck, ReCaptchaV3Provider, getToken } = appCheckModule;

    // 開発環境ではデバッグトークンを設定（initialize前が推奨）
    if (import.meta.env.DEV) {
      // @ts-ignore - 開発環境でのみ使用
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    }

    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(
        import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI' // デフォルトはテストキー
      ),
      isTokenAutoRefreshEnabled: true,
    });

    // 初回トークンを取得しておく（Firestoreの初回通信にヘッダを乗せるため）
    try {
      await getToken(appCheck, true);
    } catch (tokenErr) {
      console.warn('[Firebase] App Check token prefetch failed:', tokenErr);
    }

    appCheckInitialized = true;
    console.log('[Firebase] App Check initialized successfully');
    return true;
  } catch (error) {
    console.warn('[Firebase] App Check initialization failed:', error);
    console.warn('[Firebase] Firestore writes will be blocked until App Check is properly configured.');
    return false;
  }
})();

let dbInstance: Firestore | null = null;
let dbInitPromise: Promise<Firestore> | null = null;

/**
 * Firestore インスタンスを遅延生成する。
 * App Check 初期化（初回トークン取得）後に生成することで、
 * 初回の Listen/channel に X-Firebase-AppCheck を載せる。
 */
export async function getDb(): Promise<Firestore> {
  if (dbInstance) return dbInstance;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      // App Check の初期化が終わるまで待つ（成功/失敗いずれでも resolve）
      await appCheckReady;

      const db = getFirestore(app);

      // 開発環境ではエミュレーターを使用（オプション）
      if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true') {
        try {
          connectFirestoreEmulator(db, 'localhost', 8080);
        } catch (e) {
          // エミュレーターが既に接続されている場合はスキップ
        }
      }

      dbInstance = db;
      return db;
    })();
  }
  return dbInitPromise;
}

export default app;
