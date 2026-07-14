# Spec: 並列 round の worktree 検査を fail-closed 化する（検査不能を clean と区別し escalation）

この spec は `architecture/adr/2026-07-13-execution-ownership-model.md` D3 / 提案 invariant B-15 が定める worktree 検査の **振る舞い正典**である。ADR は git 副作用の round 所有（構造）を、本 spec は worktree 検査 seam の戻り値契約（成功 / 検査不能の分離）と検査不能時の fail-closed 振る舞いを担う。B-15 の §4 / conformance / 歯（`core-invariants.test.ts`）への反映は本 request のスコープ外（実装 merge 後に attended）。

正典用語:

- **worktree 検査 seam**: `RuntimeStrategy.listWorktreeChanges(cwd)`。round member 実行後の worktree 未 commit 変更を列挙する点。
- **検査成功（success）**: worktree の状態を機械的に確定できた場合。変更 path 集合（空を含む）を伴う。
- **検査不能（unavailable）**: worktree の状態を機械的に確定できなかった場合（git 失敗等）。診断文字列（reason）を伴う。
- **coordinator round 所有点**: `ParallelReviewRound.run` が fan-out 完了後に worktree を検査し、宣言外変更を halt し、宣言済み変更を commit する単一の点。

## Requirements

### Requirement: worktree 検査 seam は「検査成功」と「検査不能」を戻り値で区別する

`RuntimeStrategy.listWorktreeChanges` は、worktree の状態を確定できた場合と確定できなかった場合を、判別共用体の戻り値で **区別しなければならない（MUST）**。検査成功は変更 path 集合（空を含む）を、検査不能は診断文字列を伴う。seam は例外を **throw してはならない（MUST NOT）**。検査不能を検査成功（空の変更集合）と同一視して **はならない（MUST NOT）**。

seam の error 情報は診断文字列に限定し、port が domain 型へ依存して **はならない（MUST NOT）**。domain のエラー表現への写像は consumer が担う。

#### Scenario: 検査成功は変更集合を伴って返る

**Given** runtime が worktree の状態を機械的に確定できる
**When** coordinator round 所有点が `listWorktreeChanges(cwd)` を呼ぶ
**Then** 戻り値は検査成功であり、worktree 相対の変更 path 集合（空を含む）を伴う

#### Scenario: 検査不能は診断文字列を伴って返る

**Given** runtime が worktree の状態を機械的に確定できない
**When** coordinator round 所有点が `listWorktreeChanges(cwd)` を呼ぶ
**Then** 戻り値は検査不能であり、原因を示す診断文字列を伴う
**And** seam は例外を throw しない

### Requirement: local runtime は git 失敗を検査不能として返す

local runtime の `listWorktreeChanges` は、`git status` が **exit 0 で完了したときのみ検査成功**（変更 path 集合を伴う）を返さなければならない（MUST）。`git status` の **非ゼロ終了・spawn 例外・その他例外**のときは **検査不能**を返さなければならず（MUST）、その診断文字列に exit code またはエラー概要を含めなければならない（MUST）。これらの失敗経路で空の変更集合（検査成功）を返して **はならない（MUST NOT）**。

#### Scenario: git status が exit 0 なら検査成功

**Given** local worktree で `git status` が exit 0 で完了する
**When** `listWorktreeChanges(cwd)` を呼ぶ
**Then** 戻り値は検査成功であり、worktree の未 commit 変更（追加・変更・削除・untracked）を worktree 相対 path で伴う

#### Scenario: git status が非ゼロ終了なら検査不能

**Given** local worktree で `git status` が非ゼロで終了する
**When** `listWorktreeChanges(cwd)` を呼ぶ
**Then** 戻り値は検査不能であり、診断文字列に exit code を含む
**And** 空の変更集合（検査成功）は返らない

#### Scenario: spawn 例外なら検査不能

**Given** `git status` の spawn が例外を投げる（git 不在等）
**When** `listWorktreeChanges(cwd)` を呼ぶ
**Then** 戻り値は検査不能であり、診断文字列にエラー概要を含む

### Requirement: managed runtime は検査成功の空集合を返す

managed runtime の `listWorktreeChanges` は、local worktree を持たない構造的事実を反映し、**検査成功かつ空の変更集合**を返さなければならない（MUST）。managed の「変更なし」は検査失敗ではなく真の空であるため、検査不能を返して **はならない（MUST NOT）**。挙動は本変更前と同一である。

#### Scenario: managed は常に検査成功の空集合を返す

**Given** managed runtime（local worktree を持たない）
**When** `listWorktreeChanges(cwd)` を任意の cwd で呼ぶ
**Then** 戻り値は検査成功であり、変更 path 集合は空である
**And** 検査不能は返らない

### Requirement: coordinator は検査不能を受けたら round を fail-closed で escalation する

coordinator round 所有点は、worktree 検査が **検査不能**を返したとき、round を **escalation** させなければならない（MUST）。このとき aggregate verdict は escalation であり、round error は `code = "ROUND_INSPECTION_UNAVAILABLE"` を持ち、その message は検査不能の診断文字列を反映しなければならない（MUST）。coordinator は `commitRoundArtifacts`（stage / commit / push）を **呼び出してはならない（MUST NOT）**。すなわち、検査できていない worktree を approved に落として **はならない（MUST NOT）**。この escalation では、round member の reviewer status を approved に確定せず pending のまま persist しなければならない（MUST）——resume で fan-out が再実行され再検査されるため。同じ扱いは検査成功時の宣言外変更（`ROUND_NONDECLARED_CHANGE`）escalation にも適用される（MUST）。

検査が **検査成功**を返したときは、宣言外変更検出（changed ⊆ declared）と scoped commit の既存挙動が **不変でなければならない（MUST）**。

#### Scenario: 検査不能なら escalation し commit しない

**Given** worktree 検査が検査不能（診断文字列付き）を返す
**When** coordinator round 所有点が検査結果を処理する
**Then** round の outcome は escalation になる
**And** round error の code は `ROUND_INSPECTION_UNAVAILABLE` であり、message に検査不能の診断が反映される
**And** coordinator は `commitRoundArtifacts` を呼ばない

#### Scenario: 検査 escalation では round member を pending のまま persist する

**Given** 全 round member が approved を返した round で、worktree 検査が検査不能を返す、または宣言外変更を検出する
**When** coordinator round 所有点が検査結果を処理する
**Then** round member の reviewer status は approved に確定されず pending のまま persist される
**And** resume 時に member が再選出され、fan-out が再実行されて worktree が再検査される

#### Scenario: 検査成功なら従来の宣言外変更検出・scoped commit が働く

**Given** worktree 検査が検査成功（変更 path 集合付き）を返す
**When** coordinator round 所有点が検査結果を処理する
**Then** 変更 path 集合に対し宣言外変更検出（changed ⊆ declared）が従来どおり実行される
**And** 宣言外変更があれば `ROUND_NONDECLARED_CHANGE` で escalation する
**And** 宣言済み変更があれば scoped commit（`commitRoundArtifacts`）が従来どおり実行される

#### Scenario: 検査 seam 未実装の runtime では検査を skip する

**Given** runtime が `listWorktreeChanges` を実装していない（method 省略）
**When** coordinator round 所有点が worktree 検査を試みる
**Then** 検査・commit は skip され、round は従来どおり member 判定から aggregate verdict を導出する
