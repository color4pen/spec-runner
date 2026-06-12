# Spec: findingRef 検証の EISDIR 誤判定修正

## Requirements

### Requirement: 実在ディレクトリは nonExistent 扱いにならない

`verifyFindingRefs` は、`file` フィールドが worktree 内の実在するディレクトリを指す FindingRef を nonExistent として返してはならない（`line` が未指定の場合）。

#### Scenario: local runtime — 実在ディレクトリ参照（line なし）

**Given** worktree に `tests/unit/adapter/github/` ディレクトリが実在する
**When** `verifyFindingRefs([{ file: "tests/unit/adapter/github/" }], cwd, branch)` を local runtime で呼ぶ
**Then** 返却配列は空（nonExistent なし）

#### Scenario: managed runtime — 実在ディレクトリ参照（line なし）

**Given** `getRawFile` がそのパスに対して JSON 配列文字列を返す（ディレクトリ）
**When** `verifyFindingRefs([{ file: "tests/unit/adapter/github/" }], cwd, "main")` を managed runtime で呼ぶ
**Then** 返却配列は空（nonExistent なし）

---

### Requirement: 存在しないパスは nonExistent のまま

`verifyFindingRefs` は、存在しないパスを参照する FindingRef を引き続き nonExistent として返さなければならない。

#### Scenario: local runtime — 存在しないパス

**Given** `src/does-not-exist.ts` が worktree に存在しない
**When** `verifyFindingRefs([{ file: "src/does-not-exist.ts" }], cwd, null)` を local runtime で呼ぶ
**Then** 返却配列に当該 FindingRef が含まれる

#### Scenario: managed runtime — getRawFile が null を返す

**Given** `getRawFile` が null を返す
**When** `verifyFindingRefs([{ file: "src/missing.ts" }], cwd, "main")` を managed runtime で呼ぶ
**Then** 返却配列に当該 FindingRef が含まれる

---

### Requirement: ファイルの行数超過は nonExistent のまま

`verifyFindingRefs` は、実在するファイルを指しているが `line` が実際の行数を超える FindingRef を nonExistent として返さなければならない。

#### Scenario: local runtime — 行数超過

**Given** `src/three-lines.ts` が 3 行しかない
**When** `verifyFindingRefs([{ file: "src/three-lines.ts", line: 100 }], cwd, null)` を local runtime で呼ぶ
**Then** 返却配列に当該 FindingRef が含まれる

#### Scenario: managed runtime — 行数超過

**Given** `getRawFile` が 3 行の内容を返す
**When** `verifyFindingRefs([{ file: "src/short.ts", line: 100 }], cwd, "main")` を managed runtime で呼ぶ
**Then** 返却配列に当該 FindingRef が含まれる

---

### Requirement: ディレクトリ + line 指定は nonExistent

`verifyFindingRefs` は、`file` フィールドが実在するディレクトリを指し、かつ `line` が指定されている FindingRef を nonExistent として返さなければならない。

#### Scenario: local runtime — 実在ディレクトリ + line

**Given** worktree に `tests/unit/adapter/github/` ディレクトリが実在する
**When** `verifyFindingRefs([{ file: "tests/unit/adapter/github/", line: 5 }], cwd, null)` を local runtime で呼ぶ
**Then** 返却配列に当該 FindingRef が含まれる

#### Scenario: managed runtime — ディレクトリ（JSON 配列）+ line

**Given** `getRawFile` がそのパスに対して JSON 配列文字列を返す（ディレクトリ）
**When** `verifyFindingRefs([{ file: "tests/unit/adapter/github/", line: 5 }], cwd, "main")` を managed runtime で呼ぶ
**Then** 返却配列に当該 FindingRef が含まれる
