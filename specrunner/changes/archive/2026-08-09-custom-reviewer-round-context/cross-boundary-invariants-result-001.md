# Cross-Boundary Invariants Review — custom-reviewer-round-context

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## Review Summary

| Category | Count |
|---|---|
| Findings (total) | 2 |
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 (decision-needed) |
| Observations | 2 |

checked: 14 cross-boundary paths traced  
skipped: 0  
unverified: 0

---

## Findings

### F-001 [medium / fixable]: `buildOperatorAdjudicationBlock` が `DecisionRecord` フィールドを null ガードなしで `escapeXml` に渡す

**File**: `src/core/step/custom-reviewer-round-context.ts` lines 160–161, 200–203

**問題**

`deriveOperatorAdjudicationContext` は `state.decisions` の各エントリを次のように projection する:

```ts
// src/core/step/custom-reviewer-round-context.ts:200-203
title: d.finding.title,
file: d.finding.file,
selectedOption: d.selectedOption.label,
consequence: d.selectedOption.consequence,
```

`validateJobState`（`src/state/schema/operations.ts`）は `state.decisions` フィールドの存在チェックのみ行い、エントリ内部フィールド（`finding.title`, `finding.file`, `selectedOption.label`, `selectedOption.consequence`）の型検証を行っていない。これらのフィールドはインターフェース上は `string` 必須だが、実行時 JSON では欠落しうる（プランナーのバグや state.json の外部編集）。

projection 後の値が `undefined` のまま `buildOperatorAdjudicationBlock` に渡ると:

```ts
// src/core/step/custom-reviewer-round-context.ts:160-161
lines.push(`- [step: ${escapeXml(d.step)}] ${escapeXml(d.title)} (${escapeXml(d.file)})`);
lines.push(`  選択: ${escapeXml(d.selectedOption)} — ${escapeXml(d.consequence)}`);
```

`escapeXml(undefined)` が `undefined.replace(...)` で TypeError をスローする。

**既存コードとの不整合**

同じ `state.decisions` を読む `decision-ledger.ts`（`computeFindingKey`）は同パターンを防御的に扱っている:

```ts
// src/core/decision/decision-ledger.ts:33-37
const file = finding.file ?? "";
const title = normalizeText(finding.title ?? "");
const rationale = normalizeText(finding.rationale ?? "");
```

新コードはこの規律に従っていない。

**伝播経路**

`buildOperatorAdjudicationBlock` は `buildCustomReviewerMessage` 内から呼ばれ、  
`buildMessage(state, deps)` → `adapter (agent-runner.ts:462)`:

```ts
const baseMessage = step.buildMessage(state, stepCtx);  // try/catch なし
```

`buildStepContext` の best-effort try/catch は `prepareRoundContext` を保護するが、  
`buildMessage` 呼び出しは別の実行フローで保護されていない。  
`prepareRoundContext` が成功し `operatorAdjudicationContext` が注入済みのとき、  
`buildMessage` 内の TypeError は捕捉されずステップがクラッシュする。

**修正方法**

`deriveOperatorAdjudicationContext` の projection を defensive に変更する:

```ts
title: d.finding.title ?? "",
file: d.finding.file ?? "",
selectedOption: d.selectedOption.label ?? "",
consequence: d.selectedOption.consequence ?? "",
rationale: d.finding.rationale,  // 既存の if (d.rationale) ガードで対処済み
```

---

### F-002 [low / decision-needed]: `state.decisions` を reviewer 単位で絞り込まないことが rebuttal プロトコルのスコープを超拡大する

**File**: `src/core/step/custom-reviewer-round-context.ts` line 198–206  
**Design doc**: `design.md` D7 / Open Questions

**問題**

`deriveOperatorAdjudicationContext` は `state.decisions` から**全 step** の decision を projection する。対象 step には spec-review, code-review, 他の custom reviewer の decisions が含まれる。注入される `<operator-adjudication>` ブロックは:

```
裁定済み事項を再指摘する場合は、裁定 rationale への反論を rationale に明示してください。
反論なき再指摘は escalation にカウントされます。
```

というプロトコルを含む。

"security-review" custom reviewer が "spec-review" の設計判断 decision（アーキテクチャ変更は却下）を受け取り、セキュリティ視点から同一ファイルを指摘しようとした場合、この reviewer は「反論を書かなければ escalation」という圧力を受ける——しかし元の decision はその reviewer に向けたものではない。

**既存の境界条件**

旧来の `decisions` フィールドは `decision-ledger.ts` 内でのみ消費され、reviewer の domain 判断に干渉しなかった。本変更は `decisions` を reviewer の prompt に注入する初の使用箇所となり、scope 前提を拡大している。

