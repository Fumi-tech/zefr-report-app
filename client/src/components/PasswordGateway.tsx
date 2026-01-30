import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface PasswordGatewayProps {
  onSubmit: (password: string) => Promise<void>;
  isLoading: boolean;
}

/**
 * PasswordGateway コンポーネント
 * 
 * デザイン: モダンプロフェッショナル
 * - パスワード入力フォーム
 * - パスワード表示/非表示トグル
 * - プレミアムなカード設計
 */
export default function PasswordGateway({
  onSubmit,
  isLoading,
}: PasswordGatewayProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(password);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md p-8 bg-white border-sky-200 shadow-lg">
        {/* ロゴ */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Lock className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* タイトル */}
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">
          パスワード入力
        </h2>
        <p className="text-center text-slate-600 mb-8">
          このレポートを閲覧するにはパスワードを入力してください
        </p>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* パスワード入力フィールド */}
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              disabled={isLoading}
              className="pr-12 border-sky-200 focus:border-cyan-500 focus:ring-cyan-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
              disabled={isLoading}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* 送信ボタン */}
          <Button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3 rounded-lg transition-all duration-200"
          >
            {isLoading ? 'アクセス中...' : 'レポートを表示'}
          </Button>
        </form>

        {/* ヒント */}
        <p className="text-xs text-slate-500 text-center mt-6">
          パスワードを忘れた場合は、レポート作成者にお問い合わせください
        </p>
      </Card>
    </div>
  );
}
