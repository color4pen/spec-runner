# Code Review: finish-hint-actionable-fallback — Iteration 1

- **verdict**: approved
- **date**: 2026-05-20
- **reviewer**: code-review agent

---

## Summary

バグ修正の実装は正確。`specrunner cancel` (未実装) への誘導を2箇所とも `specrunner rm <jobId>` (実装済み) に書き換え、structural regression guard も追加されている。

---

## Findings

### [LOW] TC-01 / TC-02 / TC-05 の hint 文字列を直接 assert するテストが存在しない

**Location**: `tests/hint-command-existence.test.ts`

**Observation**:  
test-cases.md の must TC のうち TC-01、TC-02、TC-05 は「スローされた `SpecRunnerError` の `.hint` プロパティが特定の文字列と一致する」ことを要求している。

- TC-01: `assertJobFinishable(failed)` → `hint === "Run 'specrunner rm <jobId>' to remove the failed job."`
- TC-02: `assertJobFinishable(terminated)` → `hint === "Run 'specrunner rm <jobId>' to remove the terminated job."`
- TC-05: `pollTimeoutError(...)` → `.hint` が正確な文字列と一致する

`hint-command-existence.test.ts` は `/specrunner (\w+)/g` で抽出した verb が `COMMANDS` registry に存在することを検証しているが、`assertJobFinishable` 自体は呼び出していない。`STATUS_HINTS` オブジェクトを直接参照するため、`assertJobFinishable` がその hint を実際に `SpecRunnerError.hint` に渡しているかは未検証。

**Impact**:  
現状のコード (`job-state-update.ts:31`) は正しく `STATUS_HINTS[state.status]` を `hint` 引数として渡している。ただし将来 `assertJobFinishable` の内部ロジックが変更された場合（例: hint の加工、デフォルト値の差し替え）に、実際に throw される hint が変わっても検知できない。

**Recommendation** (blocking ではない):  
```ts
// tests/finish-job-state.test.ts に追記する例
it("failed job hint points to rm", async () => {
  const job = await makeJob("failed");
  const state = await loadJobState(job.jobId);
  let caught: SpecRunnerError | undefined;
  try { assertJobFinishable(state); } catch (e) { caught = e as SpecRunnerError; }
  expect(caught?.hint).toBe("Run 'specrunner rm <jobId>' to remove the failed job.");
});
```

TC-03/04/06 (cancel が含まれない) は TC-07/08 で間接カバー済み (cancel は COMMANDS に存在しないため)。

---

### [INFO] verification-result.md の「10/10 must TCs covered」は過大評価

`test-coverage: 10/10` の主張は TC-07/08/11/12 のみ直接カバーされており、TC-01/02/05 は間接的なカバーに留まる。次の iteration で verification phase の coverage チェックロジックを見直す余地がある。ただし今回の修正そのものには影響なし。

---

## Acceptance Criteria チェック

| 基準 | 状態 |
|------|------|
| `STATUS_HINTS["failed"]` が `specrunner rm <jobId>` を案内 | ✅ |
| `STATUS_HINTS["terminated"]` が `specrunner rm <jobId>` を案内 | ✅ |
| `pollTimeoutError` hint が `specrunner rm <jobId>` を案内 | ✅ |
| hint 内コマンドが COMMANDS registry に存在することを検証するテスト追加 | ✅ |
| hint を直接 assert している既存テストが新 hint で更新されている | ✅ (該当なし — 既存は `.toThrow(/failed/)` で message を検査) |
| `bun run typecheck && bun run test` が green | ✅ (verification-result.md 確認) |

---

## 総評

バグ修正の本質（未実装コマンドへの誘導を排除）は完全に達成されている。`hint-command-existence.test.ts` は将来の同型バグに対する構造的な防護として適切に設計されている。LOW finding の未直接テストは次サイクルで追記可能だが、今回のスコープを blocking するものではない。
