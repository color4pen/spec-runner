# Test Cases: job state を event journal / projection / liveness に分離し、slug ディレクトリで branch 同伴管理する

## Summary

- **Total**: 42 cases
- **Automated** (unit/integration): 39
- **Manual**: 3
- **Priority**: must: 27, should: 13, could: 2

---

## 段1: ファイル分割（in-place・挙動不変）

### TC-001: 新規 job が分割レイアウトで作られる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 単一 JSON を event journal と cursor/descriptor に分割する（段1）> Scenario: 新規 job が分割レイアウトで作られる

---

### TC-002: 観測可能な挙動が不変（段1）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 単一 JSON を event journal と cursor/descriptor に分割する（段1）> Scenario: 観測可能な挙動が不変

---

### TC-003: cursor 書き込み中の crash で event が失われない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: event 追記と cursor rewrite を物理的に分離する（段1）> Scenario: cursor 書き込み中の crash で event が失われない

---

### TC-004: 末尾 partial 行を捨ててそれ以前を復元する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold は不完全な末尾行を無視し、それ以前を全復元する（段1）> Scenario: 末尾 partial 行を捨ててそれ以前を復元する

---

### TC-005: code-review approved + fixableCount>0 の routing が従来どおり動く

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold 結果が再開 routing と transition 判定の読む値を従来同値に保つ > Scenario: code-review approved + fixableCount>0 の routing が従来どおり動く

---

### TC-006: fixer-empty 検出の再開が従来どおり動く

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fold 結果が再開 routing と transition 判定の読む値を従来同値に保つ > Scenario: fixer-empty 検出の再開が従来どおり動く

---

### TC-027: JobStateStore 外部契約が不変

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** 段1 適用後の分割レイアウト（`.specrunner/jobs/<jobId>/events.jsonl` + `state.json`）
**WHEN** `create` / `load` / `persist` / `update` / `appendStepRun` / `appendHistory` / `list` / `resolveId` / `delete` を段1 適用前と同じ引数で呼ぶ
**THEN** 戻り値・解決セマンティクス（`NormalizedJobState` の shape、`resolveId` の 0/1/2+ 件ハンドリング等）が段1 適用前と同値

---

### TC-028: attempt が 1-origin 連番で出現順から導出される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 / design.md D2

**GIVEN** `events.jsonl` に同一 step の step-attempt record が 3 件、出現順に記録されている
**WHEN** fold を実行する
**THEN** `steps[step]` の `StepRun` が 3 件得られ、各 `attempt` が 1, 2, 3 の 1-origin 連番で割り当てられる（現行 `pushStepResult` と同値）

---

### TC-029: append が fs.appendFile のみを使い既存行を書き換えない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01 AC

**GIVEN** `events.jsonl` に既存 record が複数行記録済み
**WHEN** `appendStepRun` / `appendHistory` を呼ぶ
**THEN** `fs.appendFile` のみが呼ばれ、`events.jsonl` の既存行が書き換えられない（全体 rewrite が発生しない）

---

### TC-030: delta-append crash 後の冪等リカバリ（load 時）

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T-02

**GIVEN** `events.jsonl` に N 件の record が append 済みだが、`state.json` のカウンタが N より小さい（append 成功後の cursor 更新前 crash に相当）
**WHEN** `load()` を実行する
**THEN** fold 行数（N）でカウンタがリセットされ、以降の delta 計算が正しく行われる（二重 append なく fold 結果が全 N 件を返す）

---

### TC-031: transitionJob + persist / pushStepResult + persist が呼び出し点変更なしで動く

**Category**: unit
**Priority**: must
**Source**: design.md D3 / tasks.md T-02

**GIVEN** 既存の `transitionJob(...) + persist(...)` および `pushStepResult(...) + persist(...)` 呼び出し形式
**WHEN** `persist` を段1 後の delta-append + cursor-overwrite 実装で実行する
**THEN** 呼び出し点を変更せずに `events.jsonl` へ journal 追記が成立し、`state.json` が atomicWriteJson で overwrite される

---

### TC-032: history 永続 truncation が撤廃され MAX_HISTORY_SIZE 超えが保存される

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05 / design.md D4

