# Spec: 並列 round の git 副作用を coordinator が round 単位で所有する（scoped staging・非宣言変更 halt）

この spec は `architecture/adr/2026-07-13-execution-ownership-model.md` の **D3（git 副作用の round 所有 ＋ scoped staging）** の振る舞い正典である。ADR は所有権の配置（構造）を、本 spec は staging 機構・出力排他契約（changed ⊆ declared）・round commit の振る舞いを担う。

正典用語:

- **member 実行経路**: `ParallelReviewRound` が fan-out した custom reviewer step を `StepExecutor.execute` で実行する経路。
- **coordinator round 所有点**: `ParallelReviewRound.run` が fan-out 完了後に round member の宣言出力を stage / commit / push する単一の点。
- **宣言出力（declared outputs）**: round member step の `writes(state, deps)` が返す worktree 相対 path の集合。
- **pipeline 管理 path**: pipeline / store が member 実行中に書き込む簿記ファイル（`specrunner/changes/<slug>/state.json` / `events.jsonl` / `usage.json`）。宣言出力ではなく、round commit にも宣言判定にも含めない。

## Requirements

### Requirement: member 実行経路は git stage/commit port を呼ばない

member 実行経路（round が fan-out した member の `StepExecutor.execute`）は、git stage / commit port（`RuntimeStrategy.finalizeStepArtifacts` すなわち `git add` ＋ `commit` ＋ `push`）を **呼び出してはならない（MUST NOT）**。member の成果物は worktree に未 commit のまま置かれ、coordinator round 所有点が commit する。

member 帰属は git commit ではなく、出力ファイル名・`StepRun`・history・reviewer status が保持する。

#### Scenario: round 所有下の member 実行は commit port を呼ばない

**Given** coordinator が round member を fan-out し、その実行入力が round 所有（`roundOwnsGitEffects`）を宣言している
**When** `StepExecutor` が member の agent step を成功裏に実行する
**Then** `RuntimeStrategy.finalizeStepArtifacts` は一度も呼ばれない
**And** member の宣言出力ファイルは worktree に未 commit で存在する

#### Scenario: 逐次経路の step 実行は従来どおり commit port を呼ぶ

**Given** pipeline が逐次 step（round 所有を宣言しない実行入力）を実行する
**When** `StepExecutor` が agent step を成功裏に実行する
**Then** `RuntimeStrategy.finalizeStepArtifacts`（`git add -A` ＋ `commit` ＋ `push`）が従来どおり呼ばれる

### Requirement: coordinator は round member の宣言出力 union だけを scoped stage する

coordinator round 所有点は、round で実行した member の宣言出力の union に **限定して** stage しなければならない（MUST）。stage は worktree 全体を無差別に対象とする `git add -A`（pathspec なし）を **使ってはならず（MUST NOT）**、宣言 path を pathspec に指定した scoped add（`git add -A -- <declared...>`）でなければならない。宣言範囲内の削除・置換も同じ scoped add で拾う。

pipeline 管理 path（`state.json` / `usage.json` / `events.jsonl`）は round commit に **含めてはならない（MUST NOT）**。これらは member 実行中に pipeline / store が書き込むが、宣言出力ではないため round commit の対象外であり、後続 step の commit に委ねる。

#### Scenario: 宣言出力だけが round commit へ入る

**Given** round member が各自の宣言出力ファイルだけを worktree に書き出した
**And** member 実行中に pipeline が `state.json` / `events.jsonl` / `usage.json` を更新した
**When** coordinator round 所有点が stage / commit を行う
**Then** stage 対象は宣言出力 union に含まれる（かつ実際に変更された）path だけである
**And** `state.json` / `events.jsonl` / `usage.json` は round commit に含まれない
**And** stage は pathspec を伴わない `git add -A` を用いない

#### Scenario: 宣言範囲内の削除・置換を拾う

**Given** ある宣言出力 path が member によって置換または削除された
**When** coordinator round 所有点が scoped add を行う
**Then** その宣言 path の置換・削除が round commit に反映される

### Requirement: 非宣言変更があれば round 全体を halt する

coordinator round 所有点は、round の changed files（worktree 変更、pipeline 管理 path を除く）が宣言出力 union の範囲内であること（changed ⊆ declared）を検証しなければならない（MUST）。範囲外の変更が 1 つでもあれば、member 単位の attribution は不可能なため **round 全体を halt** する（MUST）。halt 時は round commit を行わず、escalation として pipeline を停止し、範囲外 path を記録する。

#### Scenario: member が宣言外のファイルを変更したら round を halt する

**Given** ある round member が自身の宣言出力に含まれない path（例: source file）を変更した
**When** coordinator round 所有点が changed ⊆ declared を検証する
**Then** round の outcome は escalation になる
**And** coordinator は round commit（stage / commit / push）を行わない
**And** 範囲外の path が round の StepRun / error に記録される

#### Scenario: 変更が宣言範囲内なら halt せず commit する

**Given** すべての round member が自身の宣言出力だけを変更した（pipeline 管理 path の更新を除く）
**When** coordinator round 所有点が changed ⊆ declared を検証する
**Then** halt は発生しない
**And** coordinator は宣言出力を scoped stage して commit / push する
**And** aggregate verdict（approved / needs-fix）は member の判定から従来どおり導出される

#### Scenario: pipeline 管理 path の更新は halt を誘発しない

**Given** round の worktree 変更が宣言出力と pipeline 管理 path（`state.json` / `events.jsonl` / `usage.json`）だけからなる
**When** coordinator round 所有点が changed ⊆ declared を検証する
**Then** pipeline 管理 path は宣言判定から除外され、halt は発生しない

### Requirement: 逐次経路の commit 挙動を変えない

本変更は member 実行経路と coordinator round 所有点にのみ作用する。逐次経路（`StepExecutor.execute` を pipeline 本ループから直接呼ぶ経路）の `finalizeStepArtifacts` による `git add -A` ＋ `commit` ＋ `push` の挙動は **不変でなければならない（MUST）**。

#### Scenario: 逐次 step の commit は byte-for-byte 不変

**Given** custom reviewer を持たない標準 pipeline を実行する
**When** 各逐次 step が成功裏に完了する
**Then** 各 step の commit（`git add -A` ＋ `<step>: <slug>` ＋ push）は本変更前と同一の挙動である
