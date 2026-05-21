# package-lock.json を削除して bun.lock に統一する

## Meta

- **type**: refactoring
- **slug**: package-lock-cleanup
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

spec-runner のランタイムは Bun。`package.json` の scripts も `bun run ...` を前提にしている（`tsc` / `vitest` を直接呼ぶ形）。

しかし repo に `package-lock.json` と `bun.lock` が共存している。npm install で生成された `package-lock.json` は実運用で使われないにもかかわらず tracked されており、

- `git status` で常時 `D package-lock.json` が出る状態（誰かが local で削除済み）
- メンテナンスが二重化（npm が動かない依存があると lockfile が壊れる）
- 新規 contributor が「npm を使うのか bun を使うのか」迷う

5/11 session handoff から残留している小タスク（issue #212）。

## 目的

`package-lock.json` を repo から削除し、`bun.lock` に単一化する。`.gitignore` で再生成を防ぎ、新規 contributor が迷わない状態にする。

## 要件

### lockfile の整理

1. `package-lock.json` を git から削除する（`git rm package-lock.json`）
2. `bun.lock` が commit されていることを確認する（既に tracked なら no-op）

### .gitignore の更新

3. `.gitignore` に `package-lock.json` を追加する（npm install を誤って実行しても tracked にならないように）
4. `npm-debug.log*` / `yarn.lock` などもまとめて追加するかは判断（YAGNI、現状の必要箇所のみで OK）

### CI / docs 更新

5. CI (`.github/workflows/`) で `npm` を呼ぶ箇所があれば `bun` に置き換える
6. README / CONTRIBUTING の install 手順が `npm install` を指している箇所を `bun install` に修正する（あれば）

### package.json 整合

7. `package.json` の `engines` フィールドに `bun` を明示する（Bun 1.x 以上、適切なバージョン）
8. `engines.npm` 等の npm 関連 field が残っていれば削除する

## スコープ外

- 依存パッケージのバージョン更新
- npm scripts の cleanup（別途）
- bun.lock の commit / lockfile 仕様の議論

## 受け入れ基準

- [ ] `package-lock.json` が repo から削除されている
- [ ] `.gitignore` に `package-lock.json` が追加されている
- [ ] `bun install` で依存が再現可能
- [ ] CI が bun ベースで動く（npm 依存が残っていない）
- [ ] `package.json` の `engines` に `bun` が明示されている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **package-lock.json を完全削除し .gitignore で防御**。npm install を local で実行した場合に再 commit されないよう gitignore で保護する

- **bun.lock を単一の真偽源**とする。spec-runner は Bun ランタイムで動くため、依存解決も bun に揃える。npm との混用は問題の元