**GIVEN** 100 件（`MAX_HISTORY_SIZE`）を超える transition が append された `events.jsonl`
**WHEN** fold を実行する
**THEN** 全件が `history` に復元され、永続層での truncation が起きていない

---

### TC-033: job show 出力が段1 適用前と同等（表示層 cap）

**Category**: integration
**Priority**: should
**Source**: tasks.md T-05 AC

**GIVEN** 多数の transition を持つ job の `events.jsonl`
**WHEN** `job show` を実行する
**THEN** 段1 適用前と同じ表示形式・件数 cap で出力される（表示層での cap は維持）

---

## 段2: slug ディレクトリ移行・branch 同伴・痩せ

### TC-007: step ごとの commit に state が含まれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 新規 job の journal / cursor / usage を change folder に置き step commit に同梱する（段2）> Scenario: step ごとの commit に state が含まれる

---

### TC-008: CI 再実行相当の resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 同一 branch を再 checkout した状態から resume が成立する（段2）> Scenario: CI 再実行相当の resume

---

### TC-009: branch 同伴 state に machine-local 値が無い

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: machine-local 値を branch 同伴 state から除外し sidecar に分離する（段2）> Scenario: branch 同伴 state に machine-local 値が無い

---

### TC-010: sidecar 喪失時に worktreePath を規約から再導出する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: machine-local 値を branch 同伴 state から除外し sidecar に分離する（段2）> Scenario: sidecar 喪失時に worktreePath を規約から再導出する

---

### TC-011: cost が step ごとに記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: cost を step ごとに usage.json へ append し finish 一括派生を廃止する（段2）> Scenario: cost が step ごとに記録される

---

### TC-012: usage show / summary が従来どおり読める

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: cost を step ごとに usage.json へ append し finish 一括派生を廃止する（段2）> Scenario: usage show / summary が従来どおり読める

---

### TC-013: 中断事由が 1 箇所に記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 中断事由を journal の event 1 件で記録する（段2）> Scenario: 中断事由が 1 箇所に記録される

---

### TC-014: 再 checkout 後も transition トレースが残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: history を経過トレースとして保持する（段2）> Scenario: 再 checkout 後も transition トレースが残る

---

### TC-015: archive 後も state ファイルが残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: archive は痩せた state を strip せず main に取り込む（段2）> Scenario: archive 後も state ファイルが残る

---

### TC-016: 両 runtime の active が表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: active 列挙を worktree 不変量 + dual-read で成立させる（段2）> Scenario: 両 runtime の active が表示される

---

### TC-017: 既定は active のみ、--all で archive を含む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: active 列挙を worktree 不変量 + dual-read で成立させる（段2）> Scenario: 既定は active のみ、--all で archive を含む

---

### TC-018: legacy が dual-read で列挙される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: active 列挙を worktree 不変量 + dual-read で成立させる（段2）> Scenario: legacy が dual-read で列挙される

---

### TC-019: exit-guard が自 worktree の branch state を更新する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree 存在 ⟺ 非終端の不変量と exit-guard（段2）> Scenario: exit-guard が自 worktree の branch state を更新する

---

### TC-020: stale running を pid で判定する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: worktree 存在 ⟺ 非終端の不変量と exit-guard（段2）> Scenario: stale running を pid で判定する

---

### TC-021: 再 run が旧 branch を破壊しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 再 run は新 jobId / 新 branch を生やし旧 attempt を破壊しない（段2）> Scenario: 再 run が旧 branch を破壊しない

---

### TC-022: 複数 attempt を jobId で区別し個別に片付ける

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 再 run は新 jobId / 新 branch を生やし旧 attempt を破壊しない（段2）> Scenario: 複数 attempt を jobId で区別し個別に片付ける

---

### TC-023: 旧 full state から移行して resume する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 旧 full state からの非破壊移行（段2）> Scenario: 旧 full state から移行して resume する

---

### TC-024: pr-create 後に pullRequest が materialize される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: pullRequest を state.json に materialize して読み手が動作する（段2）> Scenario: pr-create 後に pullRequest が materialize される

---

### TC-025: 痩せた state に導出フィールドが無い

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出可能フィールドと fileContent を state から除く（段2）> Scenario: 痩せた state に導出フィールドが無い

