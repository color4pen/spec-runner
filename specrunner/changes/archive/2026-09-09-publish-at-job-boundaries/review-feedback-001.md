# Code Review Feedback — iteration 001

- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | `src/core/step/commit-push.ts:899` | `commitFinalState` は terminal/checkpoint commit が失敗しても warning だけで return するため、呼び出し側は続けて既存 HEAD を publish し、`already-synchronized` または `published` を成功として扱う。したがって state/journal の最終記録が commit されていないのに awaiting-archive の正常完了や halt の remote-ready 通知へ進み得る。これは「最終記録を公開する」「公開失敗を成功表示しない」という MUST を破る。 | commit-only terminal operation から commit 成否（created / no-change / failure）を型付きで返し、commit failure を publication boundary の failure として扱う。no-change は publish-only を続行してよいが、実際の commit failure では正常完了・remote-ready 通知を抑止し、local retry state を保存する。 | yes |
| 2 | HIGH | correctness | `src/core/pipeline/pipeline.ts:297` | pre-PR publish failure は `PUBLICATION_FAILED` を投げるが、同じ try/catch の safety net が `state` のない例外を一律 `UNEXPECTED_STEP_ERROR` に置換する。その結果、永続 state から pre-PR/push phase と retry diagnosis が失われ、仕様が要求する pre-PR push・PR API・post-PR push の区別が成立しない。PR API を呼ばない点だけは維持される。 | pre-PR publication を step executor 用 catch の外で処理するか、`SpecRunnerError` の code/detail をそのまま state に保存する専用分岐を追加する。state.error と journal/CLI diagnosis に `PUBLICATION_FAILED` および `pre-pr/<phase>` が残るテストを追加する。 | yes |
| 3 | MEDIUM | correctness | `src/core/pipeline/pipeline.ts:657`, `src/core/command/runner.ts:351` | `publishCheckpointOnHalt=false` の条件が publish だけでなく `commitFinalState` まで包んでいる。設計 D5 は policy にかかわらず quiescent state を managed-path commit し、policy=true の場合だけ publish する契約である。現在は disabled halt で state.json は書かれるものの checkpoint commit/OID ledger が作られず、step ごとの local commit と同じ revision-bound checkpoint を残す契約を満たさない。pipeline 前 fidelity gate も同様。 | halt state の persist 後は常に scoped `commitFinalState` を実行し、その後の `publishCommittedState` のみを保存済み policy で条件分岐する。pipeline halt と fidelity gate の false-policy テストで commit は発生し push はゼロであることを確認する。 | yes |

## 検証した項目

- `git diff main...HEAD --stat` と全 changed implementation file を確認。
- `design.md`、`tasks.md`、`spec.md`、`test-cases.md` の MUST scenarios と照合。
- `verification-result.md` の既存 build/typecheck/test/lint 成功証跡を確認し、同じ suite は再実行していない。
- 新規 publication test は publish-only の単体 spy が中心で、上記 terminal commit failure、pre-PR typed failure persistence、disabled-policy commit-only の統合挙動を検出していない。

## 検証できなかった項目

- verification step が既に build/typecheck/test/lint を実行済みであるため、レビューでは同じコマンドを再実行していない。
- 実 GitHub、実 remote credential、Vercel への接続は要件どおり使用していない。

## Summary

途中 step/round/verification の commit-only 化と publish-only の ledger 検査は実装されている。一方、terminal commit failure が成功扱いになり得ること、pre-PR failure の型が失われること、halt policy=false で local checkpoint commit まで省略されることにより、公開結果の真実性と停止時保存契約に blocking defects が残る。
