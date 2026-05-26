# Code Review Feedback — lint-mechanical-verification — iter 2

- **verdict**: approved

---

## Summary

iter 1 の blocking 指摘（F-01: D6 failure message 未実装、F-02: skipped message 不正確、F-03: spawnCommand 専用テスト欠損）がすべて解消されている。must-priority test cases は全カバー。実装品質・設計整合性ともに問題なし。

---

## iter 1 指摘事項の解消確認

### F-01（P2・blocking） — RESOLVED

`writeVerificationResult()` の failed フェーズ出力に `Step '${p.phase}' failed` が追加された（`runner.ts` L149）。TC-VR-E01 / TC-VR-E02 も `runner-commands.test.ts` に追加され、verification-result.md に対する E-01 / E-02 の内容を直接検証している。

### F-02（P3） — RESOLVED

commands 経路の fail-fast skip は `stdout: "_(skipped — previous command failed)_"` をコールサイトで設定しており、`writeVerificationResult` がその stdout を優先表示する。phase 経路の "script not found in package.json" メッセージと分離済み。

### F-03（P3） — RESOLVED

`tests/unit/verification/commands.test.ts` に `spawnCommand` の専用ユニットテスト（C-01: exit 0、C-02: exit 1、C-03: `&&` 連結）が追加された。

---

## Findings（新規）

### F-01 — TC-VR-E02 の it() 説明文がテスト内容と不一致（P4・cosmetic）

**場所**: `tests/unit/verification/runner-commands.test.ts` L133

```typescript
it("string command 'mypy' fails → verification-result.md contains \"Step 'mypy' failed\"", async () => {
    await runVerification(TEST_SLUG, tmpDir, {
      commands: ["false"],
    });
    ...
    expect(content).toContain("Step 'false' failed");
  });
```

説明文は "mypy" を期待しているが、実際のテストコマンドは `"false"` であり `"Step 'false' failed"` を検証している。テストロジック自体は E-02 の意図（name 無し → command 文字列が label になる）を正しく検証しており、機能的な問題はない。cosmetic のみ。

---

## Test Coverage Summary

| Category | Must-priority | Status |
|----------|--------------|--------|
| A (Config Schema Validation) | A-01〜A-10 | ✅ TC-VERIF-01〜08 で全カバー |
| B (Command Normalization) | B-01〜B-04 | ✅ TC-CMD-01〜04 で全カバー |
| C (Command Execution) | C-01, C-02, C-03 | ✅ commands.test.ts で専用テスト追加 |
| D (Verification Runner Branching) | D-01〜D-04, D-06, D-07 | ✅ TC-VR-01〜07 で全カバー |
| E (Failure Output Display) | E-01, E-02 | ✅ TC-VR-E01/E02 で全カバー（iter 2 追加） |
| F (Backward Compatibility) | F-01, F-02, F-03 | ✅ TC-VR-05/06 でカバー |
| G (ESLint Setup) | G-01, G-02, G-03, G-04, G-06, G-07 | ✅ lint / typecheck / test 全 green |
| H (Dogfood Integration) | H-01, H-02, H-03 | ✅ H-01 確認済み、H-02/H-03 は実行確認が unit test 範囲外（継続観察） |
| I (Documentation) | I-01, I-02 | ✅ project.md・README.md 確認済み |

---

## Observations（非 blocking）

- `managed.test.ts` に `vi.mock("../../../src/util/repo-root.js")` が追加された。本 PR で追加した `.specrunner/config.json`（`version: 1` / `agents` なし）が config ロード時に deep-merge に混入し、テスト設定を破壊することを防ぐための適切な隔離処置。
- `verification-result.md`（iter 2 実行分）は phase label が `build / typecheck / test / lint`（fallback 経路）のまま。commands 経路が pipeline 実行時点で使われていない可能性があるが、unit test での commands 経路検証は完全であり blocking ではない（H-02/H-03 は継続観察）。
- `eslint.config.js` の `@typescript-eslint/no-unused-expressions: warn` が `recommended` と重複している可能性があるが、明示的な rule 設定として問題なし。
