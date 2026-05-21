# Code Review: remove-localruntime-legacy-path

- **iteration**: 1
- **date**: 2026-05-11
- **verdict**: approved

---

## Summary

リファクタリングの目的を完全に達成している。コンストラクタシグネチャが `opts: LocalRuntimeOptions` の単一引数に統一され、`string | LocalRuntimeOptions` union 型と `githubClient!` non-null assertion が除去された。テスト全 19 箇所が named options 形式に変換済みで、比較テスト (`it("named options and positional constructor produce equivalent runtimes")`) も適切に削除されている。verification は typecheck + 1651 tests 全 pass を確認済み。

---

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| correctness | 9 | 振る舞い変更なし。コンストラクタ本体のロジックは同一のまま union 分岐のみ除去 |
| security | 8 | セキュリティ関連変更なし。non-null assertion 除去は安全性向上 |
| architecture | 9 | 不要な overload 相当の union を除去し、シグネチャが単純化された |
| performance | 8 | 変更なし |
| maintainability | 9 | `cwdOrOpts` という紛らわしい命名が `opts` に置き換わり可読性向上 |
| testing | 8 | must シナリオはすべて通過。TC-08/TC-09/TC-10 の private フィールド直接検証は間接的カバレッジで代替 |

**Total**: 9×0.30 + 8×0.25 + 9×0.15 + 8×0.10 + 9×0.10 + 8×0.10 = **8.70**

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | specrunner/changes/remove-localruntime-legacy-path/test-cases.md | TC-08/TC-09/TC-10 が「インスタンスの cwd/githubClient/manager プロパティを参照する」と記述しているが、これらは `private readonly` フィールドのため直接 assert 不可能。実際のテストでは TC-LR-001 (setupWorkspace が fetch に `this.cwd` を使用) や TC-LR-007 (`deps.githubClient === githubClient`) で間接的にカバーされており、振る舞いの正しさは担保されている | test-cases.md の THEN 節を「`workspace.cwd` が期待値と一致する」等、observable な検証に書き直す（任意。振る舞いは正確に検証済みのため次回以降で対応可） |

---

## Scenario Coverage (must シナリオ)

| TC | Priority | Status | 根拠 |
|----|----------|--------|------|
| TC-01 コンストラクタシグネチャ | must | ✅ PASS | `constructor(opts: LocalRuntimeOptions)` — `cwdOrOpts` / union / optional args なし |
| TC-02 legacy 分岐削除 | must | ✅ PASS | `typeof cwdOrOpts === "string"` 分岐・コメントとも不在 |
| TC-03 non-null assertion 除去 | must | ✅ PASS | `this.githubClient = opts.githubClient` の直接代入 |
| TC-04 4-arg positional 変換 | must | ✅ PASS | 全箇所 `{ cwd: tempDir, githubClient, manager, spawnFn }` 形式 |
| TC-05 3-arg positional 変換 | must | ✅ PASS | 全箇所 `{ cwd: tempDir, githubClient, manager }` 形式 |
| TC-06 positional パターン残存なし | must | ✅ PASS | `new LocalRuntime(tempDir,` のパターン 0 件 |
| TC-07 比較テスト削除 | must | ✅ PASS | "named options and positional constructor produce equivalent runtimes" 不在 |
| TC-08 cwd 代入 | must | ✅ PASS (間接) | TC-LR-001/008 で setupWorkspace 内の git fetch が `this.cwd` を使用 |
| TC-09 githubClient 代入 | must | ✅ PASS (間接) | TC-LR-007: `deps.githubClient === githubClient` |
| TC-10 manager デフォルト値 | must | ✅ PASS (間接) | TC-LR-012: manager 省略で runtime が正常動作 |
| TC-13 typecheck pass | must | ✅ PASS | verification-result: exit 0 |
| TC-14 test suite pass | must | ✅ PASS | 1651 tests all pass |
