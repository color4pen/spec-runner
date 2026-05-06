# ADR-20260506: Local Runtime Bug Fixes and Finish Preflight MERGED Bypass

**Date**: 2026-05-06
**Status**: accepted

## Context

PR #80/84 で AgentRunner port + ClaudeCodeRunner（local runtime）を導入した後、初回 dogfood（2026-05-05）で 4 件のバグが表面化した:

1. local runtime path で `resultContent === null` のとき completionVerdict を参照せず一律 escalation になる
2. propose 完了後に `state.branch` が未設定のまま後続 step に進む
3. review-verdict parser が strict すぎて agent のフォーマット揺れを拒否する
4. finish preflight check 4 が MERGED PR の UNKNOWN mergeStateStatus を retry → escalation する（Issue #77）

応急処置を全テストなしで main に push した結果 TC-003 が壊れた状態で dogfood が走り、code-fixer が scope 外リファクタを行って PR #88 が汚染された（応急処置は 364cc45 で revert 済み）。この教訓から、step 名ハードコードを使わず宣言的フラグで解決する方針を取った。

## Decision

4 件のバグを以下の方針で修正する。

**D1: completionVerdict fallback を executor local runtime path に追加。** `resultContent === null` のとき `step.completionVerdict` が定義されていればそれを verdict として採用する。managed runtime path（`_updatedState` 分岐）には影響しない。

**D2: `setsBranch` フラグで branch 自動設定を汎化。** `AgentStep` interface に `setsBranch?: boolean` を追加し、executor の local runtime path で `step.setsBranch === true && !jobState.branch` のとき `state.branch = "feat/${slug}"` を設定する。`step.name === "propose"` 等のハードコードは使わない。

**D3: review-verdict regex の拡張。** case-sensitive のまま `[Vv]erdict` で大文字 V を許容し、`- ` prefix optional、bold optional とする。`/i` flag は不使用（verdict 値 `APPROVED` 等の誤マッチ防止）。design.md の `[-\s]*` は `(?:-\s*)?` に変更（markdown 区切り線 `---` への false positive 回避）。

**D4: MERGED bypass を `fetchPrViewWithRetry` 内に挿入。** `mergeStateStatus === "UNKNOWN"` の retry 分岐前に `parsed.state === "MERGED"` を判定し、即 `{ ok: true, data: parsed }` を返す。MERGED は不可逆な終了状態であり merge 可能性チェックは不要。

## Alternatives Considered

### Alternative 1 (D1): `resultContent === null` で一律 success を返す
- **Pros**: ロジックが単純
- **Cons**: propose 以外の null-result step（spec-fixer, implementer, build-fixer）が completionVerdict を既に宣言しており、一律 success は semantics を無視する
- **Why not**: step が宣言した completionVerdict を参照するのが正しい帰結

### Alternative 2 (D2): `step.name === "propose"` のハードコードで branch を設定する
- **Pros**: 変更箇所が executor.ts 1 箇所のみで最小
- **Cons**: TC-003（step 名ハードコード禁止の lint 的テスト）が fail する。将来 propose 以外の step で branch 作成が必要になった場合に再びハードコードが増殖する
- **Why not**: 応急処置で TC-003 を壊した教訓が直接的。宣言的フラグで汎化する

### Alternative 3 (D3): `/i` flag で全体を case-insensitive にする
- **Pros**: regex が単純化する
- **Cons**: verdict 値 `APPROVED`, `Needs-Fix` 等にもマッチしてしまう。spec で定義された verdict は lowercase のみ（`approved`, `needs-fix`, `escalation`）
- **Why not**: verdict 値の case まで寛容にすると、仕様外の値を受け入れるリスクが生じる

### Alternative 4 (D4): orchestrator 側で MERGED 判定を追加する（preflight の外）
- **Pros**: preflight の責務を変更しない
- **Cons**: orchestrator が PR 状態の raw data（mergeStateStatus）を知る必要があり、preflight と orchestrator の責務境界が曖昧になる。既存の `prAlreadyMerged` path は preflight が `{ ok: true }` を返す前提で設計されている
- **Why not**: preflight 内で完結させることで orchestrator の既存パスとの整合が取れる

## Consequences

### Positive

- local runtime path で propose → spec-review が正常遷移する（completionVerdict fallback + branch state 自動設定）
- TC-003 が green のまま維持される（step 名ハードコードなし）
- review-verdict parser が agent のフォーマット揺れ 3 パターンを許容し、false negative による escalation が減少する
- MERGED PR に対する `specrunner finish` が即完了し、UNKNOWN retry → escalation の dead path を回避する
- 応急処置を全テストなしで push する anti-pattern の再発防止が設計レベルで担保された（`setsBranch` フラグ方式は TC-003 を壊さない）

### Negative

- `AgentStep` interface に optional field が 1 つ増える（`setsBranch`）。interface の肥大化が進行する場合は将来 `StepCapabilities` object への集約を検討する必要がある
- `fetchPrViewWithRetryForTest` export が test-only の public API surface を作る。production code が誤って消費するリスクがある（`@internal` タグ未付与）
- regex が `\*{0,2}` で unbalanced asterisks（`*verdict*:`）も許容する。false positive リスクは verdict 値リストで制約されるが、prompt injection edge case の攻撃面がわずかに広がる

### Risks

- **regex の fenced code block マッチ**: review output の fenced code block 内に `verdict: approved` が含まれた場合に誤マッチする可能性が残存する。review-lessons.md で既知だが本 change の scope 外。将来の hardening issue として別途記録する
- **managed runtime path での setsBranch 評価**: managed runtime path は `_updatedState` 分岐で先に return するため setsBranch ロジックに到達しない。ただし `_updatedState` path が将来変更された場合に setsBranch が意図せず fire するリスクがある。TC-007（should priority）で architectural guard を検討する

### Known Design Debt

- **regex unbalanced asterisks** (code-review #1, MEDIUM maintainability): `\*{0,2}` が unbalanced bold markers を許容する。`(?:\*{2})?` に tighten するか、現行を intentional tolerance として unit test で文書化する
- **test-only export pattern** (code-review #2, MEDIUM maintainability): `fetchPrViewWithRetryForTest` に `@internal` JSDoc tag が未付与。`runPreflight` 経由のテストに切り替えるか、export に annotation を追加する
- **integration test duplication** (code-review #3, LOW maintainability): TC-001〜TC-006 で `PipelineDeps` 構築が 6 回重複。`makeDeps(slug)` factory 抽出で 90+ 行削減可能
- **`/i` flag 不使用の undocumented deviation** (code-review #4, LOW correctness): design.md D3 は `/mi` flag を指定したが実装は `/m` のみ。コード内コメントで理由（verdict 値は lowercase-only）を明記すべき
- **TC-007 未実装** (code-review #5, LOW testing): managed runtime path で setsBranch が評価されないことの architectural guard テストが未実装

## References

- Request: `openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight/request.md`
- Change proposal: `openspec/changes/fix-local-runtime-and-finish-preflight/proposal.md`
- Design doc: `openspec/changes/fix-local-runtime-and-finish-preflight/design.md`
- Spec review (iter 1 approved, 8.05 / 10): `openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight/spec-review-result-001.md`
- Code review (iter 1 approved, 8.20 / 10): `openspec-workflow/requests/active/fix-local-runtime-and-finish-preflight/review-feedback-001.md`
- Related: ADR-20260505-agent-runner-port-and-local-runtime.md（AgentRunner port + local runtime 導入）
- Related: Issue #77（finish preflight MERGED bypass）
- Related: PR #86, #87, 43c0e1d → 364cc45（応急処置 → revert の教訓）
