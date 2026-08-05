# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md — 全タスク完了確認
T-01 〜 T-11 の全チェックボックスが `[x]` であることを確認。

### design.md — 設計判断 D1〜D7 の実装適合

**D1: byte guard mirrors file-count guard（同一判定点・独立条件）**
`commit-push.ts:655-682` — file-count guard ブロックの直後（before any `git add`）に byte guard が配置され、各 guard が独立した `if` ブロック。verified。

**D2: uncompressed lstat bytes（保守的方向）**
`defaultStagedPathSizeProbe`（commit-push.ts:40-43）が `fsLstat` を使い `{ size: st.size }` を返す。`stat`（symlink follow）は使用していない。verified。

**D3: measurement degradation — ENOENT → 0, other → fail-closed**
`measureStagedBytes`（staging-containment.ts:121-149）: ENOENT → `bytes = 0`、他エラー → rethrow。commit-push.ts:664-673 で rethrow を `commitEffectFailedError` でラップ。fail-closed 確認。verified。

**D4: distinct escalation error with size breakdown**
`STAGED_BYTES_LIMIT_EXCEEDED` が `ERROR_CODES`（errors.ts:135）に追加済み。`stagedBytesLimitExceededError`（errors.ts:559-577）は hint + "Top directories by size" メッセージを含む。`EXIT_CODE_MAP` に不在（errors.ts:557 コメント確認）。verified。

**D5: injectable size probe on CommitPushInfra; pure measurement in staging-containment.ts**
`CommitPushInfra.statFn?: StagedPathSizeProbe`（commit-push.ts:80）は optional。`measureStagedBytes` は staging-containment.ts に純粋関数として実装。executor.ts は無変更（optional field）。verified。

**D6: config validation + docs mirror file-count field**
`PipelineConfig.maxStagedBytes?: number`（types.ts:268）追加。validation.ts:253-258 で `optional(number(...).check(int(...), gte(1,...)))` — maxStagedFiles と同型。docs/configuration.md:419,438 に default 52428800・guarded-only・lstat・独立性が記載。verified。

**D7: COMMIT_DISCIPLINE fragment extension**
fragments.ts:16-26 の `COMMIT_DISCIPLINE` に「## 生成物・scratch ファイルの衛生規律」節を追加。生成物・scratch・`.gitignore`・一時ファイルの規律が日本語で記載。`buildSystemPrompt` 経由で全 producer prompt に継承。verified。

---

### spec.md — Requirements（SHALL/MUST）全件確認

**R1: byte-size guard SHALL halt before commit when total exceeds maxStagedBytes**
commit-push.ts:661-682 に `resolveMaxStagedBytes` → `measureStagedBytes` → `stagedBytesLimitExceededError` の guard を確認。判定点は `applyStagingExclusions` 後・`git add` 前。verified。
- Scenario "over-byte halts": TC-030・TC-041 で git add/commit/push が subcommands に含まれないことを assert。verified（test passed）。
- Scenario "at-or-below proceeds": TC-031 で commit + push に進むことを assert。verified。

**R2: Staged-byte measurement SHALL lstat, treat ENOENT as zero, SHALL NOT fail open**
`measureStagedBytes` の実装が D3 通り。verified。
- Scenario "delete-pending → no misfire": TC-032 で確認。verified。
- Scenario "measurement failure → fail-closed": TC-033 で確認。verified。

**R3: halt error SHALL carry total, threshold, breakdown, remedies, on escalation path**
`stagedBytesLimitExceededError` の message に `${totalBytes} bytes exceed the limit of ${limitBytes}`、`Top directories by size`、hint に両対処（`stagingExcludePatterns`・`.gitignore`、`maxStagedBytes`）を含む。EXIT_CODE_MAP 不在確認。verified。
- Scenario "byte-limit error message actionable": TC-042（integration）・TC-034（unit）で全要素を assert。verified。

**R4: `pipeline.maxStagedBytes` SHALL be a validated positive integer**
validation.ts:253-258 が正の整数のみ許容。config layer でのデフォルト注入なし（resolveMaxStagedBytes が runtime で解決）。verified。
- Scenario "invalid rejected": TC-038 で 0/-1/1.5 → CONFIG_INVALID を assert。verified。
- Scenario "valid accepted / omitted → no default": TC-039 で確認。verified。

**R5: both guards SHALL be evaluated independently**
commit-push.ts 内で file-count guard と byte guard は別々の if ブロック。file-count guard の判定・default・error・message は不変。verified。
- Scenario "file count under, bytes over → halts": TC-041 で確認。verified。

**R6: COMMIT_DISCIPLINE SHALL instruct producer agents on artifact hygiene**
fragments.ts の `COMMIT_DISCIPLINE` 拡張を確認。三者（IMPLEMENTER/BUILD_FIXER/CODE_FIXER）への継承を確認。verified。
- Scenario "hygiene discipline in producer prompts": TC-040 が COMMIT_DISCIPLINE 本体と3 prompt 全てに `生成物`・`.gitignore` 存在を assert。verified（test passed）。

---

### request.md — 受け入れ基準 全件確認

| # | 受け入れ基準 | 判定 | 根拠 |
|---|-------------|------|------|
| 1 | file 数閾値以下 × バイト閾値超過で git add/commit/push 不実行 halt（破壊確認込み） | Pass | TC-030・TC-041 |
| 2 | バイト閾値以下（file 数も以下）で従来どおり commit + push | Pass | TC-031 |
| 3 | 削除予定 path が 0 バイト扱いで guard 誤発火せず | Pass | TC-032 |
| 4 | halt メッセージに総バイト数・閾値・サイズ内訳・対処 | Pass | TC-042 + TC-034 |
| 5 | `maxStagedBytes` schema validation（正の整数のみ） | Pass | TC-038・TC-039 |
| 6 | `COMMIT_DISCIPLINE` 生成物衛生規律の文言存在 | Pass | TC-040 |
| 7 | 既存テスト無変更 green | Pass | verification: 689 test files / 10220 tests passed |
| 8 | `typecheck && test` green | Pass | verification-result.md: 両フェーズ exit 0 |

---

### scope 確認（git diff main...HEAD --stat）

28 files, 3848 insertions, 6 deletions。

- 変更された source ファイル: commit-push.ts (+53), staging-containment.ts (+126), errors.ts (+27), fragments.ts (+8), types.ts (+6), validation.ts (+6) — 全て想定内
- 新規テストファイル 4 件（既存テストファイル無変更）
- docs/configuration.md (+8) — 想定内
- package.json / lockfile: diff に不在（新規 runtime 依存なし）
- .specrunner/config.json: diff に不在
- push path（pushOnly / retry / HTTP-400）: diff に不在
- scoped branch / file-count guard: 変更なし

## 検証できなかった項目

None。全判断項目を実装ファイルと照合して直接確認した。

## Findings 詳細

None。全受け入れ基準・設計判断・仕様要件に適合しており、指摘事項なし。
