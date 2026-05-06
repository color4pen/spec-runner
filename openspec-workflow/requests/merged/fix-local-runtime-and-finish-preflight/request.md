# Local runtime バグ修正 + finish preflight MERGED bypass

## Meta

- **type**: spec-change
- **date**: 2026-05-06
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - pattern-reviewer

## 背景

PR #80 で AgentRunner port + ClaudeCodeRunner を導入し、PR #84 で SDK query() に修正した。local runtime の初回 dogfood（2026-05-05）で pipeline は完走したが、3 件のインフラバグと 1 件の既知 issue（#77）が表面化した。

応急処置を全テストを通さずに main に push した結果、TC-003 等が fail する状態で spec-runner の dogfood を走らせてしまい、code-fixer が scope 外のリファクタを行って PR #88 が汚染された。応急処置は revert 済み（364cc45）。

## 目的

以下 4 件を正しい形で再実装する:

1. **completionVerdict fallback**: local runtime path で `resultContent === null` のとき `step.completionVerdict` を参照する
2. **branch state 設定**: propose 完了後に `state.branch` を設定する（`setsBranch` フラグで汎化）
3. **verdict parser tolerance**: agent が `**Verdict**:` (大文字 V) や `- ` prefix なし等のフォーマット揺れを出すため、parser を寛容にする
4. **finish preflight MERGED bypass** (Issue #77): MERGED PR に対する `specrunner finish` で Phase 0 check 4 が UNKNOWN retry → escalation する問題を修正する

## 要件

### 1. executor.ts: completionVerdict fallback（local runtime path）

- `resultContent === null` かつ `step.completionVerdict` が定義されている場合、`step.completionVerdict` を verdict として使用する
- managed runtime path（`_updatedState` 分岐）には影響しない

### 2. executor.ts + types.ts + propose.ts: setsBranch フラグ

- `AgentStep` interface に `setsBranch?: boolean` を追加する
- `ProposeStep` に `setsBranch: true` と `completionVerdict: "success"` を設定する
- executor.ts の local runtime path で `step.setsBranch && !jobState.branch` のとき `state.branch = "feat/${slug}"` を設定する
- `step.name === "propose"` のようなハードコードは使わない（TC-003 が fail するため）

### 3. review-verdict.ts: parser tolerance

- `- **verdict**: approved` (既存) に加えて以下にもマッチさせる:
  - `**Verdict**: approved` (大文字 V、`- ` prefix なし)
  - `Verdict: approved` (bold なし)
- case-insensitive マッチを含める

### 4. preflight.ts: MERGED bypass (Issue #77)

- Phase 0 check 4 の UNKNOWN retry 前に `state === "MERGED"` を判定する
- MERGED なら `{ ok: true, data: parsed }` を返す（UNKNOWN retry をスキップ）
- orchestrator の `prAlreadyMerged` path（TC-106）に到達できるようにする
- `cli-finish-command` spec の Check 4 に MERGED 例外を delta spec として反映する

### 5. delta spec

- `openspec/specs/step-execution-architecture/spec.md`: AgentStep に `setsBranch?: boolean` と `completionVerdict` フィールドを追加
- `openspec/specs/cli-finish-command/spec.md`: Check 4 に「MERGED PR は UNKNOWN retry をスキップ」を追加

### 6. テスト

- TC-003（executor.ts に step 名ハードコードがないこと）が green であること
- finish-orchestrator.test.ts: MERGED PR が UNKNOWN を返すモックに修正（GitHub の実挙動再現）
- 全テスト green: `bun run typecheck && bun test`

## 受け入れ基準

- [ ] `bun run typecheck && bun test` が全テスト green（既存 fail を増やさない）
- [ ] TC-003 が pass（step 名ハードコードなし）
- [ ] local runtime で propose → spec-review が正常遷移（completionVerdict + branch state）
- [ ] MERGED PR に対する finish で escalation しない
- [ ] delta spec が `openspec/changes/` に存在し `openspec validate` が pass する
- [ ] `step.name === "propose"` 等のハードコードが executor.ts に存在しない

## 補足

### 関連 issue

- Issue #77: finish preflight MERGED bypass
- Issue #81: StepContext 型分離 + _updatedState 責務重複（本 request の scope 外、別途対応）
- Issue #83: ClaudeCodeRunner SDK 化（PR #84 で対応済み）

### 教訓（pattern-reviewer 参照用）

PR #86, #87, 43c0e1d で応急処置を全テストを通さずに main に push → TC-003 fail 状態で dogfood → code-fixer が scope 外リファクタ → PR #88 汚染。全テストを通さない修正は main に入れてはならない。
