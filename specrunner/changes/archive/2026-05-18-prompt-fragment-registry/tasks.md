# Tasks: prompt-fragment-registry

## Task 1: `src/prompts/fragments.ts` 新規作成

**Goal**: 4 fragment を 1 file に集約 export する

1. `src/prompts/fragments.ts` を新規作成
2. 以下 4 const を export する (content は既存 file からコピー、中身編集なし):
   - `AUTHORITY_SPEC_GUARD: string` (元: `authority-spec-guard.ts` の `AUTHORITY_SPEC_GUARD_RULE`)
   - `COMMIT_DISCIPLINE: string` (元: `commit-discipline.ts` の `COMMIT_DISCIPLINE_RULE`)
   - `DELTA_SPEC_FORMAT: string` (元: `delta-spec-format.ts` の `DELTA_SPEC_FORMAT_RULES`)
   - `PIPELINE_RULES: string` (元: `pipeline-rules.ts` の `PIPELINE_RULES`)
3. const 名から `_RULE` / `_RULES` suffix を除去する (`PIPELINE_RULES` はそのまま)

**Verification**: `bun run typecheck` で fragments.ts が通ること (import 側はまだ切り替えていないのでこの時点では単独確認)

---

## Task 2: `src/prompts/builder.ts` 新規作成

**Goal**: prompt 連結の純粋関数を提供する

1. `src/prompts/builder.ts` を新規作成
2. 以下の関数を export する:
   ```ts
   export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
     return [base, ...fragments].join("\n\n");
   }
   ```
3. 他の関数・class・interface は追加しない

**Verification**: typecheck 通過

---

## Task 3: 対象 8 prompt の builder 経由化

**Goal**: 8 prompt file を `buildSystemPrompt(BASE, [...])` 形式に書き換える

各 prompt file で以下を実施:

### 3-1: `src/prompts/implementer-system.ts`

