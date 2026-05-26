# Code Review Feedback — test-isolation-guard — iter 1

## Verdict

- **verdict**: approved

---

## Summary

実装は設計通り。compile-time guard (D1) + runtime guard (D4) の二重防御が正しく実装されており、全テストが green。受け入れ基準をすべて満たしている。

---

## Findings

### [info] Task 5: fixture cleanup は git 外作業 (scope 注記)

**severity**: 1 (情報のみ)

`tasks.md` に「`git rm` で削除」と記載されているが、`.specrunner/jobs/` は `.gitignore` で除外されており git で追跡されていない。実際の cleanup は filesystem 上の `rm` 操作であり PR の diff には現れない。

現在の main リポジトリの `.specrunner/jobs/` を確認した結果、UUID 形式のファイルのみが残っており（18 件、全て UUID v4）、非 UUID ファイルはゼロ。cleanup 自体は完了しているが、PR 上での再現性は担保できない。

TC-26/27 はローカル検証としては通過しているが、他開発者環境の状態は PR では保証されない点を認識しておくこと。

---

### [info] out-of-scope changes 2 件 (軽微)

**severity**: 2 (承認に影響しない)

本 change のスコープ外と見られる変更が 2 件含まれている:

1. `src/prompts/fragments.ts`: スコアテーブルの `| 7 |` 行に `≥ 7.0` を追記（編集上の補足）
2. `tests/pipeline-integration.test.ts`: `code-review approved` 遷移の検索条件に `&& !t.when` を追加（`when` 条件付き遷移との誤マッチを防ぐ修正）

いずれも軽微で有害ではない。後者は発見ついでの正確性修正として合理的。

---

### [info] globalSetup の ENOENT 以外のエラーが黙殺される

**severity**: 2 (将来の debuggability 注意点)

`tests/global-setup.ts` の `teardown()` の catch ブロック:

```ts
} catch (err) {
  if (err instanceof Error && err.message.startsWith("Test pollution detected")) {
    throw err;
  }
  // ENOENT is fine — jobs dir was removed or never existed
}
```

`ENOENT` 以外のエラー（例: 権限エラー）も黙殺される。現状の用途では問題にならないが、パーミッション異常等でサイレントに guard が機能しない可能性がある。将来的に `err.code !== 'ENOENT'` で再 throw する改善を検討する価値はある。今回は承認に影響しない。

---

## Test Coverage Check

| TC | Priority | Status |
|----|----------|--------|
| TC-01〜03 (store-factory.ts) | must | ✅ `defaultStoreFactory` 削除済み、`makeStoreFactory` のみ export |
| TC-04〜08 (StepExecutor 系 5 file) | must | ✅ 全 file で `tempDir` + beforeEach/afterEach パターン確認済み |
| TC-09〜17 (PipelineDeps 系 9 file) | must | ✅ 全 file で `makeStoreFactory(tempDir)` 確認済み |
| TC-18 (grep defaultStoreFactory = 0) | must | ✅ 0 matches |
| TC-19〜24 (globalSetup) | must | ✅ vitest.config.ts + global-setup.ts 実装確認済み |
| TC-25 (prod code に test 知識なし) | must | ✅ src/ に VITEST / test 検出コードなし |
| TC-26〜27 (fixture cleanup) | must | ✅ ローカル確認済み（UUID のみ残存、非 UUID ゼロ） |
| TC-30〜31 (typecheck + test green) | must | ✅ verification-result.md: 265 files / 2964 tests all passed |
| TC-36 (job-state-store.ts 無変更) | must | ✅ prod code 変更なし |

verification-result.md に「31/31 must TCs covered」と記録されており、全 must が通過している。
