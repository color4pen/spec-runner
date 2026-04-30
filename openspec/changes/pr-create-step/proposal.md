## Why

PR #36 + #38 の累積で SpecRunner pipeline は `propose → spec-review (loop) → implementer → verification (loop) → code-review (loop) → end` まで自走可能になった。残るは「approved した branch を GitHub に PR として上げる」最後の 1 ピース。現状は code-review approved 後に pipeline が `end` に至り、ユーザーが手動で `gh pr create` を打つ必要がある。本 request で `pr-create` step を追加し transition を `code-review → approved → pr-create → end` に書き換えることで、SpecRunner が要件 (request.md) → PR 作成まで完全自走する self-host 完成形に到達する。

## What Changes

- **新規 step `pr-create` の追加** (`kind: "cli"`): branch を origin に push 済みの状態を前提に `gh pr create` 経由で PR を立てる単発 step（loop なし）。
- **冪等性の確保**: 同 branch に対する PR が既に存在する場合は `gh pr view` で既存 OPEN PR を検出し URL を state に記録するだけで success を返す。MERGED / CLOSED の場合は escalation。
- **PR body の自動生成**: request.md の `# {タイトル}` を PR title に、`## 背景` / `## 目的` を PR body の `## Summary` に圧縮。各 step の最終 verdict（spec-review / verification / code-review）を `## Workflow` セクションに表形式で含める。末尾に `🤖 Generated with SpecRunner` signature。
- **Pipeline transitions の書き換え** (**BREAKING**): 既存 `{ step: "code-review", on: "approved", to: "end" }` を削除し、`code-review → approved → pr-create`、`pr-create → success → end`、`pr-create → error → escalate` を追加。
- **`JobState.pullRequest` field 追加**: pr-create が成功したら `state.pullRequest = { url, number, createdAt }` を記録し `specrunner ps` で参照可能にする。
- **request.md セクション抽出 helper の追加**: PR body 生成のため `## 背景` / `## 目的` を抽出する helper を新設。
- **CLI runner `pr-create/runner.ts` の追加**: `gh pr view` / `gh pr create` を spawn し result file を出力。

## Capabilities

### New Capabilities

- `pr-create-step`: code-review approved 後に GitHub PR を作成する単発 CLI step。冪等性（既存 OPEN PR 検出）、PR body の自動生成、`JobState.pullRequest` への記録、escalation 条件（MERGED / CLOSED PR / gh CLI 失敗）を含む。
- `pr-create-runner`: `gh` CLI を spawn し PR 作成・既存 PR 検出を担う CLI runner。`pr-create-result.md` への結果書き込み（PR URL / number / status）を行う。

### Modified Capabilities

- `pipeline-orchestrator`: `STANDARD_TRANSITIONS` を書き換え、`code-review --approved→ pr-create`、`pr-create --success→ end`、`pr-create --error→ escalate` を追加。既存 `code-review --approved→ end` を削除。
- `job-state-store`: `JobState` 型に `pullRequest?: { url: string; number: number; createdAt: string }` field を追加。
- `step-execution-architecture`: `Pipeline` constructor に渡す `steps` Map に `PrCreateStep` を登録するエントリポイントを拡張（`init.ts` は kind=cli のため AgentRegistry への追加は不要、`run.ts` のみ更新）。
- `request-md-parser`: PR body 生成のために `## 背景` / `## 目的` セクションの抽出 API を `ParsedRequest` または周辺 helper として公開。

## Impact

- **影響コード**:
  - 新規: `src/core/step/pr-create.ts`, `src/core/pr-create/runner.ts`, `src/core/pr-create/body-template.ts`, `src/core/pr-create/request-md-extract.ts`（または `src/parser/request-md.ts` 拡張）
  - 修正: `src/core/pipeline/transitions.ts`（`STANDARD_TRANSITIONS`）, `src/core/state.ts`（または `JobState` 定義箇所）, `src/cli/run.ts`（steps Map 登録）
  - テスト追加: `tests/unit/core/pr-create/runner.test.ts`（4 シナリオ）, `tests/unit/step/pr-create.test.ts`（CliStep interface 適合性）, `tests/unit/core/pipeline/pipeline.transitions.test.ts`（新 transition）
- **環境前提**: `gh` CLI のインストール + 認証（`specrunner login` で github token 取得済みであれば可）、branch が origin に push 済み。
- **依存**: PR #36（`kind` discriminator）と PR #38（review/fixer 分離パターン）に依存。
- **後方互換性**: code-review approved 後の遷移先が `end` から `pr-create` に変わるため、既存の進行中 job（state ファイル上 code-review 完了直前）には breaking。ただし request 単位の short-lived job であり、本変更は実質的影響なし。
- **CLI snapshot test**: pipeline state machine の transition 図が変わるため snapshot 更新が必要。
- **ADR 要追加**: `kind=cli` 採用判断 / merge 戦略 / commit message 規約 / PR body template 設計を ADR に記録（ワークフロー option `adr` 有効）。
