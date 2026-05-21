# Design: package-lock-cleanup

## 概要

`package-lock.json` を repo から削除し、`bun.lock` を単一の lockfile として確立する。`.gitignore` で再生成を防止し、`package.json` に `engines` を追加して Bun ランタイムを明示する。

## 現状分析

| 項目 | 状態 |
|------|------|
| `package-lock.json` | tracked (49KB)。PR #80 以降更新なし。実運用で未使用 |
| `bun.lock` | tracked (43KB)。実際の依存解決に使用中 |
| `.gitignore` | `pnpm-lock.yaml` は ignore 済み。`package-lock.json` は未 ignore |
| `package.json` `engines` | フィールド自体が存在しない |
| CI workflows | `.github/workflows/` が存在しない → npm 呼び出し箇所なし |
| README / CONTRIBUTING | install 手順の記載なし → 修正不要 |
| `docs/` 内の `npm install` 言及 | `docs/managed-agents/` と `docs/openspec-guide.md` に存在するが、これらは Managed Agents 環境での `npm install -g @fission-ai/openspec` の話であり、SpecRunner 自体の依存 install とは無関係。変更不要 |

## 設計判断

### 1. `package-lock.json` の削除と `.gitignore` 追加

`git rm package-lock.json` で tracking を解除し、`.gitignore` に追加して再 commit を防止する。

既存の `.gitignore` に `pnpm-lock.yaml` の ignore がある箇所の近くに `package-lock.json` を追加する（同カテゴリのグルーピング）。

`yarn.lock` は現在 tracked でも `.gitignore` にも入っていないが、`pnpm-lock.yaml` と同列で追加しておく（defensive、YAGNI 許容範囲）。

### 2. `package.json` への `engines` 追加

```json
"engines": {
  "bun": ">=1.0.0"
}
```

npm 関連の `engines` フィールドは現在存在しないため削除作業は不要。

Bun のバージョン下限は `1.0.0` とする。spec-runner が使う機能（ES modules、TypeScript 直接実行、`bun run`）は 1.0 GA で安定しているため、過度に厳しい制約は不要。

### 3. スコープ外の確認

- CI workflows: ディレクトリ自体が存在しないため変更なし
- README / CONTRIBUTING: install 手順の記載がないため変更なし
- `docs/` 内の `npm install` 言及: Managed Agents 環境での openspec CLI install の話であり、本 change のスコープ外

## 影響範囲

変更対象ファイル:
1. `package-lock.json` — 削除
2. `.gitignore` — `package-lock.json` と `yarn.lock` を追加
3. `package.json` — `engines.bun` を追加

影響なし:
- `bun.lock` — 既に tracked。変更不要
- `src/` — コード変更なし
- `docs/` — 変更不要（上記分析参照）
- CI — 存在しない

## 検証方法

- `git ls-files package-lock.json` が空であること
- `.gitignore` に `package-lock.json` が含まれること
- `bun install` が成功すること
- `bun run typecheck && bun run test` が green であること
