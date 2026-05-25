# Code Review Feedback — remove-xdg-mode — iter 1

- **verdict**: approved
- **reviewer**: code-review (iter 1)

---

## Summary

実装は設計通り。module-level state 完全除去 / 純粋関数化 / `repoRoot` 引数注入の 3 点が正確に達成されており、verification (typecheck + 2777 tests) も green。

---

## Must TC カバレッジ

| TC | 確認方法 | 結果 |
|----|---------|------|
| TC-XDG-01 | `src/util/xdg.ts` export 確認 — `setJobsLocation` 等なし | ✅ |
| TC-XDG-02 | `getJobsDir("/path")` → `"/path/.specrunner/jobs"` | ✅ |
| TC-XDG-03 | `getVerboseLogDir("/path")` → `"/path/.specrunner/logs"` | ✅ |
| TC-XDG-04/05 | `getJobStatePath` / `getVerboseLogPath` の引数 `repoRoot, jobId` 形式 | ✅ |
| TC-CFG-03/04/05 | `SpecRunnerConfig.jobs` field なし、`validateConfig` に jobs block なし | ✅ |
| TC-JSS-01〜05 | `JobStateStore` コンストラクタ / static メソッド全て `repoRoot` 引数 | ✅ |
| TC-VL-01〜03 | `initVerboseLog(repoRoot, jobId)` signature、`PrepareResult.repoRoot` あり | ✅ |
| TC-CLI-01 | 全 6 CLI entry に `setJobsLocation` import/call なし | ✅ |
| TC-CLI-03 | `cancel.ts` / `ps.ts` が `git rev-parse` で `repoRoot` を解決 | ✅ |
| TC-RT-01/02 | `local.ts` / `managed.ts` の `storeFactory: (id) => new JobStateStore(id, this.cwd)` | ✅ |
| TC-RT-04 | `state/store.ts` が deprecated wrappers 完全削除（ファイルほぼ空） | ✅ |
| TC-DOC-01 | `src/prompts/rules.ts` L80-81 から `"xdg"` 言及削除済み | ✅ |
| TC-DOC-02 | `specrunner/project.md` L41 から XDG 括弧書き削除済み | ✅ |
| TC-TC-01/02/04/05 | `xdg.test.ts` — `setJobsLocation` / `resetJobsLocation` / `afterEach` 呼び出しなし | ✅ |
| TC-TC-03 | `schema.test.ts` — 旧 jobs validation テスト (TC-JOBS-03〜08) 削除済み | ✅ |
| TC-E2E-04/05 | typecheck pass / 2777 tests pass | ✅ |

---

## Findings

### F-01 — stale mock field in `tests/unit/cli/resume.test.ts` (advisory)

```ts
// tests/unit/cli/resume.test.ts:29
vi.mock("../../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    runtime: "local",
    pipeline: { maxRetries: 2 },
    agents: {},
    jobs: { location: "xdg" },  // ← stale: SpecRunnerConfig.jobs は存在しない
  }),
}));
```

`SpecRunnerConfig` から `jobs` field が削除されたため、この mock fixture の `jobs` フィールドは型的に存在しない未知フィールドとして silently 無視される。`vi.fn().mockResolvedValue()` の戻り型は `any` なので TypeScript はエラーを出さない。

TC-TC-06 (should: `grep -r "jobs.location"` のヒット数 0) に対応する唯一の残存箇所。

**影響**: runtime に影響なし。テストは green のまま通過。  
**推奨**: 次の機会に `jobs: { location: "xdg" }` 行を削除する（今回 block 不要）。

---

## Overall Assessment

設計判断 (D1〜D5) が全て忠実に実装されている。特に:

- `getJobsDir` / `getVerboseLogDir` が純粋関数になり、module-level state の silent fallback リスクが構造的に除去された
- `storeFactory` closure capture パターンで `StoreFactory` 型シグネチャを変えずに `repoRoot` を注入 — 型互換を維持しつつ依存を可視化
- `state/store.ts` deprecated wrappers を全削除しコードパスをシンプル化

F-01 はコメント/fixture の整理であり、機能的影響なし。
