# Cross-Boundary Invariants Review — custom-reviewer-round-context

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## Review Summary

| Category | Count |
|---|---|
| Findings (total) | 1 |
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 0 |
| Observations | 3 |

checked: 18 cross-boundary paths traced  
skipped: 0  
unverified: 0

---

## Iteration 1 所見の対応確認

| F-001 (medium/fixable) | ✅ 修正済み |
|---|---|
| F-002 (low/decision-needed) | → 設計判断 D7 どおり維持（option 1 採用、変更なし） |
| O-001 | → 観測維持（機能的問題なし） |
| O-002 | → 観測維持（機能的問題なし） |

F-001 修正内容（commit 1501188ea）: `deriveOperatorAdjudicationContext` の `decisions` projection に `?? ""` null guard を追加（`title`, `file`, `selectedOption.label`, `consequence`, `rationale` の 5 フィールド）。

---

## Findings

### F-001 [medium / fixable]: `decisions[i].step` が null guard なし — F-001 修正の取りこぼし

**File**: `src/core/step/custom-reviewer-round-context.ts` line 199  

**問題**

コード修正で 5 フィールドに `?? ""` ガードが追加されたが、`step: d.step` だけが漏れた:

```ts
// src/core/step/custom-reviewer-round-context.ts:198-205
const decisions = (state.decisions ?? []).map((d) => ({
  step: d.step,          // ← ?? "" がない
  title: d.finding.title ?? "",
  file: d.finding.file ?? "",
  selectedOption: d.selectedOption.label ?? "",
  consequence: d.selectedOption.consequence ?? "",
  rationale: d.finding.rationale ?? "",
}));
```

`validateJobState` は `decisions` フィールドの存在だけを確認し、エントリ内部の `step` フィールドを型検証しない（pre-existing）。`state.json` が外部編集や planner バグで破損した場合、`d.step = undefined` になりうる。

`buildOperatorAdjudicationBlock` ではこの projection 値を `escapeXml(d.step)` に渡す:

```ts
// src/core/step/custom-reviewer-round-context.ts:160
lines.push(`- [step: ${escapeXml(d.step)}] ${escapeXml(d.title)} (${escapeXml(d.file)})`);
```

`escapeXml(undefined)` は `(undefined).replace(...)` → **TypeError** をスローする。

**伝播経路**

```
buildOperatorAdjudicationBlock(ctx)
  ← buildCustomReviewerMessage()
    ← step.buildMessage(state, stepCtx)          // agent-runner.ts:462 — try/catch なし
      ← this.runner.run(ctx)
        ← executor.produce()                     // executor.ts:353-362 — ここで捕捉
          → { kind: "halt" }                     // → awaiting-resume (recoverable)
```

`buildStepContext` の best-effort try/catch は `prepareRoundContext` のみを保護する（step-context-builder.ts:153-159）。`buildMessage` は別の実行フローで保護されていないが、executor の outer try/catch が halt に正規化するため **データ損失はない**。operator は awaiting-resume から再開できる。ただし、混乱するエラーで止まる。

**他フィールドとの対称性**

`adjudications[i].step` は `validateJobState` で string 検証済みのため安全。`decisions[i].step` だけがガード漏れで残っている。

**修正方法**

```ts
step: d.step ?? "",
```

1 文字の追加で iteration 1 F-001 修正と完全に対称になる。

---

## Observations

### O-001 [low]: 最初の再開 unit での operator テキスト二重注入（iteration 1 継続）

`job resume --prompt "text"` 後に custom reviewer が最初の再開 unit として実行される場合:
1. `<resume-context>text</resume-context>` — pipeline.ts D4 の one-shot 注入
2. `<operator-adjudication>...[step:X] text...</operator-adjudication>` — 永続化 adjudication からの注入

同一テキストを reviewer が二回読む。機能的な問題なし（冗長な context）。

---

### O-002 [low]: `<prior-round-context>` タグ名が spec-review と共用（iteration 1 継続）

`buildCustomReviewerPriorRoundBlock` と `buildPriorRoundContextBlock`（spec-review 用）が共に `<prior-round-context>` タグを生成する。独立した agent session での使用のため実際の衝突はない。

---

### O-003 [low]: `<prior-round-context>` 内の findings テキストが XML エスケープされない

**File**: `src/core/step/custom-reviewer-round-context.ts` line 91

```ts
lines.push(`- [${f.severity}] ${f.title} (${f.resolution}) — ${f.file}`);
```

`f.title` に `</prior-round-context>` が含まれると LLM がブロック境界を誤認する可能性がある。ただし:
- 同パターンは `prior-round-context.ts`（spec-review）でも採用されており、既存 codebase の一貫した設計選択
- findings は LLM が生成したテキスト（operator フリー入力ではない）でインジェクションリスクは低い
- `<operator-adjudication>` ブロックは XML エスケープあり（operator フリーテキストはより高リスクなため）

既存パターンとの整合あり。必要に応じて spec-review と同時に対処する。

---

## Traced Cross-Boundary Paths

| # | Path | Verdict |
|---|---|---|
| 1 | F-001 fix: `d.finding.title ?? ""` — 5 フィールド null guard 追加確認 | ✅ 修正済み |
| 2 | `d.step` — null guard なし | ⚠️ F-001 参照 |
| 3 | `appendOperatorAdjudication` シグネチャ修正（`state: JobState`） — operator-adjudication-schema.test.ts の動的型キャストとの非干渉確認 | ✅ テストは runtime で正常動作 |
| 4 | `transitionJob → appendOperatorAdjudication → stateToWrite → persist` の順序 | ✅ operatorAdjudications 保持 |
| 5 | `appendSynthesizedCommit(updatedState, oid)` spread — `operatorAdjudications` 保持確認 | ✅ spread で保持 |
| 6 | adopt-commits ループでの spread — `operatorAdjudications` 保持確認 | ✅ spread で保持 |
| 7 | `transitionJob` spread — `operatorAdjudications` 保持確認 | ✅ spread で保持 |
| 8 | `pushStepResult` spread — `operatorAdjudications` 保持確認 | ✅ `{ ...state, steps: ..., updatedAt: ... }` |
| 9 | `stateToStateJson` — `operatorAdjudications` が `rest` (history/steps 以外) に含まれて state.json に書き出される | ✅ |
| 10 | no-worktree resume path での persist — `stateToWrite` が `operatorAdjudications` を含む | ✅ |
| 11 | `reloadJobState` スキップ条件: resume では `existingWorktreePath !== undefined` | ✅ in-memory state が adjudications を保持 |
| 12 | beforeExit handler: disk から state を再読込し `transitionJob` → spread で `operatorAdjudications` 保持 | ✅ |
| 13 | `prepareRoundContext` → `nextIteration(state, snapshot.name)` と `buildMessage` → `nextIteration(state, snapshot.name)` が同一 state を受け取る | ✅ 同一 snapshot |
| 14 | `parallel-review-round.ts` fan-out で `state` を複数 reviewer に共有: read-only アクセス、race なし | ✅ |
| 15 | `depsWithoutResume` が strip するのは `deps.resumePrompt`/`deps.resumeContext` のみ: `state.operatorAdjudications` は不変 | ✅ |
| 16 | `commitRound` の state fold で spread 一貫使用 — `operatorAdjudications` 保持 | ✅ |
| 17 | `validateJobState` — `operatorAdjudications` 検証ブロック追加確認（text/step/recordedAt が string であること） | ✅ |
| 18 | `decisions.step` — `validateJobState` 内部検証なし（pre-existing）、null guard 漏れ | ⚠️ F-001 参照 |
