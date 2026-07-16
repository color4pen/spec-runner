# Regression Gate Result — bite-evidence-forward (Iteration 1)

- **verdict**: approved
- **iteration**: 001

## 検証対象

`git diff main...HEAD` で確認した全変更に対して、ledger の 3 件（F-01 medium / F-02 low / F-03 low）が現在コードで退行していないかを確認した。

---

## Ledger 検証結果

### F-01 [MEDIUM]: `verification.commands` 設定時に forward 型 job でも無条件 strategy-deferred

**ファイル**: `src/core/runtime/local.ts:902–907`

```typescript
if (config.verification?.commands && (config.verification.commands as unknown[]).length > 0) {
  return {
    kind: "unavailable",
    reason: "Cannot scope custom verification.commands to individual test files",
  };
}
```

**確認結果**: 挙動は変更なし。`runTestsAtCommit` は `verification.commands` 設定時に `unavailable` を返し、`gate.ts:162–168` でこれを受けて `strategy-deferred` を返す。  
`cross-boundary-invariants` レビューアーが "reason は `bite-evidence-result.md` に記録済み、design.md Open Questions に明文化" として **approved** 済み。  
退行なし。

---

### F-02 [LOW]: re-loop 時 `captureHeadSha` が null を返すと旧 `biteEvidence` が state に残留

**ファイル**: `src/core/step/commit-orchestrator.ts:336–338`

```typescript
if (completion.biteEvidence && completion.biteEvidence.length > 0) {
  s = { ...s, biteEvidence: completion.biteEvidence };
}
```

**確認結果**: 条件は変更なし。`captureHeadSha` が null を返す経路（`strategy-deferred` → `records:[]` → length = 0）では旧 biteEvidence が残留する。  
`cross-boundary-invariants` レビューアーが "確率は極低・機能的退行なし・audit 用途のみ" として **approved** 済み。  
退行なし。

---

### F-03 [LOW]: `BiteEvidenceStep.reads()` に `events.jsonl` が未宣言

**ファイル**: `src/core/step/bite-evidence/step.ts:108–113`

```typescript
reads(state: JobState, deps: StepDeps): IoRef[] {
  return [
    { path: `${changeFolderPath(deps.slug)}/test-cases.md`, required: false },
    { path: ".", artifact: "gitState" },
  ];
},
```

**確認結果**: `events.jsonl` は `reads()` に未宣言のまま。`run()` 内で tamper check のために読むが、lineage 不在時は `inconclusive` にフォールバックするため実行時影響なし。  
`cross-boundary-invariants` レビューアーが "observability のみの問題" として **approved** 済み。  
退行なし。

---

## 総合評価

| Finding | 状態 | 退行 |
|---------|------|------|
| F-01 (medium): verification.commands → strategy-deferred | 承認済み挙動のまま | なし |
| F-02 (low): stale biteEvidence in re-loop | 承認済み挙動のまま | なし |
| F-03 (low): events.jsonl 未宣言 | 承認済み挙動のまま | なし |

3 件すべてが `cross-boundary-invariants` レビューアー承認時点のコードと同一状態。コード修正が行われた findings はなく、退行もない。
