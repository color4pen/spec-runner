# CLI エントリポイントの switch/case をコマンドレジストリに置き換える

## Meta

- **type**: refactoring
- **slug**: refactor-cli-entrypoint
- **base-branch**: main

## 背景

`bin/specrunner.ts` が 338 行の switch/case でコマンドをディスパッチしている。各コマンドのフラグパース（`--flag=value`、unknown flag 検出）が重複しており、新コマンド追加のたびに肥大化する（architect レビュー Finding #11, MEDIUM）。

各コマンドハンドラは既に個別ファイル（`src/cli/*.ts`）に分離されているので、エントリポイントはディスパッチのみに縮小可能。

## 要件

1. コマンドごとの引数定義（フラグ名、型、デフォルト値）をデータとして宣言する構造を導入する

2. フラグパースの共通ロジック（`--flag=value` 分解、`--flag value` 分解、unknown flag 検出）を 1 箇所に集約する

3. `bin/specrunner.ts` をコマンド名のディスパッチのみに縮小する。目標は 100 行以下

4. 外部の arg parser ライブラリは導入しない（依存を増やさない）。自前の軽量パーサーで実装する

5. 既存の全コマンド（run, resume, finish, init, login, doctor, ps, rm, request）の引数パースが既存と同一の動作をすること

## スコープ外

- 新コマンドの追加
- コマンドハンドラ（`src/cli/*.ts`）の内部ロジック変更
- ヘルプメッセージの改善

## 受け入れ基準

- [ ] `bin/specrunner.ts` が 100 行以下に縮小している
- [ ] フラグパースの重複コードがない
- [ ] 全既存コマンドが同一の引数で同一の動作をする
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/refactor-cli-entrypoint.md` by `merged-to-archive-consolidation`.
