# 依存関係の衝突メモ（暫定対応と将来の整理用）

## ERESOLVE エラーの根本原因

**衝突しているパッケージ:** `@builder.io/vite-plugin-jsx-loc`（devDependencies）

**内容:** 本プロジェクトは `vite@^7.1.7` を使用しているが、`@builder.io/vite-plugin-jsx-loc@^0.1.1` の peerDependencies が Vite 7 をサポートしておらず、npm の厳密な peer 解決（ERESOLVE）でインストールが失敗する。

- 該当プラグイン: `@builder.io/vite-plugin-jsx-loc`
- 衝突相手: `vite@7.x`
- 想定原因: プラグイン側の peer 指定が `vite@5` や `vite@6` までに限定されているため

## 暫定対応（現状）

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` により peer の不一致を無視し、インストールを完了させる。

`.npmrc` で恒久的に有効にする場合は、ルートに以下を追加する:

```ini
legacy-peer-deps=true
```

## 将来の安定化の方向（pnpm / 依存整理）

1. **pnpm に統一する**  
   - 本リポジトリは `packageManager: "pnpm@10.4.1"` を指定している。pnpm は peer の扱いが異なり、この種の衝突を回避できる場合がある。

2. **該当プラグインの見直し**  
   - `@builder.io/vite-plugin-jsx-loc` が Vite 7 対応するまで待つ、または  
   - 同等の別プラグイン・自前実装に差し替える。  
   - **使用箇所:** `vite.config.ts` の 1 行目で `import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc"`、157 行目で `jsxLocPlugin()` として使用。差し替え・削除時はここを修正すること。

3. **Vite を一時的に下げる（非推奨）**  
   - 他依存が許す範囲で `vite@6` に合わせる選択肢もあるが、他パッケージが Vite 7 前提になっている場合があるため、最終手段とする。

---

**このメモの目的:** 暫定で `--legacy-peer-deps` で進めつつ、後で pnpm や依存整理に戻るときに「何が原因か」をすぐ思い出せるようにする。