---

### TC-026: pipeline の観測可能挙動が不変

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: pipeline 実行・画面出力・PR 生成が不変 > Scenario: pipeline の観測可能挙動が不変

---

### TC-034: change folder / local sidecar の path helper が一意に解決される

**Category**: unit
**Priority**: should
**Source**: tasks.md T-06 AC

**GIVEN** 任意の slug が与えられる
**WHEN** `changes/<slug>/events.jsonl`・`state.json`・`usage.json` および `.specrunner/local/<slug>/` 配下のファイルの path helper を呼ぶ
**THEN** それぞれ一意のパスが返され、規約（`changes/<slug>/` と `.specrunner/local/<slug>/`）に沿った解決になる

---

### TC-035: .specrunner/local/ が gitignore 対象

**Category**: manual
**Priority**: could
**Source**: tasks.md T-06 AC

**GIVEN** 段2 適用後のリポジトリで `.specrunner/local/<slug>/liveness.json` が存在する
**WHEN** `git status` を確認する
**THEN** `.specrunner/local/` 配下のファイルが git に追跡されない（ignored または untracked として扱われる）

---

### TC-036: managed marker.json が D7 スキーマ・write/clear タイミングに準拠する

**Category**: unit
**Priority**: should
**Source**: design.md D7 / tasks.md T-12 AC

**GIVEN** managed runtime で job が起動・完了するシナリオ
**WHEN** managed job 開始時と finish / cancel 完了時を観測する
**THEN** 開始時に `.specrunner/local/<slug>/marker.json`（`{slug, jobId, status, createdAt}`）が write され、finish / cancel 完了時に clear（削除または上書き）される

---

### TC-037: exit-guard が createExitGuardHandler(repoRoot, jobId) で自 job のみ遷移させる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-13 AC

**GIVEN** 複数 job が存在し、特定 jobId で `createExitGuardHandler(repoRoot, jobId)` が生成されている
**WHEN** `beforeExit` guard が発火する
**THEN** 指定した jobId の `state.json` / `events.jsonl` のみが `awaiting-resume` に遷移し、他 job の state に副作用を与えない

---

### TC-038: sidecar liveness.json が D8 レイアウトに準拠する

**Category**: unit
**Priority**: should
**Source**: design.md D8 / tasks.md T-09 AC

**GIVEN** local runtime で job が実行中
**WHEN** `.specrunner/local/<slug>/liveness.json` を読む
**THEN** `{pid, session, worktreePath, jobId}` フィールドが存在し、D8 のレイアウトに準拠している

---

### TC-039: interruption record が InterruptionRecord インターフェースに準拠する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-11

**GIVEN** step が timeout / signal / failure で中断する
**WHEN** `events.jsonl` に記録された末尾行を parse する
**THEN** `{type: 'interruption', reason, ts, errorCode?, exhaustionPhase?}` の `InterruptionRecord` スキーマに準拠し、`reason` が `'timeout' | 'signal' | 'failure' | 'exhaustion'` の union 型に収まる

---

### TC-040: fold が末尾 interruption record から resumePoint を materialize する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-11 / design.md D2

**GIVEN** `events.jsonl` に interruption record が複数件含まれている
**WHEN** fold を実行する
**THEN** 最後の interruption record から `resumePoint`（`reason` / `exhaustionPhase`）が materialize され、それ以前の interruption record は無視される

---

### TC-041: doctor storage checks が新レイアウトを正しく診断する

**Category**: integration
**Priority**: should
**Source**: tasks.md T-18 AC

**GIVEN** 段2 適用後の新レイアウト（`changes/<slug>/` + `.specrunner/local/<slug>/` + legacy `.specrunner/jobs/`）
**WHEN** `specrunner doctor` を実行する
**THEN** storage checks が新レイアウトを正しく診断し、誤検知（false positive）・見逃し（false negative）がない

---

### TC-042: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: could
**Source**: tasks.md T-19 AC

**GIVEN** 段2 実装完了後のコードベース
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** typecheck エラーゼロ、テスト全件 pass

---

## Result

```yaml
result: completed
total: 42
automated: 39
manual: 3
must: 27
should: 13
could: 2
blocked_reasons: []
```
