## ADDED Requirements

### Requirement: Phase 2 push 後に mergeStateStatus が CLEAN になるまで polling する

`specrunner finish` は Phase 2 で `git push origin <feature-branch>` を実行した後、Phase 3 の `gh pr merge` を呼ぶ前に mergeStateStatus の polling を MUST 実行する。polling は Phase 0 preflight の `fetchPrViewWithRetry` とは独立した専用ロジックで行う。

polling 仕様:

| 項目 | 値 |
|------|------|
| retry 条件 | `mergeStateStatus !== "CLEAN"` の間 retry する（UNKNOWN / BEHIND / DIRTY / BLOCKED / PENDING 等すべて対象） |
| 最大 retry 回数 | 5 回 |
| retry 間隔 | 3 秒 |
| 上限到達時の挙動 | escalation しない。現在の mergeStateStatus で Phase 3 に進む |
| 使用する API | `gh pr view <prNumber> --json mergeStateStatus` |

Phase 0 preflight の UNKNOWN retry（check 4）とは以下の点で異なる:

- Phase 0: `mergeStateStatus === "UNKNOWN"` のみ retry、上限到達で escalation
- Phase 2 post-push: `mergeStateStatus !== "CLEAN"` で retry、上限到達で続行

#### Scenario: push 後 1 回目で CLEAN → 即座に Phase 3 へ進む

- **WHEN** Phase 2 push 後の polling で `gh pr view` が `mergeStateStatus: "CLEAN"` を返す
- **THEN** retry なしで Phase 3 に進む

#### Scenario: push 後 BEHIND → CLEAN に遷移

- **WHEN** Phase 2 push 後の 1 回目が `mergeStateStatus: "BEHIND"`、3 秒後の 2 回目が `mergeStateStatus: "CLEAN"`
- **THEN** 2 回目の結果で Phase 3 に進む。polling 経過は stdout に出力される

#### Scenario: push 後 5 回 retry 後も UNKNOWN → escalation せず Phase 3 に進む

- **WHEN** 5 回の polling 後も `mergeStateStatus: "UNKNOWN"` のまま
- **THEN** escalation せず、Phase 3 に進む。Phase 3 の `gh pr merge` が成功すれば正常完了、失敗すれば Phase 3 で escalation する

#### Scenario: polling 中の gh pr view 失敗

- **WHEN** polling 中に `gh pr view` が non-zero で終了する
- **THEN** polling を中断し、Phase 0 で取得した mergeStateStatus で Phase 3 に進む（escalation しない）
