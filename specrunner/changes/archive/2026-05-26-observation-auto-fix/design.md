# Design: observation-auto-fix

## 概要

reviewer が `approved` verdict + `fix: true` の finding を出した場合に、自動で code-fixer を発火し observation を消化してから finish に進む pipeline 拡張。同時に reviewer 出力に machine-readable な finding list を必須化し、CLI 側の score-based verdict 再計算を廃止する。

## 設計判断

### D1: transition table の拡張 — `approved-with-fixes` verdict の導入

**選択肢 A**: code-review の parseResult で finding 有無を判定し、新 verdict `approved-with-fixes` を返す。transition table で `code-review --approved-with-fixes→ code-fixer` を追加。code-fixer の出口で「直前 review verdict」を state から参照して遷移先を分岐。

**選択肢 B**: 既存 `approved` verdict のまま、transition table の `when` predicate で finding 有無を判定して分岐。

**決定: A** — `approved-with-fixes` を新 verdict として Verdict union に追加する。

理由:
- transition table が self-documenting（`on: "approved-with-fixes"` で意図が明確）
- `when` predicate は pipeline state 依存の分岐（例: code-review 実行済みか）に使うべきで、step 出力の意味的分岐は verdict 側で表現するのが自然
- code-fixer 出口の分岐が「直前 review の verdict を state から参照」で単純に書ける

**transition table 変更:**

```
# 既存 (変更なし)
code-review --needs-fix→ code-fixer
code-review --escalation→ escalate

# 変更: approved → delta-spec-validation は「finding なし approved のみ」
code-review --approved→ delta-spec-validation   (既存行、変更なし)

# 追加: approved + fix対象finding あり
code-review --approved-with-fixes→ code-fixer

# 追加: code-fixer 出口で直前 review verdict 参照
code-fixer --approved→ code-review              (既存行、変更なし — needs-fix 由来)
code-fixer --approved→ delta-spec-validation    (when: 直前 code-review verdict === "approved-with-fixes")
code-fixer --error→ escalate                    (既存行、変更なし)
```

**code-fixer 出口の `when` predicate 実装:**

```typescript
// code-fixer --approved→ delta-spec-validation (approved-with-fixes 由来の fixer 完了)
{
  step: STEP_NAMES.CODE_FIXER,
  on: "approved",
  to: STEP_NAMES.DELTA_SPEC_VALIDATION,
  when: (s) => {
    const lastReview = getLatestStepResult(s, STEP_NAMES.CODE_REVIEW);
    return lastReview?.verdict === "approved-with-fixes";
  },
}
// code-fixer --approved→ code-review (needs-fix 由来 — fallback、when なし、既存)
{ step: STEP_NAMES.CODE_FIXER, on: "approved", to: STEP_NAMES.CODE_REVIEW }
```

conditional row を fallback row の前に配置する（`Array.find` first-match ルール）。

### D2: Verdict union への `approved-with-fixes` 追加

`src/state/schema.ts` の `Verdict` union に `"approved-with-fixes"` を追加する。

```typescript
export type Verdict =
  | "approved"
  | "approved-with-fixes"  // 追加
  | "needs-fix"
  | "escalation"
  | "passed"
  | "failed"
  | "success"
  | "error";
```

**影響範囲**: transition table の `on` field は `Verdict | string` なので型制約上は追加不要だが、`parseResult` の返却型・`StepOutcome.verdict` の型が `Verdict | null` なので union への追加が必須。

### D3: reviewer 出力の machine-readable finding list (Findings Format 拡張)

reviewer 出力 `review-feedback-NNN.md` の `## Findings` section の table に `Fix` カラムを追加する。

**現行:**

```markdown
| # | Severity | Category | File | Description | How to Fix |
```

**変更後:**

```markdown
| # | Severity | Category | File | Description | How to Fix | Fix |
```

- `Fix` カラム: `yes` or `no`
  - `yes` = fixer が自動修正すべき finding（= request の `fix: true` に相当）
  - `no` = pre-existing / 設計判断 / 別 issue 扱いの finding（fixer は無視）
- reviewer (agent) が各 finding ごとに判断して出力する
- CLI は `Fix` カラムの値を parse して `fix: true` の finding が 1 件以上あるかを判定に使う

**判定ロジック (`parseResult` 内):**

```
agentVerdict === "approved" AND fixCount >= 1 → verdict = "approved-with-fixes"
agentVerdict === "approved" AND fixCount === 0 → verdict = "approved"
agentVerdict === "needs-fix" → verdict = "needs-fix" (変更なし)
agentVerdict === "escalation" → verdict = "escalation" (変更なし)
```

### D4: CLI 側 score 計算の廃止 — `determineVerdict()` の簡素化

`src/core/step/code-review.ts` の `determineVerdict()` を廃止し、`parseResult` を以下に簡素化:

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