1. 既存 import (`COMMIT_DISCIPLINE_RULE` from `commit-discipline.js`, `AUTHORITY_SPEC_GUARD_RULE` from `authority-spec-guard.js`) を削除
2. `import { AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE, DELTA_SPEC_FORMAT } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の `${COMMIT_DISCIPLINE_RULE}` / `${AUTHORITY_SPEC_GUARD_RULE}` 埋め込みを除去し、base prompt として const 化
5. `export const IMPLEMENTER_SYSTEM_PROMPT = buildSystemPrompt(BASE, [AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE, DELTA_SPEC_FORMAT])` に書き換え
6. **新規追加**: `DELTA_SPEC_FORMAT` を array に含める (#304 構造的解決)

### 3-2: `src/prompts/design-system.ts`

1. 既存 import (`DELTA_SPEC_FORMAT_RULES` from `delta-spec-format.js`) を削除
2. `import { DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の `${DELTA_SPEC_FORMAT_RULES}` 埋め込みを除去し、base prompt 部分を const 化
5. `DESIGN_SYSTEM_PROMPT` の export を `buildSystemPrompt(BASE, [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD])` に書き換え
6. **新規追加**: `AUTHORITY_SPEC_GUARD` を array に含める
7. 注意: `buildInitialMessage()` 関数は既存のまま維持 (builder 経由化の対象は system prompt のみ)

### 3-3: `src/prompts/spec-fixer-system.ts`

1. 既存 import 3 行 (`DELTA_SPEC_FORMAT_RULES`, `COMMIT_DISCIPLINE_RULE`, `AUTHORITY_SPEC_GUARD_RULE`) を削除
2. `import { DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の 3 fragment 埋め込みを除去し、base prompt を const 化
5. `buildSpecFixerSystemPrompt()` 内の return を `buildSystemPrompt(BASE, [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE])` に書き換え

### 3-4: `src/prompts/code-fixer-system.ts`

1. 既存 import (`COMMIT_DISCIPLINE_RULE` from `commit-discipline.js`) を削除
2. `import { COMMIT_DISCIPLINE, AUTHORITY_SPEC_GUARD, DELTA_SPEC_FORMAT } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の `${COMMIT_DISCIPLINE_RULE}` 埋め込みを除去し、base prompt を const 化
5. export を `buildSystemPrompt(BASE, [COMMIT_DISCIPLINE, AUTHORITY_SPEC_GUARD, DELTA_SPEC_FORMAT])` に書き換え
6. **新規追加**: `AUTHORITY_SPEC_GUARD` と `DELTA_SPEC_FORMAT` を array に含める

### 3-5: `src/prompts/build-fixer-system.ts`

1. 既存 import (`COMMIT_DISCIPLINE_RULE` from `commit-discipline.js`) を削除
2. `import { COMMIT_DISCIPLINE } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の `${COMMIT_DISCIPLINE_RULE}` 埋め込みを除去し、base prompt を const 化
5. export を `buildSystemPrompt(BASE, [COMMIT_DISCIPLINE])` に書き換え

### 3-6: `src/prompts/adr-gen-system.ts`

1. `import { COMMIT_DISCIPLINE } from "./fragments.js"` を追加
2. `import { buildSystemPrompt } from "./builder.js"` を追加
3. base prompt 部分を const 化 (既存は template literal に fragment 埋め込みなし、そのまま const に移行)
4. export を `buildSystemPrompt(BASE, [COMMIT_DISCIPLINE])` に書き換え
5. **新規追加**: `COMMIT_DISCIPLINE` を array に含める (元は fragment ゼロ)

### 3-7: `src/prompts/spec-review-system.ts`

1. 既存 import (`PIPELINE_RULES` from `pipeline-rules.js`) を削除
2. `import { PIPELINE_RULES } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の `${PIPELINE_RULES}` 埋め込みを除去し、base prompt を const 化
5. `buildSpecReviewSystemPrompt()` 内の return を `buildSystemPrompt(BASE, [PIPELINE_RULES])` に書き換え
6. 注意: `buildSpecReviewInitialMessage()` は既存のまま維持

### 3-8: `src/prompts/code-review-system.ts`

1. 既存 import (`PIPELINE_RULES` from `pipeline-rules.js`) を削除
2. `import { PIPELINE_RULES } from "./fragments.js"` を追加
3. `import { buildSystemPrompt } from "./builder.js"` を追加
4. template literal 内の `${PIPELINE_RULES}` 埋め込みを除去し、base prompt を const 化
5. export を `buildSystemPrompt(BASE, [PIPELINE_RULES])` に書き換え

**Verification**: `bun run typecheck` 通過 (旧 import path はまだ残っている可能性があるが、8 file 内は切り替え済み)

---

## Task 4: 旧 4 fragment file の削除

**Goal**: 集約済みの単独 file を削除する

1. 以下 4 file を削除:
   - `src/prompts/authority-spec-guard.ts`
   - `src/prompts/commit-discipline.ts`
   - `src/prompts/delta-spec-format.ts`
   - `src/prompts/pipeline-rules.ts`
2. 削除前に grep で active code に import が残っていないことを確認 (Task 3 完了後は 8 prompt の import はすべて `fragments.js` 経由に切り替え済み)

**Verification**: `bun run typecheck` 通過

---

## Task 5: `tests/unit/prompts/builder.test.ts` 新規作成

**Goal**: builder 関数の単体テスト

1. `tests/unit/prompts/` ディレクトリを作成 (存在しない)
2. `tests/unit/prompts/builder.test.ts` を新規作成
3. 以下 2 TC を実装:
   - **TC-BLD-01**: `buildSystemPrompt("base", ["f1", "f2"])` が `"base\n\nf1\n\nf2"` を返す
   - **TC-BLD-02**: `buildSystemPrompt("base", [])` が `"base"` を返す

**Verification**: `bun run test tests/unit/prompts/builder.test.ts` green

---

## Task 6: `tests/unit/prompts/fragment-coverage.test.ts` 新規作成

**Goal**: 8 prompt の必須 fragment 対応表を test で lock する

1. `tests/unit/prompts/fragment-coverage.test.ts` を新規作成
2. 以下の import を設定:
   - `AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES` from `fragments.js`
   - 8 prompt の export (各 system prompt file から)
3. `test.each` で 8 prompt の必須 fragment 対応表を assert:
   ```
   IMPLEMENTER  → [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]
   DESIGN       → [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD]
   SPEC_FIXER   → [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]
   CODE_FIXER   → [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]
   BUILD_FIXER  → [COMMIT_DISCIPLINE]
   ADR_GEN      → [COMMIT_DISCIPLINE]
   SPEC_REVIEW  → [PIPELINE_RULES]
   CODE_REVIEW  → [PIPELINE_RULES]
   ```
4. 各 entry で `expect(prompt).toContain(fragment)` を assert
5. 旧 `pipeline-rules.test.ts` の TC-10〜TC-18 に相当する「prompt が fragment 内容を含む」系テストは、この test.each で代替される

注意: `DESIGN_SYSTEM_PROMPT` は関数呼び出しの戻り値なので、import 時に `buildDesignSystemPrompt` 等を呼び出すか、テスト内で適切に取得すること。同様に `SPEC_FIXER_SYSTEM_PROMPT` / `SPEC_REVIEW_SYSTEM_PROMPT` も builder 関数経由の場合はテスト内で呼び出して取得する。

**Verification**: `bun run test tests/unit/prompts/fragment-coverage.test.ts` green

---

## Task 7: `tests/unit/prompts/fragments.test.ts` 新規作成 + 旧 test 削除

**Goal**: PIPELINE_RULES 内容検証を移行し、旧 test file を削除する

1. `tests/unit/prompts/fragments.test.ts` を新規作成
2. `tests/prompts/pipeline-rules.test.ts` の TC-01〜TC-08 を移行:
   - import path を `../../../src/prompts/fragments.js` の `PIPELINE_RULES` に変更
   - TC-01 & TC-27: PIPELINE_RULES が non-empty string
   - TC-02: Severity セクション (CRITICAL/HIGH/MEDIUM/LOW, 承認阻止条件)
   - TC-03: 9 categories
   - TC-04: Findings Format (columns, path:line format)
   - TC-05: Scoring (weights, threshold 7.0)
   - TC-06: Verdict (approved/needs-fix/escalation)
   - TC-07: Iteration Comparison (improving/plateaued/regressing, stagnation detection)
   - TC-08: Excluded sections (Authority matrix 等)
3. `tests/prompts/pipeline-rules.test.ts` を削除
   - TC-10〜TC-18 (prompt 含有検証) は Task 6 の fragment-coverage.test.ts で代替済み

**Verification**: `bun run test tests/unit/prompts/fragments.test.ts` green

---

## Task 8: 既存 prompt test の import path 確認・修正

**Goal**: 削除した 4 file を参照している既存 test がないことを確認し、必要に応じて修正する

1. 以下の test file が削除対象 file を import していないことを確認:
   - `tests/prompts/design-system.test.ts` — `delta-spec-format.js` を直接 import していない (確認済み、変更不要)
   - `tests/prompts/implementer-system.test.ts` — fragment file を直接 import していない (確認済み、変更不要)
   - `tests/prompts/spec-fixer-system.test.ts` — fragment file を直接 import していない (確認済み、変更不要)
   - `tests/prompts/spec-review-system.test.ts` — `pipeline-rules.js` を直接 import していない (確認済み、変更不要)
   - `tests/prompts/test-case-gen-system.test.ts` — fragment file を直接 import していない (確認済み、変更不要)
   - `tests/prompts/dynamic-context-prompts.test.ts` — fragment file を直接 import していない (確認済み、変更不要)
2. 万が一 import が残っていた場合は `fragments.js` 経由に切り替え

**Verification**: `bun run typecheck && bun run test` green (全体)

---

## Task 9: delta spec 作成

**Goal**: spec authority に本変更の要件を delta spec として記録する

1. `specrunner/changes/prompt-fragment-registry/specs/prompt-fragment-registry/spec.md` を新規作成
2. `## ADDED Requirements` セクションで以下の Requirement を記述:
   - REQ-PFR-001: shared prompt fragment は `src/prompts/fragments.ts` に string const として集約 export される
   - REQ-PFR-002: prompt builder は `buildSystemPrompt(base: string, fragments: readonly string[]): string` の純粋関数として `src/prompts/builder.ts` で提供される
   - REQ-PFR-003: 各 system prompt は自身が必要とする fragment を array literal で列挙し、buildSystemPrompt 経由で構成する
   - REQ-PFR-004: fragment の inject 漏れは `tests/unit/prompts/fragment-coverage.test.ts` の対応表で構造的に検出される
   - REQ-PFR-005: fragment 側に inject 先 (= step 名 / prompt 名) を持たせない (= 依存方向は prompt → fragment の片方向)

**Verification**: delta spec file が存在し、`## ADDED Requirements` を含む

---

## Execution Order

```
Task 1 (fragments.ts) ─┐
Task 2 (builder.ts)  ───┤
                        ├─→ Task 3 (8 prompt 書き換え) → Task 4 (旧 file 削除)
                        │
Task 9 (delta spec)  ───┘   Task 5 (builder test)  ─┐
                             Task 6 (coverage test) ──┤─→ Task 8 (import 確認) → 全体検証
                             Task 7 (fragments test) ─┘
```

Task 1-2 と Task 9 は並行可能。Task 3 は Task 1-2 完了後。Task 4 は Task 3 完了後。Task 5-7 は Task 3 完了後 (import path が確定してから)。Task 8 は最後に全体確認。
