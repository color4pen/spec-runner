# openspec CLI 依存を廃止する

## Meta

- **type**: spec-change
- **slug**: remove-openspec-cli-dependency
- **base-branch**: main
- **depends-on**: specrunner/requests/merged/centralize-change-path

## 背景

R1（centralize-change-path, PR #189）で `openspec/changes/<slug>/` のパスリテラルを `src/util/paths.ts` の `changeFolderPath()` に集約した。本 request はその上で openspec CLI への依存を廃止し、ディレクトリ構造を `specrunner/changes/` に統一する。

### 廃止の根拠（分析済み）

- **proposal.md は冗長**: 8 件の横断分析で request.md の要約に過ぎず独自情報ゼロ。spec-review が proposal を根拠に指摘したケースもゼロ
- **baseline spec（openspec/specs/ 47本）は消費者不在**: pipeline のどのステップも構造的に参照していない
- **openspec のアーティファクトグラフと SpecRunner の transition table は機能重複**: どちらも工程の実行順序を制御している
- **openspec validate (--strict) に過去バグあり**: 外部依存としてのリスク
- **propose の openspec CLI ループで 5-10 turns を消費**: cost と latency の無駄

## 要件

### 1. パス定数の切り替え

`src/util/paths.ts` の `CHANGES_DIR` を `openspec/changes` → `specrunner/changes` に変更する。`SPECS_DIR` は廃止（R3 で openspec/specs/ 自体を削除するため、ここでは参照を noop 化するだけ）。

### 2. propose prompt の書き換え

`src/prompts/propose-system.ts` から openspec CLI ワークフロー（new change → status → instructions ループ → validate）を削除し、artifact checklist + テンプレート方式に置き換える。

生成すべき artifact:
- `specrunner/changes/<slug>/design.md` — 技術設計
- `specrunner/changes/<slug>/tasks.md` — 実装タスク（checkbox 形式）
- `specrunner/changes/<slug>/specs/<capability>/spec.md` — delta spec（該当する場合）

proposal.md は生成しない。request.md は CLI が配置済みのため agent は編集しない。

Delta Spec Format Rules（既存の L93-146）はそのまま維持する。openspec CLI の validate に依存せず、prompt 内の self-review checklist と spec-review の二重防御で品質を担保する。

### 3. finish コマンドの簡素化

- `src/core/finish/archive-openspec.ts` を削除。orchestrator.ts の Phase 1 から `archiveOpenspec()` 呼び出しを除去
- `src/core/finish/preflight.ts` の check 6（openspec validate）を削除。check 7 の binary list から `openspec` を除去
- finish の Phase 1 は「change folder の移動」のみにする（`specrunner/changes/<slug>/` → `specrunner/changes/archive/<slug>/`、または既存の move-requests-dir.ts を活用）

### 4. doctor チェックの更新

- `src/core/doctor/checks/runtime/openspec.ts`（openspec binary check）を削除
- `src/core/doctor/checks/repo/openspec-project-md.ts` は維持するが `required: false` に変更

### 5. dynamic-context の更新

- `collectSpecsList()` を削除または空配列固定にする（baseline spec 廃止）
- `collectChangesList()` のパスは paths.ts の `changesDirRel()` 経由で自動的に切り替わる

### 6. 全 prompt から proposal.md 参照を除去

- `spec-review-system.ts`, `test-case-gen-system.ts`, `code-review-system.ts`, `implementer-system.ts` 等から proposal.md への参照を削除
- proposal.md を読む代わりに request.md を読むよう指示を更新

### 7. request.md の配置変更

pipeline 起動時に `specrunner/requests/active/<slug>/request.md` を `specrunner/changes/<slug>/request.md` にコピーする。change folder 内で request.md が他の artifact と同居する構造にする。

## スコープ外

- openspec/ ディレクトリの物理削除（R3 のスコープ）
- 既存の openspec/changes/ 配下のファイル移行（R3 のスコープ）
- baseline spec の削除（R3 のスコープ）
- delta spec の自前 validator 実装（品質低下が観測された場合に別途検討）

## 受け入れ基準

- [ ] `openspec` コマンドがコードの実行パスから呼ばれない（grep で確認）
- [ ] propose が openspec CLI を使わずに design.md + tasks.md + specs/ を生成する prompt になっている
- [ ] proposal.md への参照がプロンプト内に残っていない
- [ ] finish が openspec archive を呼ばない
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: [test-case-generator]

## architect 評価済みの設計判断

- delta spec の validate は prompt + spec-review の二重防御で担保。自前 validator は YAGNI
- propose の maxTurns を 20 → 15 に削減可能（CLI tool call 不要化に伴う）
- spec フォーマット（Requirement + Scenario / ADDED / MODIFIED / REMOVED）は維持。ツールチェーンのみ除去
- openspec/project.md は据え置き（移動しない）
