# pipeline フレームワークの step 名依存を解消する

## Meta

- **slug**: decouple-pipeline-from-step-names
- **type**: spec-change
- **base-branch**: main
- **date**: 2026-05-13
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

pipeline フレームワークが特定の step 名を知った上で振る舞いを変えている箇所がある。step の追加・削除・リネーム時に pipeline フレームワーク側の修正が必要になり、step の独立性を損なう。

#219（定数化）は完了済み。定数化された上で、さらに分岐ロジックをフラグに移す。

GitHub Issue #218。

## 現状の step 名依存箇所

1. **`pipeline.ts:351`** — `if (stepName === "design")` で completion verdict を分岐。`completionVerdict` フラグで宣言的に解決すべき
2. **`resolve-step.ts:11`** — `SPEC_PHASE_STEPS = new Set(["design", "spec-review", "spec-fixer"])` で phase を判定。step がどの phase に属するかは step 定義が宣言すべき
3. **`executor.ts:22`** — `PROJECT_CONTEXT_STEPS` で project context 注入対象を判定。step 定義のフラグにすべき
4. **`managed-agent/agent-runner.ts:98`** — `step.agent.role === "design"` で SSE/polling を分岐。adapter 内部で解決すべき
5. **`managed-agent/agent-runner.ts:452`** — `step.name === "code-review"` で エラーメッセージを分岐

## 目的

pipeline フレームワークが step 名に依存せず、step 定義のフラグのみで振る舞いを決定するようにする。

## 要件

1. **`completionVerdict` の活用**: `pipeline.ts:351` の `if (stepName === "design")` 分岐を除去する。design step の定義に `completionVerdict: "success"` が既にあるので、そちらを参照するパスのみ残す

2. **`phase` フラグの追加**: `AgentStep` に `phase?: "spec" | "impl"` を追加する。`resolve-step.ts` の `SPEC_PHASE_STEPS` ハードコードを `step.phase === "spec"` に置き換える。spec-review は "spec"、code-review は "impl"

3. **`needsProjectContext` フラグの追加**: `AgentStep` に `needsProjectContext?: boolean` を追加する。`executor.ts` の `PROJECT_CONTEXT_STEPS` Set を除去し、`step.needsProjectContext` で判定する

4. **managed adapter の SSE/polling 分岐は adapter 内部で解決**: `step.agent.role === "design"` 分岐を adapter 内部のプライベートメソッド `private useSseStrategy(step): boolean` に抽出する。SSE/polling は managed adapter 固有の概念であり、core 層（AgentStep）にフラグを追加しない。Ports & Adapters パターンを維持する

5. **managed adapter のエラーメッセージ分岐を汎用化**: `agent-runner.ts:452` の `step.name === "code-review"` 分岐を除去する。`errors.ts` に汎用的な `resultFileNotFoundError(stepName, resultPath, branch, iteration)` 関数を追加し、step 名依存の 2 関数を統合する

## 受け入れ基準

- [ ] `pipeline.ts` に step 名の文字列比較が存在しない
- [ ] `resolve-step.ts` に step 名のハードコード Set が存在しない
- [ ] `executor.ts` に `PROJECT_CONTEXT_STEPS` が存在しない
- [ ] managed adapter の SSE/polling 分岐がプライベートメソッドに集約されている
- [ ] managed adapter に `step.name ===` のエラーメッセージ分岐が存在しない
- [ ] 各 step 定義にフラグが宣言されている
- [ ] 振る舞いが変わらない
- [ ] `bun run typecheck` / `bun run test` が全 pass

## 補足

- #219（定数化）が完了済みであることが前提
- core 層に追加するフラグは `phase` と `needsProjectContext` の 2 つのみ。`requiresCommit`, `completionVerdict` と同じパターン
- SSE/polling の判定は adapter の内部実装判断であり core 層に漏洩させない（Ports & Adapters パターン維持）
- AgentStep は 14 フィールド程度になるが flat 維持で問題ない。次のフラグ追加時にグルーピングを検討する
- `resolve-step.ts` の `REVIEWER_STEPS` と `STEP_MAPPING` は本リクエストのスコープ外（step 名を値として保持する resume 機能の本質的要件）
- `resolveResumeStep` のシグネチャ変更が必要な場合は、step 定義を import して phase を参照する lookup 関数を内部に持つ方式を検討する
