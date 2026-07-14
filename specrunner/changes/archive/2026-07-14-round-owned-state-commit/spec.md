# Spec: 並列 round の state commit を coordinator が round 単位で所有する（member no-persist）

この spec は `architecture/adr/2026-07-13-execution-ownership-model.md` の **D1（state commit の単一所有者）** の並列 round 振る舞い正典である。ADR は所有権の配置（構造）を、本 spec は member no-persist ／ round 単一 commit ／ crash 整合性 ／ 結果不変の振る舞いを担う。R5（`round-owned-git-effects`）が git 副作用の round 所有を、本 spec が state commit の round 所有を定める。

正典用語:

- **member 実行経路**: `ParallelReviewRound` が fan-out した custom reviewer step を `StepExecutor` の producer-only 経路（`produceResult`）で実行する経路。
- **coordinator round 所有点**: `ParallelReviewRound.run` が fan-out 完了後に round の state を確定する単一の点（`CommitOrchestrator.commitRound` 経由）。
- **`StepExecutionResult`**: member 実行が返す immutable な実行結果値（`success` / `skipped` / `halt` の discriminated union、R2 で定義済み）。
- **pipeline 管理 path**: pipeline / store が書き込む簿記ファイル（`state.json` / `events.jsonl` / `usage.json`）。

## Requirements

### Requirement: member 実行経路は state を persist しない

member 実行経路（round が fan-out した member の producer-only 実行）は、state mutation / persist API（`store.persist` / `store.update` / `store.appendHistory` / `store.fail`）を **呼び出してはならない（MUST NOT）**。member は実行結果を `StepExecutionResult` として返し、state への確定は coordinator round 所有点に委ねる。

member 帰属は state の中間 persist ではなく、返された `StepExecutionResult`（および round commit 後の `StepRun` / reviewer status）が保持する。

#### Scenario: round member の実行は state を persist しない

**Given** coordinator が round member を fan-out し、その実行入力が round 所有（`roundOwnsGitEffects`）を宣言している
**When** `StepExecutor` が member の agent step を producer-only 経路で実行する
**Then** `store.persist` / `store.update` / `store.appendHistory` / `store.fail` は一度も呼ばれない
**And** member 実行は `StepExecutionResult`（`success` / `skipped` / `halt`）を返す

#### Scenario: 逐次経路の step 実行は従来どおり persist する

**Given** pipeline が逐次 step（round 所有を宣言しない実行入力）を実行する
**When** `StepExecutor` が step を実行する
**Then** `CommitOrchestrator` の逐次経路（`begin` / `commitSuccess` 等）による state persist が従来どおり行われる

### Requirement: coordinator は round 完了後に一度だけ CommitOrchestrator 経由で commit する

coordinator round 所有点は、member の `StepExecutionResult` を集約し、round 完了後に **一度だけ** `CommitOrchestrator` 経由で state へ commit しなければならない（MUST）。coordinator は round の state を直接 persist（`store.persist` の直接呼び出し）**してはならず（MUST NOT）**、逐次経路と同じ writer 型（`CommitOrchestrator`）へ収束させる。

commit する round の state には、全 member の `StepRun`・reviewer status 更新・synthetic coordinator `StepRun` が含まれる。

#### Scenario: fan-out round は単一 commit で確定する

**Given** coordinator が複数の pending member を fan-out し、各 member が `StepExecutionResult` を返した
**When** coordinator round 所有点が round を確定する
**Then** state の persist は round につき一度だけ `CommitOrchestrator` 経由で行われる
**And** その単一 commit に全 member の `StepRun` と synthetic coordinator `StepRun` が含まれる

#### Scenario: 全 member approved の fast path も単一 commit で確定する

**Given** すべての member が approved 済み（pending が無い）
**When** coordinator round 所有点が round を確定する
**Then** member を実行せず、synthetic coordinator `StepRun`（approved）を含む state を一度だけ `CommitOrchestrator` 経由で commit する

### Requirement: crash 相当で on-disk state は member 部分 projection にならない

round の state 書き込みは、fan-out 前（round 開始前の state）か round 完了後（単一 commit 後の state）の **いずれか** でなければならない（MUST）。fan-out の途中で member 単位の中間 state を on-disk `state.json` へ書き込んで **はならない（MUST NOT）**。よって crash 相当のどの時点でも、on-disk `state.json` は「一部の member だけ反映された部分 projection」にならない。

#### Scenario: fan-out 途中に部分 projection が残らない

**Given** round が複数 member を fan-out する
**When** member の一部が完了し他が未完了の時点を観測する
**Then** on-disk `state.json` に「完了した member の `StepRun` だけが入り他 member が未反映」の中間状態は書き込まれていない
**And** state の on-disk 書き込みは round 完了後の単一 commit でのみ発生する

### Requirement: round の verdict 集約・reviewer status の結果を不変に保つ

member no-persist ／ 単一 commit への移行は、round の観測可能な結果を変えて **はならない（MUST NOT）**。member verdict の集約（escalation > needs-fix > approved の優先規則）、reviewer status の更新、synthetic coordinator `StepRun` の verdict / error は、本変更前と一致しなければならない（MUST）。

#### Scenario: aggregate verdict が従来と一致する

**Given** round member の verdict が {approved, needs-fix} である
**When** coordinator round 所有点が verdict を集約する
**Then** aggregate verdict は needs-fix になる（従来の優先規則と一致）
**And** reviewer status の更新（approved → approvedAtCommit 記録、needs-fix → pending へ戻す）が従来と一致する

#### Scenario: member escalation / halt が aggregate escalation を導く

**Given** ある round member の `StepExecutionResult` が halt（またはエスカレーション verdict）である
**When** coordinator round 所有点が verdict を集約する
**Then** aggregate verdict は escalation になる
**And** その member の失敗は job 全体を failed に落とさず、`StepRun` に記録される（pipeline の escalate 終端は従来どおり aggregate escalation が担う）
