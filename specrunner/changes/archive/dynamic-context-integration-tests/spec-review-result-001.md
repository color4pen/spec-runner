# Spec Review Result — dynamic-context-integration-tests — iter 1

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|---|---|---|---|---|
| 1 | LOW | correctness | tasks.md | Task 2 の spy through 方針（"spy はオリジナルの実装を呼び出す"）について。`buildRunner` が返す `ManagedAgentRunner.run()` は内部で `sessionClient.createSession` 等を呼ぶため、spy through するとモック不足でエラーになりうる。Task 1 で既に `vi.spyOn` と書いているが、実装時は `mockImplementation` で元の `run` を呼ぶか、もしくは呼び出し引数だけキャプチャして成功レスポンスを返す mock にする判断が必要。design D2 の「spy through」表現は implementer に誤解を与える可能性がある | Task 1 注意書きに「spy through は既存の mock インフラ（client/githubClient）が揃っている前提。runner.run の呼び出し引数をキャプチャしつつ既存 mock 経由で実行する」と補足するか、もしくは implementer の裁量に委ねる（既存テストで同じ mock 構成が動作実績あり） |
| 2 | LOW | correctness | tasks.md | Task 4 で `enrichContext` の検証方法が2案（enrichContext 自体を spy / buildMessage を spy）併記されており、最終的に enrichContext spy が推奨されている。enrichContext は `SpecReviewStep` オブジェクトのメソッドであり、steps レジストリから取得される step オブジェクトに対して `vi.spyOn` する必要がある。step オブジェクトは `steps` 配列のリテラルオブジェクトとして定義されているため（class instance ではない）、import して spy を張る導線を implementer が自力で解決する必要がある | 実装指針として「`../src/core/step/spec-review.ts` の default export オブジェクトに対して spy する」旨を明記すると implementer の迷いが減る。ただし軽微であり、コード探索で解決可能 |

## Architecture Assessment

- **責務分離**: 適切。プロダクションコード変更なし（テストのみ）。spy による観測はポートインターフェース境界（`AgentRunner.run`）で行い、内部実装への依存を最小化している。
- **依存方向**: 問題なし。テストは既存の mock インフラ（`buildPipelineMockClient`, `buildMockGithubClient`, `buildRunner`）を再利用し、テストユーティリティの新規追加を回避している。
- **設計パターン**: D2（spy アプローチ）は妥当。B/C のプロダクションコード変更案を正しく棄却している。

## Correctness Assessment

- `StepExecutor.runAgentStep()` が `PROJECT_CONTEXT_STEPS` Set で allowlist 判定し、`deps.cwd ?? process.cwd()` で `specrunner/project.md` を読む実装と、design D3 の記述は整合する。
- `enrichContext` が `ManagedAgentRunner.run()` 内部で呼ばれる点も正しく把握されており、Task 4 で runner.run spy では enrichment 後の状態が見えない制約が明記されている。
- `DynamicContext` の型定義（`specIndex: SpecIndexEntry[]`, `baselineSpecs?: Record<string, string>`）と tasks の検証項目が一致する。

## Completeness Assessment (task decomposition)

Task 1-5 で request の要件 1-3 および受け入れ基準 4 項目をカバーしている。Task 間の依存関係も明確（Task 1 の spy を Task 2-4 が再利用、Task 5 で全体検証）。
