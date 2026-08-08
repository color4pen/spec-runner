# Spec: step prompt に change folder 入力 artifact を同梱する

## Requirements

### Requirement: 存在する入力 artifact を prompt に同梱する

local runtime の agent step の prompt 組み立て時、システムは change folder 直下の入力系 artifact
（`request.md` / `design.md` / `tasks.md` / `spec.md` / `test-cases.md` / `rules.md`）のうち
その時点で存在するものの内容を prompt に同梱 SHALL する。同梱ブロックはファイル毎に worktree 相対
パスのヘッダを付し、「既に本文に含まれるため改めて Read する必要はない（Read してもよい）」旨を明示 SHALL する。

#### Scenario: 存在する artifact が同梱される

**Given** change folder に `design.md` と `tasks.md` が存在する
**When** 共有層が当該 slug の同梱ブロックを組み立てる
**Then** 同梱ブロックに `specrunner/changes/<slug>/design.md` と `specrunner/changes/<slug>/tasks.md`
のパスヘッダと各ファイルの内容が含まれる

#### Scenario: 存在しない artifact はスキップされる

**Given** change folder に `design.md` のみ存在し `tasks.md` / `spec.md` 等は存在しない
**When** 共有層が同梱ブロックを組み立てる
**Then** 同梱ブロックには `design.md` のみが含まれ、存在しないファイルのパスヘッダは含まれない

### Requirement: 出力系 artifact は同梱しない

システムは出力系 artifact（`verification-result.md` / `*-result-*.md` / `implementation-notes.md` 等）を
prompt に同梱 SHALL NOT する。対象は固定の許可リストで定義され、リスト外のファイルは構造的に除外される。

#### Scenario: 出力系 artifact が除外される

**Given** change folder に `design.md`・`verification-result.md`・`code-review-result-001.md`・
`implementation-notes.md` が存在する
**When** 共有層が同梱ブロックを組み立てる
**Then** 同梱ブロックには `design.md` のみが含まれ、`verification-result.md` /
`code-review-result-001.md` / `implementation-notes.md` は含まれない

### Requirement: 合計サイズ上限超過時は同梱しない（fail-open）

同梱対象として存在した artifact の合計サイズが上限（64KB）を超える場合、システムは同梱を行わず
従来どおりの prompt（同梱ブロックなし）を組み立て SHALL する。部分同梱は SHALL NOT 行う。

#### Scenario: 上限超過で同梱なしにフォールバックする

**Given** change folder の入力 artifact 合計サイズが 64KB を超える
**When** 共有層が同梱ブロックを組み立てる
**Then** 同梱ブロックは空となり、prompt は同梱前と同一（従来動作）になる

#### Scenario: change folder に入力 artifact が無い場合も従来動作になる

**Given** change folder が存在しない、または入力 artifact が 1 つも存在しない
**When** 共有層が同梱ブロックを組み立てる
**Then** 同梱ブロックは空となり、prompt は同梱前と同一（従来動作）になる

### Requirement: step 文言不変・探索非制限

同梱は adapter 共有層で行い、各 step の buildMessage の文言を SHALL NOT 変更する。
同梱後も agent による artifact の Read・その他ファイルの探索は従来どおり許可 SHALL されたままとする。

#### Scenario: buildMessage 文言が変わらない

**Given** 同梱機能が有効になっている
**When** 各 step の buildMessage を呼び出す
**Then** buildMessage の出力文字列は同梱機能導入前と同一である（`src/core/step/` 配下の既存
buildMessage テストが無改変で green）
