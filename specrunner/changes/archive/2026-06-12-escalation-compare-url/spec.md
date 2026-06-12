# Spec: escalation 通知コメントに branch の compare URL を含める

## Requirements

### Requirement: escalation 通知コメントは branch の compare URL を含む

issue に紐付いた job が `awaiting-resume`（escalation）へ遷移し、停止時点で branch が確定している
（`state.branch` が非 null の）とき、escalation 通知コメント本文は当該 branch の GitHub compare URL
`https://github.com/{owner}/{repo}/compare/{base}...{branch}` を 1 行含む SHALL。owner / repo は
job の repository 情報から取得する MUST。URL 行は既存の停止 step・理由・再開コマンドと併存する SHALL。

#### Scenario: branch が確定した escalation で compare URL がコメントに含まれる

**Given** branch が `feat/my-slug-12345678`、repository が `owner` / `repo` の job が
`awaiting-resume` へ遷移する
**When** escalation 通知コメント本文を生成する
**Then** 本文に `https://github.com/owner/repo/compare/main...feat/my-slug-12345678` を含む 1 行があり、
従来どおり marker・停止 step・理由・`specrunner job resume <slug>` も含む

### Requirement: branch 未確定時は compare URL を省略して従来文面で投稿する

job の `state.branch` が `null`（branch 作成前の escalation）のとき、システムは compare URL 行を
生成しない SHALL。この場合でも escalation 通知コメントは従来どおり marker・停止 step・理由・
再開コマンドを含む本文で投稿される MUST（URL を組み立てられないことが投稿自体を妨げてはならない
MUST NOT）。

#### Scenario: branch が null の escalation は URL 行なしで投稿される

**Given** `state.branch` が `null` の job が `awaiting-resume` へ遷移する
**When** escalation 通知コメント本文を生成する
**Then** 本文は compare URL（`/compare/`）を含まず、marker・停止 step・理由・
`specrunner job resume <slug>` を含む従来の文面である

### Requirement: compare URL の base は request.md の base-branch を反映する

compare URL の base 部分は、当該 request の base-branch（request.md の base-branch）を反映する SHALL。
base-branch は job 起動時に job state へ永続化され、通知コメント生成時に state から参照できる MUST。
base-branch が state に記録されていない（legacy state file の）場合は `main` を既定値として用いる SHALL。

#### Scenario: base-branch が main 以外の request で URL の base に反映される

**Given** base-branch が `develop`、branch が `feat/my-slug-12345678` の job が `awaiting-resume` へ
遷移する
**When** escalation 通知コメント本文を生成する
**Then** 本文の compare URL は `https://github.com/owner/repo/compare/develop...feat/my-slug-12345678`
である

#### Scenario: base-branch が未記録の state では main にフォールバックする

**Given** base-branch を持たない（legacy）state の job が `awaiting-resume` へ遷移し、branch が確定して
いる
**When** escalation 通知コメント本文を生成する
**Then** compare URL の base 部分は `main` である

### Requirement: base-branch は job 起動時に永続化され round-trip で保持される

`job start`（および alias `run`）で起動した job は、request の base-branch を job state に記録する SHALL。
記録された base-branch は state の保存・復元（load）で保持される MUST。base-branch を記録していない
legacy state file は従来どおり load でき、エラーにならない SHALL。

#### Scenario: base-branch が persist→load で保持される

**Given** base-branch `develop` を持つ job state を保存する
**When** 別プロセスで state を load する
**Then** load された state の request 情報の base-branch は `develop` である

#### Scenario: base-branch 欠落の legacy state が load できる

**Given** base-branch フィールドを持たない legacy state file
**When** state を load・検証する
**Then** 検証はエラーにならず、base-branch は未設定（既定 `main` 扱い）として扱われる
