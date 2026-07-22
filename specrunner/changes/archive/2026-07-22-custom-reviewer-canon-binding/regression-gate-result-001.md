# Regression Gate — custom-reviewer-canon-binding iteration 001

**Branch**: change/custom-reviewer-canon-binding-65199b12  
**Ledger size**: 5 items  
**Checked**: 5 / Skipped: 0 / Unverified: 0

---

## Verification Method

- `git diff main...HEAD --stat` で変更ファイル一覧を取得
- 各 finding の対象ファイルを直接 Read して修正の有無を確認
- `parallel-review-round-invalidation.test.ts` は diff 出力なし（`git diff main...HEAD -- <file>` が空）ことを確認

---

## Finding-by-Finding Evidence

### F-1 [LOW] excludeChangeFolderPaths に @deprecated 注釈がない
**File**: `src/core/pipeline/round-git-scope.ts` line 37  
**Expected**: `@deprecated Use excludePipelineManagedChangePaths instead.` 等の JSDoc が追加されている  
**Observed**: 修正なし。`excludeChangeFolderPaths` の JSDoc に `@deprecated` 行は存在しない。`git diff main...HEAD` で同ファイルを確認すると、diff は新関数 `excludePipelineManagedChangePaths` の追加のみ。旧関数の JSDoc は変更されていない。  
**Verdict**: **REGRESSION** — 修正が適用されていない

---

### F-2 [LOW] state.error の 'sticky' 挙動がスキーマ層にドキュメント化されていない
**File**: `src/state/helpers.ts` line 117  
**Expected**: `pushStepResult` の JSDoc または `JobState` スキーマの `error` フィールドに「step 成功で自動クリアされない」旨の記述が追加されている  
**Observed**: `git diff main...HEAD -- src/state/helpers.ts` が空（ファイル変更なし）。`pushStepResult` の JSDoc（lines 109–116）は変更前のまま。`src/state/schema/types.ts` の `error: ErrorInfo | null`（line 391）にも sticky 挙動の説明なし。  
**Note**: `pipeline.ts` lines 388–391 には既存コメントがあるが、「なぜ消えないか（`pushStepResult` が `...state` スプレッドで `state.error` をクリアしない）」はどのスキーマ層にも記載されていない。  
**Verdict**: **REGRESSION** — 修正が適用されていない

---

### F-3 [MEDIUM] excludeChangeFolderPaths still exported alongside replacement
**File**: `src/core/pipeline/round-git-scope.ts` line 37  
**Expected**: 旧関数が `@deprecated` で明示されるか、または old function を削除して old test を新関数に切り替え、live API の二重存在を解消している  
**Observed**: 両関数が依然として export されている（lines 37–41: `excludeChangeFolderPaths`、lines 69–78: `excludePipelineManagedChangePaths`）。`@deprecated` 注釈なし。`round-git-scope.test.ts` は旧関数を引き続き import・テスト（line 16）。  
**Verdict**: **REGRESSION** — 修正が適用されていない。import autocomplete が旧関数を選択した場合、正典文書が sourceTouched から除外され D5 invalidation-diff 経路が無効化されるリスクが継続している

---

### F-4 [MEDIUM] Req 4 test description — "always-activate is always invalidated even when sourceTouched is empty" は real runtime では不成立
**File**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` lines 400–403, 429  
**Expected**: テスト説明の更新（digestArtifacts 非存在の legacy path テストである旨の明記）および real runtime 向けテスト（always-activate + digestArtifacts + findings-only diff → executor NOT called）の追加  
**Observed**: `git diff main...HEAD -- src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` が空（ファイル変更なし）。  
- Line 400–403 コメント: "is always invalidated, even when sourceTouched is empty after filtering" — 変更なし
- Line 429: "// Always-activate: even empty sourceTouched triggers invalidation → executor IS called" — 変更なし
- 新ファイル `parallel-review-round-canon.test.ts` に always-activate + real runtime シナリオは含まれていない  
**Confirmation**: `parallel-review-round.ts` lines 172–174 のコメントは「Req 4 tests は legacy path（digestArtifacts なし）を通る」と明記しているが、テスト側は旧不変条件を主張したまま。新しいカバレッジは追加されていない。  
**Verdict**: **REGRESSION** — 修正が適用されていない。テスト説明が real runtime の挙動と齟齬したままであり、"always-activate reviewer は sourceTouched が空でも常に再走する" という誤った不変条件を文書化し続けている

---

### F-5 [MEDIUM] Req 2a test description — "change-folder-path-only diff does not invalidate" は pipeline output のみに真
**File**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` lines 248–251  
**Expected**: テスト説明の更新（"pipeline-output-only diff" への修正）。正典文書パスは新フィルタで保持され broad activation を持つ reviewer を invalidate することを明記するか、その挙動を別テストでカバーする  
**Observed**: `git diff main...HEAD` でファイル変更なし。  
- Line 248–250 コメント: "After excludeChangeFolderPaths, sourceTouched is empty → not activated → NOT re-run" — 旧関数名のままで変更なし
- Line 253 describe 文: "change-folder-only diff does not invalidate broad-activation reviewer" — 変更なし  
**Verdict**: **REGRESSION** — 修正が適用されていない。テスト説明が「change-folder-only diff は broad-activation reviewer を invalidate しない」と断言しているが、正典文書（design.md 等）が broad activation path に一致する場合は invalidate されるという新しい挙動がカバーされていない

---

## Summary

| # | Original Severity | File | Fix Present? |
|---|------------------|------|--------------|
| F-1 | LOW | round-git-scope.ts:37 | NO |
| F-2 | LOW | helpers.ts:117 | NO |
| F-3 | MEDIUM | round-git-scope.ts:37 | NO |
| F-4 | MEDIUM | parallel-review-round-invalidation.test.ts:400 | NO |
| F-5 | MEDIUM | parallel-review-round-invalidation.test.ts:248 | NO |

全 5 件の修正が適用されていない。対象ファイルのうち `src/state/helpers.ts` および `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` は本ブランチで一切変更されていない。`src/core/pipeline/round-git-scope.ts` は変更されているが、旧関数への @deprecated 追加は含まれない。
