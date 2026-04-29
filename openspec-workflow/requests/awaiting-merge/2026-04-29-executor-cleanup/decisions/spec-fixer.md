# Spec Fixer Decisions — 2026-04-29-executor-cleanup

spec-review-result-001.md の findings に基づき、spec-fixer が下した判断の記録。
形式: `〜する :: 理由`

---

## HIGH #1 (completeness — snapshot 検証)

`tests/cli-stdout-snapshot.test.ts` を `npm test` で `--update-snapshot` 無しで PASS することを完了条件として design.md 制約節と tasks.md 7.11 に明記する :: 振る舞い不変の検証として「既存 280 テスト全 PASS」だけでは snapshot 一致を担保できず、helper 抽出後 / @deprecated 削除後 / pipeline.ts 削除後のいずれで baseline 更新が起きたかが追跡できなくなるため

snapshot baseline 更新が必要になった場合は別タスクとして起票し rationale を design.md に記録してからレビューを受けることを明示する :: 振る舞い変化を明示的に承認するプロセスが必要であり、暗黙の baseline 更新は regression 検知を無力化するため

## HIGH #2 (consistency — pipeline.ts 事実誤認)

request.md / proposal.md / design.md の `src/core/pipeline.ts` 記述を「placeholder index.ts + sibling file」「sibling 削除漏れ」から「`runPipeline` / `runProposePipeline` 関数本体が `src/core/pipeline.ts` に取り残されており directory-form 移行が未完結」に修正する :: `src/core/pipeline.ts` は 93 LOC の production 関数本体を持つファイルであり、単純な sibling 削除では完了しない事実誤認であったため

design.md D3 を 4 操作（関数移動 → re-export → call site 書き換え → ファイル削除）の 1 commit 完結に書き換える :: 従来の 3 操作記述では runPipeline が移行先で解決できず tasks 4.2 が破綻するため

tasks.md Section 4 を 4 段階（4.1 run.ts 新設・移動 / 4.2 index.ts re-export / 4.3 call site 書き換え / 4.4 ファイル削除）に再構成する :: 実態に即した実施手順が必要であり、旧 4.2「import を pipeline/ 経由に書き換える」だけでは runPipeline の解決ができないため

## MEDIUM #3 (@deprecated field decision tree)

design.md D2 の (d) 分類に decision tree（無条件発火なら削除可 / 条件付き発火なら削除不可 + implementation-notes 記録）を追記する :: 「migrate.ts での扱いを確認してから削除」という記述は確認結果として何が削除可能かの判断基準を示しておらず、implementer が判断できないため

tasks.md 3.6 を 3.6.1（grep 確認）/ 3.6.2（無条件発火なら削除）/ 3.6.3（条件付きなら記録）に詳細化する :: decision tree と対応した機械的手順が必要なため

## MEDIUM #4 (consistency — proposal/design Why の事実誤認)

proposal.md Why / design.md Context の pipeline.ts 関連記述を HIGH #2 と同一の事実に合わせて修正する :: HIGH #2 の事実誤認と同じ根本原因であり、Why セクションが誤った前提に立っていると implementer が誤った方向で実装するリスクがあるため

## MEDIUM #5 (fetchSpecReviewResult legacy fallback — 判断確定)

`fetchSpecReviewResult` 関数 export を維持する（削除しない）:: `tests/spec-review-fetch.test.ts` の TC-012/013/014/015 が直接呼び出しており、削除するとテスト 4 件が壊れるため

executor.ts:818-829 の production fallback 分岐を削除し `deps.githubClient` を必須化する :: fallback 分岐があると githubClient が漏れた経路で silent fallback が発動して原因不明のバグになり、port 一本化の意義が失われるため

`verifyBranchLegacy` / `verifyChangeFolderLegacy`（~134 LOC）の削除を本 request スコープに含める :: module-analysis.md が LOC 削減には verify*Legacy 削除が必要と分析しており（シナリオ B）、helper 抽出のみでは LOC 目標 750-800 に到達できないため。request 要件 5 の「fetchSpecReviewResult legacy fallback 整理」と歩調を合わせ、port 経路への一本化として整合性がある

verify*Legacy 削除前に `grep -rn "createPipelineDeps\|githubClient" tests/` で未提供 path が無いことを前提確認タスク（6.1.1）として課す :: 確認なしに削除すると未提供 path でランタイムエラーが起きるため。未提供 path が残る場合は削除をスキップし LOC 目標を 800-850 に緩める

## MEDIUM #6 (LOC target reachability)

design.md D1 に LOC 達成シナリオ 2 通り（A: helper 抽出のみ / B: helper 抽出 + verify*Legacy 削除）を明示し、シナリオ B を採用する :: helper 抽出は主に cohesion 改善であり LOC 削減は限定的。verify*Legacy 削除（~134 LOC）がなければ 900 → 750-800 の目標に届かない可能性が高いため

tasks.md 2.6 を「Section 6 の verify*Legacy 削除完了後に再確認し、最終 LOC を implementation-notes.md に記録する」に変更する :: Section 2 完了時点では LOC が未達である可能性があり、Section 6 完了後に最終計測するのが正確なため。到達できない場合は LOC 目標を 800-850 に緩める

## LOW #7 (helper names in tasks Section 2)

tasks.md 2.2.1-2.2.5 の候補名（`prepareSessionForStep` / `recordStepCompletion`）を module-analysis.md 推奨名（`createSessionWithHistory` / `recordFailedStepResult` / `attachStateAndRethrow` / `throwWrappedError` / `failStepWithError`）に置き換え、5 helper 全てを列挙する :: 候補名のまま残すと implementer が Section 1 を読まずに候補名を採用するリスクがある。module-analysis.md の推奨は署名レベルまで確定しているため直接反映する

tasks.md Section 1 を「module-analysis.md 生成済み前提の確認タスク」に書き直す :: spec-review 時点で既に module-analysis.md が生成済みであり、Section 1 を「詳細化する」タスクとして書き続けると Section 2 が「候補名」のまま残る矛盾が生じるため

## LOW #8 (Open Questions stale)

design.md Open Questions を「解消済みの記録」に書き換える :: module-analysis.md が生成済みで helper 名は確定しており、「未確定事項あり」と誤読される余地を残すことはレビュアーの判断を歪めるため。fetchSpecReviewResult の Open Question は D5 で決定済みのため Open Questions から削除して D5 に統合する
