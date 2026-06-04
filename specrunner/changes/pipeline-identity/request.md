# JobState に pipeline 同一性（pipelineId）を記録する

## Meta

- **type**: spec-change
- **slug**: pipeline-identity
- **base-branch**: main
- **adr**: false

## 背景

pipeline 定義（工程の並び・遷移・繰り返し組）は現在ソースに固定で 1 種類しか持てない。`JobState` は「どの pipeline 定義で実行したか」を記録していないため、将来複数の pipeline 定義を扱えるようにすると、再開時にどの定義で再構築すべきかを復元できない。

その土台として、ジョブと pipeline 定義の対応を `JobState` に持たせる。本 request はその最小の一歩で、フィールドの追加と起動時の記録までを行い、挙動は変えない。

## 要件

1. `JobState` に optional な `pipelineId` フィールドを追加する。
2. ジョブ起動時に、現行の pipeline 識別子（`"standard"`）を `pipelineId` に記録する。
3. `pipelineId` を持たない既存 state ファイルを読み込み時に壊さず、欠落時の解決値を定義する（後方互換）。
4. pipeline 実行・再開・画面出力の挙動を変えない。

## スコープ外

- `pipelineId` に基づく pipeline 定義の選択（registry lookup）。
- 再開の役割導出ロジックおよび pipeline エンジンの変更。
- job status FSM（`lifecycle`）の変更。

## 受け入れ基準

- [ ] 新規ジョブの state に `pipelineId` が記録される。
- [ ] `pipelineId` を持たない既存 state ファイルが従来通り読め、欠落時は `"standard"` に解決される。
- [ ] 画面出力スナップショットと再開互換テストが green（挙動不変）。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

- `pipelineId` は後方互換の optional フィールドとし、欠落時は `"standard"` 相当に解決する。可逆な変更。
- 本 request の範囲は「フィールド追加 + 起動時記録」に限定する。`pipelineId` に基づく選択は registry 導入を前提とするため含めない。
- job status FSM（`VALID_TRANSITIONS` / `lifecycle`）は pipeline 非依存のため変更しない。
- 挙動不変であることの回帰検証は、画面出力のバイト単位スナップショットと再開互換テストに委ねる。