- `parseReviewScores()` の呼び出しを削除（score table は判定材料にしない）
- `parseFindingSeverityCounts()` の呼び出しを削除（severity count での verdict override を廃止）
- `ReviewScores` / `FindingSeverityCounts` の import を削除
- `ParsedStepResult` の `scores` field を返さなくなる（field 自体は型から削除しない — 他 step が使う可能性を残す）

### D5: `parseFixableFindings()` parser の新設

`src/core/parser/review-findings.ts` に `parseFixableFindings(content: string): number` を追加。

Findings table の `Fix` カラムを parse し、`yes` の件数を返す。

**パース仕様:**
1. `## Findings` section を探す
2. table header row から `Fix` カラムの column index を特定
3. data row を走査し、`Fix` カラムが case-insensitive で `yes` の行を count
4. `Fix` カラムが見つからない場合は 0 を返す（= 旧 format との後方互換）

### D6: code-fixer prompt の更新 — `Fix` カラム準拠の修正方針

現行 code-fixer prompt の severity-based ルール:

```
- HIGH severity: 必ず修正
- MEDIUM severity: spec/設計と整合する範囲のみ
- LOW severity: 無視する
```

を、`Fix` カラム準拠に変更:

```
- Fix: yes の finding: すべて修正する
- Fix: no の finding: 無視する（修正不要）
```

= fixer は severity を見ず、`Fix` カラムだけで対象を判定する。reviewer が `Fix: yes` と判断した finding は severity に関わらず全て消化する。

`src/prompts/code-fixer-system.ts` の `CODE_FIXER_BASE` を更新。

### D7: reviewer prompt の更新 — `Fix` カラム出力指示

`src/prompts/code-review-system.ts` と `src/prompts/fragments.ts` の `PIPELINE_RULES` fragment を更新:

1. **Findings Format** に `Fix` カラムを追加
2. **Output Format** example に `Fix` カラムを含める
3. **Fix カラムの判定ガイドライン**を追加:
   - `yes`: この PR で修正すべき finding（実装ミス、仕様未充足等）
   - `no`: pre-existing issue、設計判断、別 scope の issue

**Score table / Scoring section への影響**: 変更なし。prompt 上に残す（agent の思考補助として自由に使える）が、CLI 側が判定材料として使わないことを明記する。

### D8: `approved-with-fixes` 発火時の fixer ループ回数制御

`approved-with-fixes` 由来の fixer は **1 回のみ** 実行する。fixer 完了後は再 review に戻らず delta-spec-validation に進む（D1 の transition table）。

fixer が失敗した場合は既存の escalation パスに乗る（`code-fixer --error→ escalate`）。

ループ回数制御の既存メカニズム（`loopIters` / `fixerIters`）は `code-fixer` の iteration counter を共用するため、`approved-with-fixes` 由来の fixer 実行も counter に加算される。needs-fix loop の途中で approved-with-fixes が挟まることは構造上ない（approved-with-fixes は review loop の最終 iteration でのみ発生）ため、counter 汚染は起きない。

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/state/schema.ts` | `Verdict` union に `"approved-with-fixes"` 追加 |
| `src/core/pipeline/types.ts` | transition table に 2 行追加（`code-review --approved-with-fixes→ code-fixer`, `code-fixer --approved→ delta-spec-validation` with `when` predicate） |
| `src/core/step/code-review.ts` | `determineVerdict()` 廃止、`parseResult()` 簡素化（agent verdict + fixCount で判定） |
| `src/core/parser/review-findings.ts` | `parseFixableFindings()` 追加 |
| `src/prompts/code-review-system.ts` | Output Format に `Fix` カラム追加 |
| `src/prompts/fragments.ts` | `PIPELINE_RULES` の Findings Format に `Fix` カラム追加 |
| `src/prompts/code-fixer-system.ts` | severity-based → `Fix` カラム準拠に修正方針変更 |

## 影響を受ける spec

| Spec | 影響 |
|------|------|
| `pipeline-orchestrator` | transition table に 2 行追加。Verdict union に 1 literal 追加。Requirement 追加が必要 |
| `agent-output-contract` | Findings Format に `Fix` カラム追加（delta spec で拡張） |

## リスクと軽減策

1. **reviewer が `Fix` カラムを出力し忘れるリスク**: `parseFixableFindings()` が 0 を返す → `approved` のまま finish に進む（= 既存挙動と同等）。後方互換で安全側に倒れる
2. **既存 needs-fix loop への regression**: transition table の既存行は変更しない。新規行は `approved-with-fixes` (新 verdict) と `when` predicate でのみ発火するため干渉しない
3. **Score table を agent が出力しなくなるリスク**: CLI が score を判定に使わないため影響なし。prompt から削除しないので agent は自主的に出力可能
