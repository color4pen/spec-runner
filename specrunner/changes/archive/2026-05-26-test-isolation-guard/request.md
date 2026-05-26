# test isolation: prod path への書き込みを構造的に防止 + 47 件 fixture clean up (#400)

## Meta

- **type**: spec-change
- **slug**: test-isolation-guard
- **base-branch**: main
- **adr**: true

## 背景

dogfood 中の `job ls` で `.specrunner/jobs/` 配下に **test 由来の fixture が 47 件混入**していることが判明 (= prod の本物 job と混在)。

サンプル:
- `tc-cap-001-job` 〜 `tc-cap-008-job` 等の jobId が prod の `.specrunner/jobs/` に存在
- これらは `tests/unit/step/commit-and-push.test.ts` 内で hardcode された jobId と一致

= 過去のある時点で test が **prod の `<repoRoot>/.specrunner/jobs/` に直接書いていた**。現在の test code は `tempDir` 配下に書く造りだが、**構造的な保証はない** (= 開発者が `tempDir` を渡し忘れる test が出れば再発)。

## 要件

### 1. test 中に prod path への書き込みを構造的に防止する

test 実行中に `JobStateStore` / `getJobsDir()` 経由で prod の `<repoRoot>/.specrunner/jobs/` に書き込めないようにする。

具体的実装方法 (= test 環境検出 + 強制 temp 向け / CI で前後 diff assert / lint rule 等) は **design step で確定**する。

### 2. deprecated `defaultStoreFactory` を使う test file の移行

構造的防止の導入により、`defaultStoreFactory` (= `process.cwd()` を repoRoot に使用) を使う 15 test file が prod path へ書こうとして fail する。`makeStoreFactory(tempDir)` への移行が必須。

移行対象 file の特定と具体的移行方法は **design step で確定**する。

### 3. 過去の混入 fixture を clean up する

`.specrunner/jobs/` から test 由来の fixture を削除する。本物の archived job (= `remove-xdg-mode` 等) は区別して維持。

削除対象の特定方法 (= slug / jobId pattern / createdAt ベース) は **design step で確定**する。

## スコープ外

- **本物の archived job の clean up policy** (= archived job をどの時点で削除するかの長期方針) — 別 issue
- **`job ls` の AGE 表示 bug** (= 2 日前を `145d` と誤表示) — 別 issue
- **test framework の変更** (= vitest の設定変更等) — 本 request は isolation guard のみ

## 受け入れ基準

- [ ] test 実行中に `JobStateStore` 経由で prod の `<repoRoot>/.specrunner/jobs/` への書き込みが防止される
- [ ] 防止の仕組みが構造的 (= 開発者が `tempDir` 渡し忘れても安全)
- [ ] deprecated `defaultStoreFactory` を使う test file が `makeStoreFactory(tempDir)` に移行されている
- [ ] design step で確定した識別基準に合致する test 由来 fixture が `.specrunner/jobs/` から全件削除されている (= 固定カウントではなく criteria で検証)
- [ ] 本物の job state file (= archived 等) が誤削除されていない
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **構造的防止を選択**: prompt / rules での指導ではなく、code level で prod path への書き込みを物理的に不可能にする方向。[[feedback_llm_uncertainty_principle]] と整合 (= 「判断する場面を消す」)
- **fixture clean up を本 request に含める**: isolation guard と一緒に片付ける自然なまとまり、guard 導入 + 既存汚染の掃除
