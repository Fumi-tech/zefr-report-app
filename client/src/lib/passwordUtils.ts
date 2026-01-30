import CryptoJS from 'crypto-js';

const SECRET_KEY = 'zefr-insight-report-secret-key';

/**
 * パスワードをハッシュ化
 */
export const hashPassword = (password: string): string => {
  return CryptoJS.SHA256(password + SECRET_KEY).toString();
};

/**
 * パスワードを検証
 */
export const verifyPassword = (password: string, hash: string): boolean => {
  return hashPassword(password) === hash;
};

/**
 * ランダムなレポートIDを生成
 */
export const generateReportId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
};
