# Spec: verification result の絶対パス正規化

## Requirements

### Requirement: verification result は実行マシンの絶対パスを含んではならない

The system SHALL normalize absolute machine paths out of the command output before
writing `verification-result.md`. Paths under the verification cwd (worktree root) MUST be
rewritten to repository-relative form, and any remaining paths under the user's home
directory (`$HOME`) MUST be replaced with the placeholder `~`. The normalization SHALL be
applied at a single writer seam (the function that assembles and writes the result markdown)
and MUST NOT alter command execution, verdict determination, or the returned
`VerificationResult` object.

#### Scenario: cwd 配下の絶対パスが repo 相対化される

**Given** あるコマンドの stdout が verification cwd（worktree root）配下の絶対パス
（例 `<cwd>/src/foo.ts`）を含む
**When** verification result が書き出される
**Then** 書き出された `verification-result.md` には当該絶対パスが含まれず、repo 相対の
形（例 `src/foo.ts`）に置換されている

#### Scenario: cwd 外の $HOME 配下パスがプレースホルダ化される

**Given** あるコマンドの stdout が cwd 外で `$HOME` 配下の絶対パス
（例 `<home>/.cache/x`）を含む
**When** verification result が書き出される
**Then** 書き出された `verification-result.md` には当該絶対パスが含まれず、`~` プレースホルダ
（例 `~/.cache/x`）に置換されている

#### Scenario: verdict 判定と phase 実行の挙動が不変

**Given** 任意の phase 出力（パスを含む / 含まない）
**When** verification を実行する
**Then** 返却される `VerificationResult` の `verdict` と各 `PhaseResult`（status / exitCode /
stdout / stderr）は正規化前と同一であり、phase の実行順・fail-fast 挙動は変わらない
