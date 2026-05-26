# Tasks: observation-auto-fix

## [x] Task 1: Verdict union に `approved-with-fixes` を追加

**Design ref**: D2

### 変更対象

- `src/state/schema.ts`

### 作業内容

1. `Verdict` type union に `"approved-with-fixes"` literal を追加
2. exhaustive switch を使っている箇所があれば case を追加（現時点では `pipeline.ts` の `getStepOutcome` が string comparison なので影響なし）

### 完了条件

- `Verdict` union が 8 literal (`approved`, `approved-with-fixes`, `needs-fix`, `escalation`, `passed`, `failed`, `success`, `error`) を持つ
- `bun run typecheck` が green

---

## [x] Task 2: `parseFixableFindings()` parser を新設

**Design ref**: D5

### 変更対象

- `src/core/parser/review-findings.ts`

### 作業内容

1. `parseFixableFindings(content: string): number` を export として追加
2. `## Findings` section の table header から `Fix` カラムの column index を特定
3. data row を走査し、case-insensitive で `yes` の行を count して返す
4. `Fix` カラムが header に存在しない場合は 0 を返す（後方互換）
5. `## Findings` section 自体が存在しない場合は 0 を返す

### 完了条件

- 以下のケースで正しい値を返す:
  - `Fix` カラムあり、`yes` 2件 / `no` 1件 → 2
  - `Fix` カラムあり、全 `no` → 0
  - `Fix` カラムなし（旧 format） → 0
  - `## Findings` section なし → 0
- `bun run typecheck` が green

---

## [x] Task 3: `code-review.ts` の `determineVerdict()` 廃止と `parseResult()` 簡素化

**Design ref**: D4

### 変更対象

- `src/core/step/code-review.ts`

### 作業内容

1. `determineVerdict()` 関数を削除
2. `parseReviewScores` / `parseFindingSeverityCounts` の import を削除
3. `ReviewScores` / `FindingSeverityCounts` の import を削除
4. `parseFixableFindings` を `src/core/parser/review-findings.ts` から import
5. `parseResult()` を以下のロジックに書き換え:
   ```typescript
   parseResult(content: string, _deps: StepDeps): ParsedStepResult {
     const agentVerdict = parseReviewVerdict(content);
     const fixCount = parseFixableFindings(content);

     let verdict: Verdict;
     if (agentVerdict === "escalation") {
       verdict = "escalation";
     } else if (agentVerdict === "approved" && fixCount > 0) {
       verdict = "approved-with-fixes";
     } else {
       verdict = agentVerdict ?? "escalation";
     }

     return { verdict, findingsPath: null, fileContent: content };
   }
   ```
6. `ParsedStepResult` の `scores` field を返さなくなるが、型定義は変更しない

### 完了条件

- `determineVerdict()` が code-review.ts に存在しない
- `parseReviewScores` / `parseFindingSeverityCounts` の import が code-review.ts に存在しない
- agent verdict `approved` + fixCount > 0 → `approved-with-fixes` を返す
- agent verdict `approved` + fixCount === 0 → `approved` を返す
- agent verdict `needs-fix` → `needs-fix` を返す（fixCount は無視）
- agent verdict `escalation` → `escalation` を返す
- agent verdict null → `escalation` を返す
- `bun run typecheck` が green

---

## [x] Task 4: transition table に `approved-with-fixes` 関連の行を追加

**Design ref**: D1

### 変更対象

- `src/core/pipeline/types.ts`

### 作業内容

1. `STANDARD_TRANSITIONS` に以下 2 行を追加:
   ```typescript
   // approved-with-fixes: observation fixer path (fixer fixes then skips re-review)
   { step: STEP_NAMES.CODE_REVIEW, on: "approved-with-fixes", to: STEP_NAMES.CODE_FIXER },
   ```
2. `code-fixer --approved→` の分岐を conditional row + fallback row に変更:
   ```typescript
   // code-fixer → delta-spec-validation (when: 直前 code-review が approved-with-fixes)
   { step: STEP_NAMES.CODE_FIXER, on: "approved",
     to: STEP_NAMES.DELTA_SPEC_VALIDATION,
     when: (s) => {
       const reviews = s.steps?.["code-review"];
       if (!reviews || reviews.length === 0) return false;
       const lastReview = reviews[reviews.length - 1];
       return lastReview?.outcome?.verdict === "approved-with-fixes";
     },
   },
   // code-fixer → code-review (needs-fix 由来 — fallback, when なし)
   { step: STEP_NAMES.CODE_FIXER, on: "approved", to: STEP_NAMES.CODE_REVIEW },
   ```
3. 既存の `{ step: STEP_NAMES.CODE_FIXER, on: "approved", to: STEP_NAMES.CODE_REVIEW }` 行を上記の 2 行で置換する（conditional row を先に配置）
4. 既存の `code-fixer --error→ escalate` 行は変更しない

### 完了条件

- `code-review --approved-with-fixes→ code-fixer` が transition table に存在する
- `code-fixer --approved→ delta-spec-validation` (when: 直前 review が approved-with-fixes) が先に配置
- `code-fixer --approved→ code-review` (fallback) がその後に配置
- 既存の `code-review --approved→ delta-spec-validation` / `code-review --needs-fix→ code-fixer` / `code-review --escalation→ escalate` は変更なし
- `bun run typecheck` が green

