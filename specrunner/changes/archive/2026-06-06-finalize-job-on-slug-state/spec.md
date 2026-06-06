# Spec: job 終端処理の slug 正本一本化

## Requirements

### Requirement: 終端 phase 完了後に slug 正本を branch にコミットする

local runtime は pipeline の終端遷移（`running → awaiting-archive`）完了後、slug 正本（`changes/<slug>/state.json` / `events.jsonl`）と終端時点の成果物（`usage.json` 等）を feature branch に commit / push MUST する。managed runtime はこの終端 commit を no-op SHALL とする。

#### Scenario: 終端後の最終 state が branch に乗る

**Given** local runtime で pipeline が最後の step まで完走し `running → awaiting-archive` に遷移する
**When** 終端 commit seam が実行される
**Then** feature branch の最新 commit に `changes/<slug>/state.json`（`status=awaiting-archive`）と `events.jsonl`（終端 transition record を含む）が含まれる

#### Scenario: managed runtime では終端 commit が走らない

**Given** managed runtime で pipeline が完走する
**When** 終端 commit seam が呼ばれる
**Then** ローカル git 操作は行われない（no-op）

### Requirement: archive の最終遷移は slug 正本を読み・遷移・永続化する

archive の最終遷移（`markJobArchived`）は jobId-only legacy ストア（`.specrunner/jobs/<jobId>/`）ではなく、slug 正本（active の `changes/<slug>/` または archive 後の `changes/archive/<dated>-<slug>/`）の state を read → `awaiting-archive → archived` transition → 同一 location へ persist MUST する。jobId ストアへの依存を持たない MUST。

#### Scenario: awaiting-archive の slug 正本を archive すると archived になる

**Given** slug 正本の `state.json` が `awaiting-archive`
**When** `specrunner job archive <slug>` を実行する
**Then** 最終遷移が成功し status が `archived` になり、その変更が slug 正本（archive-location）に persist される

#### Scenario: 最終遷移が events.jsonl に transition record を残す

**Given** slug 正本が `awaiting-archive`
**When** 最終遷移が実行される
**Then** 同 location の `events.jsonl` に `awaiting-archive → archived` の transition record が 1 件 append される

### Requirement: finishable gate と最終遷移は同一 state ソースを読む

finishable gate（`assertJobFinishable`）と最終遷移（`markJobArchived`）は同一の state ソース（slug 正本）を参照 MUST する。gate 通過後に最終遷移が status 不整合で失敗してはならない MUST。

#### Scenario: gate 通過後に遷移が失敗しない

**Given** slug 正本が `awaiting-archive` で finishable gate を通過する
**When** 最終遷移が実行される
**Then** `running → archived` のような不正遷移は発生せず、遷移は成功する

### Requirement: archived の job は既定 job ls に表示されない

status が `archived`（終端）になった job は、既定の `specrunner job ls` に表示されない MUST。`--all` 指定時は archived を含めて表示する SHALL。

#### Scenario: archive 後の job が既定一覧から消える

**Given** ある job を archive して status が `archived` になっている
**When** `specrunner job ls`（既定）を実行する
**Then** その job は一覧に表示されない

#### Scenario: --all では archived も表示される

**Given** archived の job が存在する
**When** `specrunner job ls --all` を実行する
**Then** その archived job が一覧に表示される

### Requirement: job archive の冪等な再実行で取り残し job を archived にする

archive 済み（change folder 移動・push 済み）だが status が `awaiting-archive` のまま取り残された job を、既存 `specrunner job archive` の冪等な再実行で `archived` まで完了できる MUST。この用途で新規コマンドを追加しない MUST。

#### Scenario: 取り残し job の再実行が archived で完了する

**Given** change folder が `changes/archive/<dated>-<slug>/` に移動済みで、その `state.json` が `awaiting-archive`
**When** `specrunner job archive <slug>` を再実行する
**Then** `archiveChangeFolder` は移動済みのため skip し、最終遷移が archive-location の正本を `awaiting-archive → archived` に遷移して status が `archived` になる

#### Scenario: archived 済みへの再実行は no-op

**Given** slug 正本が既に `archived`
**When** `specrunner job archive <slug>` を再実行する
**Then** terminal status として no-op で exit 0 を返し、git 操作・遷移を行わない

### Requirement: pipeline 実行・画面出力・PR 生成が不変で検証が green

終端 commit seam の追加と archive 最終遷移の正本一本化を通じて、pipeline 実行・画面出力・PR 生成は不変 MUST。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: 観測可能挙動が不変

**Given** 本変更適用後
**When** request.md を投入して pipeline を完走させる
**Then** 適用前と同じ pipeline 実行・画面出力・PR 生成になり、`bun run typecheck && bun run test` が green になる
