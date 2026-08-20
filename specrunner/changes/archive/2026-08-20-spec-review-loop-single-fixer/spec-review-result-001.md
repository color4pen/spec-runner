# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

1. **request.md ↔ spec.md 対応**: 4 要求（write scope 拡張・loop 除外・resume 無変更・observation auto-fix 維持）がすべて spec.md の Requirement にマップされていることを確認。
2. **spec.md 記法準拠**: 全 Requirement に SHALL/MUST が含まれ、各 Requirement に Given/When/Then 形式の Scenario が存在することを確認。
3. **design.md の技術的正確性**: D1〜D5 の決定が現状コード（`canon-write-scope.ts`, `canon-escalation.ts`, `spec-observation.ts`, `types.ts`, `registry.ts`, `pipeline.ts`）の実態と対応していることをファイル読み込みで確認。行番号はわずかにずれているが構造的には正確。
4. **tasks.md の網羅性 (T-01〜T-09)**: 主要な変更箇所（`writableByFixer`, `writes()`, `spec-fixer-system.ts`, `judge-verdict.ts`, `canon-escalation.ts`, `step-completion.ts`, `spec-observation.ts`, `types.ts`, `registry.ts`, `pipeline.ts`, `run.ts`, `test-case-gen.ts`）がタスクで列挙されていることを確認。
5. **受け入れ基準 ↔ test-cases.md 対応**: 7 つの受け入れ基準がすべて TC-001〜TC-007 にマップされていることを確認。
6. **T-08 更新対象テストの列挙検証**: T-08 が明記する 5 ファイル（`registry-invariants.test.ts`, `spec-fixer-tasks-md-writable.test.ts`, `spec-observation-autofix.test.ts`, `test-case-gen-design-phase.test.ts`, `transition-when.test.ts`）の実在を確認。削除シンボル（`testCaseGenEffectiveFixer`, `specReviewNeedsFixIsTcOnly`, `specFixerNeedsFixForward`, `loopIntermediateSteps`）を参照するテストファイルを grep で列挙し T-08 記述と照合した。
7. **既存テストへの影響調査**: `src/core/step/__tests__/spec-review-fixer-routing.test.ts` を読み込み、TC-013 が medium test-cases.md 宛 finding に対して "needs-fix" を期待していること、および `makeCanonScope()` が hardcoded mock であり T-01/T-02 実装後に壊れることを確認。
8. **セキュリティ観点**: write scope 拡張が `writableByFixer` と `writes()` の drift-guard（TC-029）で二重検証される構造を確認。operator 修正保護は pipeline routing の simplification で実現され、追加認証・権限機構への依存はない。injection・broken access control リスクは変更範囲に存在しないことを確認。

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実行（実装前のため）
- T-07 統合テスト（#1015 の歯）の mock spec-fixer 実装詳細（設計意図は明確だが、テストコード自体は未実装）

## Findings 詳細

### Finding 1 (HIGH): `src/core/step/__tests__/spec-review-fixer-routing.test.ts` が T-08 の更新対象に含まれていない

**関連 tasks.md**: T-08 の更新対象ファイル列挙

このファイル（旧 `spec-review-fixer-routing` 変更由来）の TC-013（lines 941〜982）は以下を pin している。

```typescript
// line 949: medium test-cases.md 宛 finding → "needs-fix" (TC-routable 旧挙動)
const verdict = deriveSpecReviewVerdict!(findings, true, undefined, makeCanonScope());
expect(verdict).toBe("needs-fix");

// line 980: deriveStepCompletion でも同様
expect(completion.verdict).toBe("needs-fix");
```

`makeCanonScope()`（lines 105〜110）は hardcoded mock であり、spec-fixer writable = `{spec.md, design.md, tasks.md}`（test-cases.md なし）で固定されている。

**T-02 適用後（4b 分岐削除）、この mock scope で `deriveSpecReviewVerdict` を呼ぶと:**
- test-cases.md は `specRoutableFiles` に含まれない（spec-fixer writable 外）
- 4a チェック: `!specRoutableFiles.has(f.file)` → true → **"escalation"** が返る
- 期待値 `"needs-fix"` に対して実際 `"escalation"` → **テスト失敗**

このファイルは削除シンボル（`testCaseGenEffectiveFixer` 等）を直接 import していないため、T-08 の「削除シンボルを grep で確認」チェックにも引っかからない。

**必要な修正:**
1. `makeCanonScope()` の spec-fixer エントリに `TEST_CASES_MD` を追加
2. TC-013 line 949: `expect(verdict).toBe("needs-fix")` → `"approved"`（medium → observation auto-fix）
3. TC-013 lines 956〜982: `deriveStepCompletion` テストの期待値も `"approved"` に更新
4. TC-021 line 1281 のコメント "writable by test-case-gen" → "writable by spec-fixer"（アサーションは引き続き通過するが comment が stale になる）

---

### Finding 2 (MEDIUM): `src/prompts/rules.ts` が T-01 の更新対象に含まれていない

**関連 tasks.md**: T-01

`src/prompts/rules.ts`（line 48）は pipeline 実行時に各 change folder へ `rules.md` としてコピーされる source of truth:

```
| spec-fixer | change folder 内の spec.md, design.md, tasks.md | source code |
```

T-01 は `spec-fixer-system.ts` の write-set を test-cases.md 含む形に更新するが、`rules.ts` の更新は列挙されていない。spec-fixer agent は実行開始時に rules.md を Read tool で読む（spec-fixer-system.ts 自身の指示）。system prompt（test-cases.md への targeted 修正を許可）と rules.md（test-cases.md への書き込みを暗示的に禁止）が矛盾する状態が生じる。

**必要な修正**: T-01 に `src/prompts/rules.ts` line 48 の spec-fixer 行を `spec.md, design.md, tasks.md, test-cases.md` に更新する作業を追加。

---

### Finding 3 (LOW): `spec-observation.ts` の JSDoc コメントが T-01 更新対象に含まれていない

**関連 tasks.md**: T-01

`src/core/pipeline/spec-observation.ts` lines 29〜30:
```typescript
 * "Routable" means the finding is on a spec-fixer-writable canon path
 * (spec.md, design.md, tasks.md). Non-canon fixable findings and unroutable
```

T-01 で spec-fixer writable に test-cases.md が追加されるが、このコメントは更新対象に含まれていない。機能的影響はないが誤解を招く。T-01 の doc コメント更新リストに `spec-observation.ts:29-30` を追加することを推奨する。
