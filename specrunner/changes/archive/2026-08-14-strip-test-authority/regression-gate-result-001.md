# Regression Gate Result

## Summary

3 findings verified. All 3 confirmed fixed. No regressions detected.

---

## Finding 1: [MEDIUM] Requirement 1 が初回 message 非 red 義務を require するが対応 Scenario が存在しない

**File**: specrunner/changes/strip-test-authority/spec.md:14
**Status**: FIXED

**Evidence**: spec.md lines 21–26 now contain the Scenario "初回 message が red 確認を課さない":

```
#### Scenario: 初回 message が red 確認を課さない

**Given** `buildTestMaterializeInitialMessage` が生成する初回 user message を取得する
**When** message の内容を検査する
**Then** 「confirm they fail (red)」「red を確認して」に相当する red 強制の記述が含まれない
**And** 新規テストを実行し観測結果を記録してから完了する旨が含まれる
```

design.md lines 129–130 also explicitly call out the corresponding new test for `buildTestMaterializeInitialMessage`.

---

## Finding 2: [LOW] D5 新規 gate テストに request type の明示がない

**File**: specrunner/changes/strip-test-authority/design.md:128
**Status**: FIXED

**Evidence**: design.md lines 133–134 now explicitly state request type for both new gate tests:

> state の request type は forward type(`bug-fix` または `new-feature`)を使用すること(gate step 1 で非 forward type を strategy-deferred にするため、汚染検知コードに到達する前に偶然 deferral が成立するのを避ける)
> state の request type も forward type を使用すること(上記と同じ理由)。

Confirmed in the test implementation: both TC-007 (line 745) and TC-008 (line 835) in `gate.test.ts` call `makeState("bug-fix", ...)`.

---

## Finding 3: [MEDIUM] Evidence 節に「書き直し」が残存し Method 節の指示と矛盾する

**File**: src/prompts/test-materialize-system.ts:113
**Status**: FIXED

**Evidence**: Line 113 of `src/prompts/test-materialize-system.ts` now reads:

```
- 期待と観測の不一致があればその内容と考えられる理由（既存実装が要求を満たしている / 分類誤り / 見張れていない疑い等）
```

The previous `（書き直し / 再分類の根拠）` language has been replaced with the recommended wording. The Method section (line 98) and Evidence section (line 113) are now consistent: both instruct recording reasons rather than rewriting tests.
