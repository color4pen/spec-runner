# Regression Gate Result — spec-observation-autofix (iteration 1)

## Evidence

### [HIGH] TC-CONFRT-07 が conformance reverification 経路でなく observation-pass 経路を無言で通過している

**Status: FIXED ✅**

`tests/unit/core/pipeline/pipeline.conformance-routing.test.ts` を確認。

- `appendStepResult` に `opts.ts` / `opts.findings` パラメータが追加された（lines 116–147）。
- TC-CONFRT-07 内の conformance 呼び出し（line 543–546）が `ts: "2026-01-01T01:00:00.000Z"` と `findings` を使用しており、spec-review の既定タイムスタンプ `"2026-01-01T00:00:00.000Z"` より後になっている。これで `getConformanceFixContext` の recency check が null を返さず、`specFixerForwardsToTestGen` が正しく false を返す。
- `expect(specReviewCallCount).toBe(4)` が line 564 に追加され、spec-fixer#3 が test-case-gen でなく spec-review reverification に戻ることを明示的に assert している。

### [MEDIUM] specFixerForwardsToTestGen の conformance guard が同一タイムスタンプ state で false negative を生じる

**Status: FIXED ✅**

`src/core/pipeline/spec-observation.ts` lines 61–73 と `src/core/step/fixer-helpers.ts` の Step 3 / Step 4 コメントを確認。

- `spec-observation.ts` の `specFixerForwardsToTestGen` 関数内に "LOAD-BEARING" コメントが追加され、`getConformanceFixContext` の `>=` recency check が load-bearing であること、production では常に成立するが test fixture は ordered timestamps + toolResult.findings の両方が必要であることを明記している（lines 62–73）。
- `fixer-helpers.ts` の Step 3 に "LOAD-BEARING: the inclusive `>=` is intentional" コメント、Step 4 に "NOTE: callers that use the non-null return value solely as a boolean guard" コメントが追加され、同一タイムスタンプで false null が返る条件を文書化している。

### [LOW] TC-CONFRT-07 記述が実装より保守的で stale

**Status: NOT FIXED ❌ — Regression present**

`specrunner/changes/spec-observation-autofix/implementation-notes.md` lines 45–53 を確認。

ファイルは git diff において新規追加（initial commit が `implementation-notes.md` を作成）で、その後 code-fixer commit（7ce103215）が TC-CONFRT-07 テストを修正したが、`implementation-notes.md` は更新されなかった。

**現在のノートが記述する内容（事実と乖離）**:
- 「すべてのステップに同一タイムスタンプ（`'2026-01-01T00:00:00.000Z'`）を使用している」→ conformance は現在 `'2026-01-01T01:00:00.000Z'` を使用。
- 「最終アサーション（specFixerCallCount===3 / awaiting-archive）は引き続き通過するためテストは赤くならないが、本来のフローは検証されなくなる」→ `expect(specReviewCallCount).toBe(4)` が追加され、reverification フローは現在 TC-CONFRT-07 自体で検証されている。
- 「T-06 の新規テストが proper timestamps を用いた reverification 不変条件をカバー」→ TC-CONFRT-07 自体もカバーしている。

将来の読者が「TC-CONFRT-07 は同一タイムスタンプのまま、reverification は T-06 のみでカバー」と誤読するリスクが残存している。