---

## [x] Task 5: reviewer prompt に `Fix` カラムを追加

**Design ref**: D7

### 変更対象

- `src/prompts/fragments.ts`
- `src/prompts/code-review-system.ts`

### 作業内容

#### `src/prompts/fragments.ts` — `PIPELINE_RULES` fragment

1. `Findings Format` section の table header に `Fix` カラムを追加:
   ```markdown
   | # | Severity | Category | File | Description | How to Fix | Fix |
   ```
2. 例示 data row にも `Fix` カラムを追加:
   ```markdown
   | 1 | HIGH | security | src/auth/session.ts:42 | セッショントークンが平文で保存されている | bcrypt または argon2 でハッシュ化する | yes |
   | 2 | MEDIUM | maintainability | src/api/users.ts:120 | 関数が 80 行を超え責務が不明瞭 | 認証・バリデーション・永続化で分割 | no |
   ```
3. `必須カラム` の列挙に `Fix` を追加
4. `Fix` カラムの説明を追加:
   ```markdown
   **Fix カラム**: `yes` = この PR で fixer が修正すべき finding。`no` = pre-existing / 設計判断 / 別 scope の issue（fixer は無視）。
   ```

#### `src/prompts/code-review-system.ts` — `Output Format`

1. example の Findings table に `Fix` カラムを追加
2. Score table / total / verdict の format 説明はそのまま残す（CLI が判定材料にしないことを明記する必要は prompt 側にはない — agent は自由に出力して良い）

### 完了条件

- `PIPELINE_RULES` の Findings Format table header に `Fix` カラムがある
- `CODE_REVIEW_SYSTEM_PROMPT` の Output Format example に `Fix` カラムがある
- `bun run typecheck` が green

---

## [x] Task 6: code-fixer prompt を `Fix` カラム準拠に更新

**Design ref**: D6

### 変更対象

- `src/prompts/code-fixer-system.ts`

### 作業内容

1. `修正方針` section の `Severity 別の対応` を以下に置換:

   ```markdown
   ### Fix カラム別の対応
   - **Fix: yes** の finding: **すべて修正する**（severity に関わらず）
   - **Fix: no** の finding: **無視する**（修正不要）
   - **Fix カラムが存在しない**（旧 format）: severity に基づいて判断する（HIGH は必須、MEDIUM は設計変更不要の範囲、LOW は無視）
   ```

2. `修正手順` section を更新:
   ```markdown
   1. 指定された review-feedback-NNN.md を読み込む
   2. Fix: yes の finding を特定し、最小限の機械的修正を行う
   3. Fix: no の finding は無視する
   4. 修正が完了したら end_turn する
   ```

### 完了条件

- code-fixer prompt が `Fix` カラム準拠の修正方針を記述
- 旧 format（`Fix` カラムなし）への fallback 指示が含まれる
- `bun run typecheck` が green

---

## [x] Task 7: delta spec — `pipeline-orchestrator` 拡張

**Design ref**: D1, D2

### 変更対象

- `specrunner/changes/observation-auto-fix/specs/pipeline-orchestrator/spec.md` (新規)

### 作業内容

以下の Requirement を delta spec として追加:

1. **Requirement: Verdict union includes `approved-with-fixes`**
   - `Verdict` union に `"approved-with-fixes"` を追加
   - Scenario: exhaustive switch が 8 literal を受理

2. **Requirement: `code-review --approved-with-fixes→ code-fixer` transition**
   - transition table に行追加
   - Scenario: code-review が approved-with-fixes を返すと code-fixer に遷移

3. **Requirement: `code-fixer` 出口は直前 review verdict で分岐する**
   - `when` predicate で `state.steps["code-review"]` の最新 verdict を参照
   - Scenario: 直前 review verdict が `approved-with-fixes` → delta-spec-validation
   - Scenario: 直前 review verdict が `needs-fix` → code-review (既存 loop)

4. **Requirement: `determineVerdict()` を廃止し agent verdict をそのまま採用する**
   - score table parse / severity count での verdict override を廃止
   - Scenario: agent verdict `approved` + score < 7.0 → CLI verdict も `approved`（override なし）

### 完了条件

- delta spec file が存在する
- 各 Requirement に 1 つ以上の Scenario が含まれる

---

## [x] Task 8: delta spec — `agent-output-contract` 拡張

**Design ref**: D3

### 変更対象

- `specrunner/changes/observation-auto-fix/specs/agent-output-contract/spec.md` (新規)

### 作業内容

以下の Requirement を delta spec として追加:

1. **Requirement: Findings Format table に `Fix` カラムを追加**
   - 必須カラムに `Fix` を追加
   - `Fix` カラムの値は `yes` / `no`
   - Scenario: `Fix` カラムが `yes` の finding は fixer の修正対象
   - Scenario: `Fix` カラムが存在しない場合（旧 format）は後方互換で fixCount = 0

### 完了条件

- delta spec file が存在する
- Scenario が後方互換ケースを含む

---

## [x] Task 9: typecheck + test 確認

### 作業内容

1. `bun run typecheck` を実行して全ファイルの型チェックが通ることを確認
2. `bun run test` を実行して既存テストが green であることを確認

### 完了条件

- `bun run typecheck` exit code 0
- `bun run test` exit code 0