**設計上の対応**

design.md D7 は「過剰スコープを避け初回は全注入とし、ノイズが問題化したら reviewer 単位フィルタを検討」と明示しており、意図した判断である。

**判断が必要な選択肢**

1. **現状維持（全 decisions を注入）**: 設計判断（D7）どおり。他 reviewer 宛の decisions も step ラベル付きで見える。初回は acceptable とし、問題が観測されたら F-003 として別 request に切り出す。
2. **reviewer 単位フィルタを今回から適用**: `d.step === reviewerName` で絞り込む。scope が明確になるが、要件外の追加実装となり今回の受け入れ基準を超える。

---

## Observations

### O-001 [low]: 最初の再開 unit で operator テキストが二重注入される

**File**: `src/core/step/custom-reviewer.ts` buildMessage / `src/adapter/claude-code/agent-runner.ts:471-473`

`job resume --prompt "text"` 後に custom reviewer (iteration ≥ 2) が最初の再開 unit として実行される場合、その unit には:

1. `<resume-context>text</resume-context>` — pipeline.ts D4 の one-shot 注入
2. `<operator-adjudication>...[step:X] text...</operator-adjudication>` — 永続化された `operatorAdjudications[0].text` からの注入

が両方含まれる。同じ operator テキストを reviewer が二回読む。機能的な問題はなく（冗長な context）、design が意図した動作（one-shot は即時 guidance、persistent block は長期参照）。マルファンクションにはならない。

---

### O-002 [low]: `<prior-round-context>` タグ名が spec-review と共用される

**File**: `src/core/step/custom-reviewer-round-context.ts:79`, `src/core/step/prior-round-context.ts:66`

`buildCustomReviewerPriorRoundBlock` と `buildPriorRoundContextBlock`（spec-review 用）は両方 `<prior-round-context>` タグを生成する。両者は独立した agent session で実行されるため実際の衝突は起きない。  
将来、何らかの reason でメッセージが結合される場合はタグ名の曖昧性が生じる可能性があるが、現状アーキテクチャでは問題なし。

---

## Traced Cross-Boundary Paths

| # | Path | Verdict |
|---|---|---|
| 1 | `stateToStateJson` spread → `operatorAdjudications` は `rest` に含まれ state.json に書き出される | ✅ 不変条件保持 |
| 2 | `validateJobState` backward compat → `operatorAdjudications` 不在は空 ledger 扱い | ✅ 不変条件保持 |
| 3 | resume.ts → `appendOperatorAdjudication(transitioned, ...)` → `stateToWrite` → `persist` | ✅ 永続化経路正常 |
| 4 | resume path での `reloadJobState` スキップ (`existingWorktreePath !== undefined`) → in-memory state に `operatorAdjudications` 含む | ✅ pipeline が adjudications を受け取る |
| 5 | 後続の `appendSynthesizedCommit` / `transitionJob` が spread でコピー → `operatorAdjudications` 保持 | ✅ state mutation で消えない |
| 6 | `buildStepContext` step 8 の best-effort try/catch → `prepareRoundContext` 失敗時は degrade | ✅ `buildMessage` は別フロー（保護外） |
| 7 | `parallel-review-round.ts` fan-out: 複数 reviewer が同一 `state` snapshot を読む | ✅ read-only 並列アクセス、race なし |
| 8 | `resolveCodeFixerRounds` → `STEP_NAMES.CODE_FIXER` のみ対象、custom reviewer ごとに endedAt で filter | ✅ timing invariant 保持 |
| 9 | `getLatestJudgeFindings(state, reviewerName)` が reviewer 固有 step 名で lookup | ✅ 異なる reviewer 間で名前衝突なし |
| 10 | `decision-ledger.ts` の verdict 抑制は引き続き独立して動作 | ✅ 注入と抑制が非干渉 |
| 11 | `deriveOperatorAdjudicationContext` が pure function → `prepareRoundContext` の try/catch で保護 | ✅（ただし `d.finding.title` へのアクセスが undefined の場合 TypeError → F-001 参照） |
| 12 | `buildOperatorAdjudicationBlock` が `buildMessage` 内から呼ばれる → try/catch なし | ⚠️ F-001 参照 |
| 13 | no-worktree path: `noWorktreeStore.persist(stateToWrite)` で `operatorAdjudications` 書き出し | ✅ noWorktree 経路も正常 |
| 14 | `decisions` フィールドの `validateJobState` 検証なし → malformed entry が素通りする | ⚠️ F-001 の前提 |
