# Review Feedback — fixer-session-continuity (Iteration 2)

## Summary

Iteration 2 では iter 1 で指摘された **HIGH** 級カバレッジ欠損 (TC-EX-01〜03 / TC-BM-01〜06) がすべて補完された。

- `tests/unit/step/executor.test.ts` に `TC-EX: StepExecutor injects resumeSessionId for fixer steps` ブロックが追加され、TC-EX-01〜03 を `AgentRunner` mock の ctx capture でカバー
- `tests/unit/step/spec-fixer.test.ts` が新規追加され TC-BM-01 / TC-BM-02 をカバー
- `tests/unit/step/code-fixer.test.ts` の TC-BM-03 / TC-BM-04 が追加
- `tests/unit/step/build-fixer.test.ts` の TC-BM-05 / TC-BM-06 が追加

実装側 (`src/`) は iter 1 から変更されておらず、iter 1 で動作確認済みのコード。`bun run test`（1854 tests）と `bun run typecheck` がともに green。

iter 1 の **LOW** 指摘 (`STEP_NAMES_BUILD_FIXER` ハードコード) は未修正だが、severity が LOW のため verdict には影響しない。

---

## Findings

### [LOW] `STEP_NAMES_BUILD_FIXER` ハードコード文字列が未修正（iter 1 から繰越）

**File**: `src/core/step/fixer-helpers.ts:54-56`

```ts
const STEP_NAMES_BUILD_FIXER = "build-fixer";
const source =
  opts.stepName === STEP_NAMES_BUILD_FIXER ? "verification" : "reviewer";
```

ファイル冒頭で `import { STEP_NAMES } from "./step-names.js"` 済み（L9）にもかかわらず、ここだけリテラル文字列を使っている。`STEP_NAMES.BUILD_FIXER` に差し替えれば 1 行で解決。将来 step name を rename した場合に `FIXER_STEP_NAMES` 側 (L15) は連動するが、ここだけ取り残されて分岐が壊れるリスクがある。

**How to Fix**:
```ts
const source =
  opts.stepName === STEP_NAMES.BUILD_FIXER ? "verification" : "reviewer";
```

iter 1 の review-feedback-001.md でも指摘されていたが本 iteration では未対応。

---

### [INFO] Codex `resumeThread` 失敗時にフォールバックしても session 期限切れ以外のエラーをマスクする可能性

**File**: `src/adapter/codex/agent-runner.ts:140-167`, `src/adapter/claude-code/agent-runner.ts:147-166`, `src/adapter/managed-agent/agent-runner.ts:361-401`

design.md D4 は「session 失効・SDK エラー等の場合に warn + fallback」と書かれており、3 adapter とも実装は「any error → warn + fallback」になっている。これは仕様通り。ただし、ネットワーク一時障害や認証エラーで resume が失敗した場合も新規 session を作って実行を続行するため、根本原因のデバッグが難しくなる可能性がある。

現状は warn ログに `(resumeErr as Error).message` が出るので診断は可能。今後 retry 戦略を見直す場合、エラー種別で fallback 可否を分けるか検討する余地がある。判断は不要、設計通り。

---

### [INFO] Codex `resumeThread()` の戻り値 `thread.id` に対する SDK 仮定

**File**: `src/adapter/codex/agent-runner.ts:155, 164`, `tests/adapter/codex/agent-runner.test.ts:312`

`codex.resumeThread(threadId)` が返す `thread.id` が呼び出し時の `threadId` と一致する保証は SDK 側にあるが、コードは `thread.id` をそのまま `result.sessionId` に使っている。テスト（L312）でもモック thread の id (`thread-resumed`) と ctx の resumeSessionId (`thread-existing`) が異なる状態で「success」を assert しているため、実際の Codex SDK が異なる id を返した場合に StepRun に新しい id が記録される。次回 iteration では新 id で resume が試みられる。SDK 仕様上問題なければ意図通り。設計判断のため修正不要。

---

## Test Coverage

test-cases.md に対するカバレッジ評価:

| Category | must | covered | missing | 備考 |
|----------|------|---------|---------|------|
| fixer-helpers unit (TC-FH-01〜11) | 8 | 8 | 0 | tests/core/step/fixer-helpers.test.ts |
| StepExecutor injection (TC-EX-01〜03) | 3 | 3 | 0 | tests/unit/step/executor.test.ts:697-815 |
| ClaudeCodeRunner (TC-CC-01〜04) | 4 | 4 | 0 | tests/unit/adapter/claude-code/agent-runner.test.ts:1145-1299 |
| CodexAgentRunner (TC-CX-01〜04) | 4 | 4 | 0 | tests/adapter/codex/agent-runner.test.ts:310-396 |
| ManagedAgentRunner (TC-MA-01〜03) | 3 | 3 | 0 | tests/unit/adapter/managed-agent/agent-runner.test.ts:915-1012 |
| Fixer buildMessage (TC-BM-01〜06) | 6 | 6 | 0 | spec-fixer.test.ts / code-fixer.test.ts / build-fixer.test.ts |
| Scope boundary (TC-SB-01〜02) | 2 | 1.5 | 0.5 | TC-SB-01 は TC-EX-03 で実質担保。TC-SB-02 (resume command 経由) は integration で担保（unit では検証困難） |
| Acceptance criteria (TC-AC-01〜03) | 3 | 3 | 0 | typecheck / test 全 green、ctx 注入と fallback 各テストでカバー |
| **Total must** | **33** | **32.5** | **0.5** | |

should / could ケースもおおむねカバー (TC-FH-12〜14, TC-BM-07/08 等)。

GIVEN/WHEN/THEN とテストアサーションの整合性も確認済み（TC-EX-01 で `state.steps["spec-fixer"]` に `sessionId: "sess-prev-001"` を仕込み → `captured.ctx.resumeSessionId === "sess-prev-001"` を assert、等）。

---

## What Works Well

- iter 1 で指摘された 9 件の未実装 must テストがすべて追加されており、coverage matrix が完全に閉じた
- TC-BM-04 / TC-BM-06 で「continuation 中でも前提条件チェック (`CODE_FIXER_NO_REVIEW_RESULT` / `BUILD_FIXER_NO_VERIFICATION_RESULT`) が走る」ことを明示的にテストしており、ガード順序のリグレッション防止になっている
- TC-EX-03 で「非 fixer step (spec-review) は previous spec-fixer session を継承しない」ことを境界条件として検証
- spec-fixer / code-fixer / build-fixer の continuation テストが `buildContinuationMessage` の出力と「正確に一致 (`toBe`)」を assert しており、prompt 文言のリグレッション検出に強い
- 全 1854 tests / typecheck green（既存テストへの regression なし）

---

## Verdict

iter 1 の HIGH/MAJOR 指摘はすべて解消され、残存は LOW 1 件のみ。LOW は将来の rename リスクを軽減するための一行修正で、今回の変更スコープのコア動作には影響しない。

- **verdict**: approved
