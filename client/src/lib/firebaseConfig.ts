import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

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
export const db = getFirestore(app);

// Firebase App Check初期化（セキュリティ強化）
// 開発環境ではデバッグトークンを使用、本番環境ではreCAPTCHA v3を使用
if (typeof window !== 'undefined') {
  // 動的インポートでApp Checkを読み込む（ESM対応）
  import('firebase/app-check')
    .then((appCheckModule) => {
      const { initializeAppCheck, ReCaptchaV3Provider } = appCheckModule;
      
      try {
        const appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(
            import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI' // デフォルトはテストキー
          ),
          isTokenAutoRefreshEnabled: true,
        });
        
        // 開発環境ではデバッグトークンを設定（コンソールに表示される）
        if (import.meta.env.DEV) {
          // @ts-ignore - 開発環境でのみ使用
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
        }
        
        appCheckInitialized = true;
        console.log('[Firebase] App Check initialized successfully');
      } catch (error) {
        console.warn('[Firebase] App Check initialization failed:', error);
        console.warn('[Firebase] Firestore writes will be blocked until App Check is properly configured.');
      }
    })
    .catch((error) => {
      // App Checkモジュールが存在しない場合や読み込みに失敗した場合
      console.warn('[Firebase] App Check module not available:', error);
      console.warn('[Firebase] Firestore writes will be blocked until App Check is properly configured.');
    });
}

// 開発環境ではエミュレーターを使用（オプション）
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true') {
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
  } catch (e) {
    // エミュレーターが既に接続されている場合はスキップ
  }
}

export default app;
