# Zefr インサイトレポート TODO

## 完了済み
- [x] プロジェクトをweb-db-userにアップグレード
- [x] 基本的なダッシュボードUI実装
- [x] CSV/XLSX/XLSファイルアップロード機能
- [x] 7つのビジュアライゼーションコンポーネント実装

## 進行中
（なし）

## 最近完了
- [x] TypeScriptエラーを修正（ZefrInsightReportFinal6.tsx）
- [x] データベーススキーマ設計（reportsテーブル追加）
- [x] tRPCルーター実装（report.save, report.get, report.list）
- [x] S3ファイルストレージ統合（CSVファイル保存）
- [x] パスワード保護機能実装（ハッシュ化と検証）
- [x] 共有リンク生成機能（/shared/:id）
- [x] 共有リンクアクセス画面実装（パスワード入力）
- [x] PDF/PPTX出力機能の動作確認
- [x] vitestテスト作成（report.test.ts）
- [x] エンドツーエンドテスト（全7テスト成功）

## 新規バグ修正
- [x] CSVファイルのパース処理を修正（Performance、Risk、Viewデータが反映されない問題）
  - 区切り文字の自動検出（カンマ、タブ、セミコロン）
  - 柔軟なヘッダー検出ロジック
  - キーワードベースのヘッダーマッピング
  - 詳細なデバッグログ追加
- [ ] データ反映の検証とテスト（ユーザーによる確認待ち）
- [x] React DOM警告を修正（Scatter shape propを関数コンポーネントに変更）

## バージョン682bb801への回帰修正
- [ ] DAILY QUALITY & VOLUME TRENDのBrand Suitability%とViewabilityを修正
- [ ] ブランド適合率の計算ロジックを修正（100%はおかしい）
- [ ] PERFORMANCE BY CONTEXTの表示スケール調整
- [ ] DAILY VIEWABILITY TREND BY DEVICEの数字を修正
- [ ] IVT "SAFE ZONE" COMPARISONのデバイス別数字を修正
- [ ] CSVファイルの数字を正しく反映
- [ ] PDF出力機能の修正
- [ ] PPTX出力機能の修正
