# Code Review: fixer-session-continuity — Iteration 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-15

---

## Summary

実装の設計・ロジックは正しい。3 adapter すべての session 継続パス・フォールバックパス、fixer-helpers の全関数、`AgentRunContext.resumeSessionId` の追加は適切に実装されている。build / typecheck / test (1829 tests) も全 green。

ただし test-cases.md の "must" 区分から **TC-EX-01〜03**（StepExecutor injection）と **TC-BM-01〜06**（各 fixer buildMessage の continuation 分岐）の計 9 件が未実装であり、これらは今回の変更の核心ロジックのカバレッジ欠損にあたる。

---

## Findings

### [HIGH] TC-EX-01〜03: StepExecutor の resumeSessionId 注入ロジックが未テスト

**File**: `tests/unit/step/executor.test.ts`（既存ファイルへの追加）

`src/core/step/executor.ts` L119-121 に追加された注入ロジック：

```ts
const resumeSessionId = FIXER_STEP_NAMES.has(step.name)
  ? getPreviousSessionId(state, step.name) ?? undefined
  : undefined;
```

このパスを通す unit test が存在しない。`executor.test.ts` を grep したが `resumeSessionId` / `fixer` / `resume` のどのキーワードもヒットしない（`spec-fixer` はエラーパステスト用の step 名として登場するのみ）。

test-cases.md が要求する "must" ケース：

| TC | 内容 |
|----|------|
| TC-EX-01 | spec-fixer に前回 sessionId がある → ctx.resumeSessionId に設定される |
| TC-EX-02 | spec-fixer 初回（steps なし）→ ctx.resumeSessionId が undefined |
| TC-EX-03 | spec-reviewer 等の非 fixer → ctx.resumeSessionId が設定されない |

**How to Fix**: `executor.test.ts` に `runAgentStep` を直接呼ぶか runner mock を通じた結合テストを追加し、上記 3 ケースで runner.run() に渡る ctx の `resumeSessionId` を assert する。

---

### [HIGH] TC-BM-01〜06: 各 fixer step の buildMessage continuation 分岐が未テスト

**Files**: `tests/unit/step/build-fixer.test.ts`, `tests/unit/step/code-fixer.test.ts`（既存ファイルへの追加）、および `spec-fixer` 用テストファイル（新規または既存の `tests/prompts/spec-fixer-system.test.ts` 拡張）

`spec-fixer.ts`, `code-fixer.ts`, `build-fixer.ts` の `buildMessage` は `isFixerContinuation` が true のとき `buildContinuationMessage` を返す新しい分岐を持つ。この分岐を直接 assert するテストが存在しない。

`build-fixer.test.ts` / `code-fixer.test.ts` の既存テストは `sessionId: null` の StepRun しか使っておらず、continuation 分岐に入らない。

test-cases.md が要求する "must" ケース：

| TC | 内容 |
|----|------|
| TC-BM-01 | spec-fixer 初回 → full prompt を返す |
| TC-BM-02 | spec-fixer 継続（sessionId あり）→ 短縮 prompt を返す |
| TC-BM-03 | code-fixer 継続（sessionId あり）→ 短縮 prompt を返す |
| TC-BM-04 | code-fixer 継続 + code-review result なし → NO_REVIEW_RESULT throw |
| TC-BM-05 | build-fixer 継続（sessionId あり）→ 短縮 prompt を返す |
| TC-BM-06 | build-fixer 継続 + verification result なし → NO_VERIFICATION_RESULT throw |

**How to Fix**: 各 fixer の `buildMessage` テストに continuation 用のケースを追加する。`sessionId: "sess-xyz"` を持つ StepRun を steps に仕込んだ JobState を作成し、`buildMessage` の戻り値が `buildContinuationMessage` の出力と一致することを assert する。TC-BM-04 / TC-BM-06 は継続時でも前提条件チェックが走ることを確認する。

---

### [LOW] `buildContinuationMessage` 内のハードコード文字列

**File**: `src/core/step/fixer-helpers.ts`, L54

```ts
const STEP_NAMES_BUILD_FIXER = "build-fixer";
```

モジュール冒頭で `STEP_NAMES` を import しているが、ここだけ文字列リテラルを使っている。将来の rename で不一致が生じるリスク。

**How to Fix**: `import { STEP_NAMES } from "./step-names.js"` 済みなので `STEP_NAMES.BUILD_FIXER` に差し替える（1 行）。

---

## Coverage Matrix (test-cases.md "must" 対比)

| Category | must count | カバー済み | 未実装 |
|----------|-----------|-----------|-------|
| fixer-helpers unit (TC-FH) | 8 | 8 | 0 |
| StepExecutor injection (TC-EX) | 3 | 0 | **3** |
| ClaudeCodeRunner (TC-CC) | 4 | 4 | 0 |
| CodexAgentRunner (TC-CX) | 4 | 4 | 0 |
| ManagedAgentRunner (TC-MA) | 3 | 3 | 0 |
| Fixer buildMessage (TC-BM) | 6 | 0 | **6** |
| Scope boundary (TC-SB) | 2 | 0 | 2 |
| Acceptance criteria (TC-AC) | 3 | 2 | 1 |

TC-SB-01 (reviewer は新規 session) と TC-AC-01 (2 回目の iteration で resumeSessionId が設定される) も executor テストが存在すれば自然に担保されるため、TC-EX の修正で連動して解消できる。

---

## What Works Well

- 3 adapter すべての実装が design.md の D3/D4 仕様に忠実
- ClaudeCodeRunner の timeout 時はフォールバックしない（TC-CC-04）が正確に実装・テストされている
- CodexAgentRunner の `thread.run()` 失敗時の 2 段フォールバックが適切
- ManagedAgentRunner の fallback で createSession → sendUserMessage まで通す 2 段構成が適切
- `fixer-helpers.ts` の `FIXER_STEP_NAMES`・`getPreviousSessionId`・`isFixerContinuation`・`buildContinuationMessage` は全ケース covered
- verification: build / typecheck / test 1829 passed — 既存テストへの regression なし
