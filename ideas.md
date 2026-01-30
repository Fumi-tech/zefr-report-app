# Zefr インサイトレポート - デザイン戦略

## 選定デザイン: モダンプロフェッショナル・データドリブン

### Design Movement
**ネオ・ミニマリズム × データビジュアライゼーション**
- 洗練されたビジネスアプリケーションの美学
- 情報密度と視認性のバランス
- Zefr Light Blue (#0ea5e9)を中心とした信頼感のあるカラーパレット

### Core Principles
1. **情報階層の明確性**: KPIカード、チャート、インサイトが直感的に理解できる配置
2. **プレミアム感**: 細かいディテール（シャドウ、スペーシング、タイポグラフィ）で高級感を演出
3. **ユーザーフロー重視**: アップロード→パスワード設定→ダッシュボード→共有という流れが自然
4. **データ信頼性**: 数字と視覚化が一貫性を持つ

### Color Philosophy
- **Primary**: Zefr Light Blue (#0ea5e9) - 信頼、プロフェッショナリズム
- **Accent**: Emerald Green (#10b981) - ポジティブな成果、成長
- **Warning**: Amber (#f59e0b) - 注意が必要な指標
- **Background**: Clean White (#ffffff) + Subtle Gray (#f9fafb) - 読みやすさ
- **Text**: Dark Slate (#1e293b) - 高いコントラスト

### Layout Paradigm
- **非対称グリッド**: ダッシュボードは左側に主要KPI、右側にチャートという非対称配置
- **カード中心**: 各セクションをカードで分割し、視覚的な呼吸感を確保
- **ホワイトスペース活用**: 要素間に十分な余白を確保してプレミアム感を演出

### Signature Elements
1. **Zefr Blue Accent Line**: 各セクションの上部に細いブルーラインを配置
2. **グラデーション背景**: サブトルなグラデーション（白→薄いブルー）で深さを表現
3. **丸みのあるカード**: border-radius: 12px で親しみやすさと洗練さの両立

### Interaction Philosophy
- **スムーズなトランジション**: ページ遷移、モーダル表示は300ms以上のeasing
- **ホバーエフェクト**: カード上のホバーで微妙なシャドウ拡大
- **フォーカス状態**: キーボード操作時の明確なフォーカスリング

### Animation
- **ページロード**: Fade-in + 軽いスライドアップ（200ms）
- **チャート描画**: 遅延ロードで段階的に表示（500ms）
- **モーダル**: Scale-in from center（250ms cubic-bezier(0.16, 1, 0.3, 1)）
- **ツールチップ**: Fade-in + 微妙なスケール（150ms）

### Typography System
- **Display**: 'Noto Sans JP' Bold (28-32px) - ページタイトル、KPI値
- **Heading**: 'Noto Sans JP' SemiBold (18-20px) - セクションタイトル
- **Body**: 'Noto Sans JP' Regular (14-16px) - 本文、ラベル
- **Mono**: 'Courier New' Regular (12-14px) - 数値、コード

## 実装ガイドライン

### CSS変数の設定
```css
--zefr-blue: #0ea5e9
--zefr-blue-dark: #0284c7
--zefr-blue-light: #06b6d4
--success-green: #10b981
--warning-amber: #f59e0b
--text-primary: #1e293b
--text-secondary: #64748b
--bg-light: #f9fafb
--bg-white: #ffffff
```

### コンポーネント設計
- KPIカード: 背景は白、左側に色付きボーダー
- チャートコンテナ: 薄いグレー背景、ボーダーなし、シャドウで浮遊感
- ボタン: プライマリはZefr Blue、セカンダリはアウトライン
- インプット: ボーダーはライトグレー、フォーカス時にZefr Blue

### 画像・ビジュアル
- ダッシュボード背景: サブトルなグラデーション（白→薄いブルー）
- アイコン: Lucide-react で統一、サイズは24px標準
- チャート色: Zefr Blue系のグラデーション

