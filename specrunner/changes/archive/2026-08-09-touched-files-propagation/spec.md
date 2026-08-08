# Spec: 先行 step の touched files を後続 step prompt に伝搬する

## Requirements

### Requirement: 完全 input を持つ message 種別から touched files を記録する

claude-code adapter は、agent の main work turn の実行中に、agent が使用した Read / Edit / Write の
対象ファイルパスを step 単位で記録し、`AgentRunResult.touchedFiles` として返さなければならない（MUST）。
抽出は input が完全な形で得られる message 種別（SDK `type: "assistant"` message の `tool_use` block）から
のみ行い、streaming の部分的 input（`content_block_start`）を根拠にしてはならない（MUST NOT）。

#### Scenario: assistant message の Read/Edit/Write からパスが抽出される

**Given** claude-code adapter が message stream を観測している
**And** stream に `type: "assistant"` message が含まれ、その content に `name: "Read"` /
`name: "Edit"` / `name: "Write"` の tool_use block（完成した `input.file_path` を持つ）が含まれる
**When** adapter が main work turn を消費し終える
**Then** `AgentRunResult.touchedFiles` に、それら 3 tool の `file_path`（正規化済み）が含まれる

#### Scenario: 部分的 input の content_block_start は記録されない

**Given** stream に `type: "stream_event"` の `content_block_start`（tool_use、`input` が空 `{}`）が含まれる
**And** 対応する完成 tool_use を含む `type: "assistant"` message は stream に存在しない
**When** adapter が main work turn を消費し終える
**Then** `AgentRunResult.touchedFiles` にその tool のパスは含まれない

#### Scenario: Grep / Glob / Bash は記録対象外

**Given** stream の assistant message に `name: "Grep"` / `name: "Glob"` / `name: "Bash"` の tool_use block が含まれる
**When** adapter が main work turn を消費し終える
**Then** `AgentRunResult.touchedFiles` にはそれらの tool 由来のパス・パターン・コマンドが含まれない

### Requirement: 記録パスを worktree 相対に正規化し、対象外パスを除外する

記録するパスは worktree 相対に正規化しなければならない（MUST）。worktree 外のパスと change folder
（`specrunner/changes/`）配下のパスは記録から除外しなければならない（MUST）。step 内で重複を排除し（MUST）、
1 step あたり最大 100 件で打ち切らなければならない（MUST）。

#### Scenario: worktree 外のパスは除外される

**Given** assistant message の Read block の `file_path` が worktree 外（相対化すると `..` で始まる、
または worktree 外の絶対パス）を指す
**When** adapter がそのパスを正規化する
**Then** そのパスは `touchedFiles` に含まれない

#### Scenario: change folder 配下のパスは除外される

**Given** assistant message の Edit block の `file_path` が `specrunner/changes/<slug>/` 配下を指す
**When** adapter がそのパスを正規化する
**Then** そのパスは `touchedFiles` に含まれない

#### Scenario: 同一パスは重複排除される

**Given** assistant message 群に同一ファイルへの Read と Edit（同じ worktree 相対パスに正規化される）が含まれる
**When** adapter が記録を確定する
**Then** `touchedFiles` にそのパスは 1 回だけ含まれる

#### Scenario: 100 件で打ち切られる

**Given** worktree 内・change folder 外の相異なる 100 件超のファイルが touch される
**When** adapter が記録を確定する
**Then** `touchedFiles` は最大 100 件で打ち切られる

### Requirement: 記録を state store に一元化して永続化し、再実行で置換する

記録は pipeline の in-memory state を経由し、既存 state store に一元化して永続化しなければならない（MUST）。
別 store からの disk 直接追記を行ってはならない（MUST NOT）。同一 step が再実行された場合、その step の記録は
最新 run の記録で置き換えなければならない（MUST）。

#### Scenario: 成功した sequential step の記録が state に書き込まれる

**Given** claude-code の sequential agent step が成功し、`AgentRunResult.touchedFiles` に 2 件のパスを持つ
**When** CommitOrchestrator がその成功結果を state に反映して永続化する
**Then** `state.touchedFiles[<step 名>]` にその 2 件が記録される
**And** その記録は既存 state store（state.json）を通じて永続化される

#### Scenario: 同一 step の再実行で記録が置換される

**Given** step X の run 1 が `["a.ts", "b.ts"]` を記録済みで `state.touchedFiles["X"]` にある
**When** step X の run 2 が成功し `["b.ts", "c.ts"]` を返す
**Then** `state.touchedFiles["X"]` は `["b.ts", "c.ts"]` に置き換わる（run 1 の記録は残らない）

#### Scenario: 記録しない runtime は state を触らない

**Given** `AgentRunResult.touchedFiles` が `undefined`（codex / managed runtime）
**When** CommitOrchestrator がその成功結果を state に反映する
**Then** `state.touchedFiles` にその step のエントリは追加されない

### Requirement: 後続 step の prompt に先行 step の記録をヒントとして注入する

後続 step の prompt 組み立て時に、共有層は先行 step の記録を「step 名 → ファイル一覧」のセクションとして
prompt に注入しなければならない（MUST）。注入文言には「出発点のヒントであり網羅ではない。レビュー・探索の
範囲をこの一覧に制限してはならない」という趣旨を明記しなければならない（MUST）。注入対象は現在の step 以外
（先行 step）の記録とする。記録が空の場合は注入を行わず、prompt は従来と同一でなければならない（MUST、fail-open）。

#### Scenario: 先行 step 記録あり → セクションと制限禁止文言が含まれる

**Given** `state.touchedFiles` に先行 step（例: implementer）の非空ファイル一覧が記録されている
**When** 後続 step（例: code-review）の prompt を共有層が組み立てる
**Then** prompt に先行 step 名とそのファイル一覧を含むセクションが含まれる
**And** 「レビュー・探索の範囲をこの一覧に制限してはならない」という趣旨の文言が含まれる

#### Scenario: 記録なし → 従来 prompt と同一

**Given** `state.touchedFiles` が空、または現在の step 以外の非空記録が存在しない
**When** 後続 step の prompt を共有層が組み立てる
**Then** 注入は行われず、prompt は注入前と byte 単位で同一である

### Requirement: 注入セクションのサイズ上限を超えたら注入しない

注入セクションの合計サイズには上限（16KB）を設けなければならない（MUST）。構築したセクションが上限を
超える場合、注入を行ってはならない（MUST NOT、部分注入もしない）。この場合 prompt は従来と同一とする（fail-open）。

#### Scenario: 16KB 超過 → 注入なし

**Given** 先行 step の記録から構築したセクションの UTF-8 バイト長が 16KB を超える
**When** 後続 step の prompt を共有層が組み立てる
**Then** そのセクションは注入されず、prompt は注入前と同一である（部分的なセクションも含まれない）

### Requirement: resume 経路で記録が保持され、resume 後の step にも注入される

state 保存 → resume 読み出しの往復で、先行 step の touched files 記録が失われてはならない（MUST NOT）。
resume 後に実行される後続 step の prompt にも、保持された記録が注入されなければならない（MUST）。

#### Scenario: state 往復で記録が保持される

**Given** `state.touchedFiles` に先行 step の記録を持つ state を state store に保存する
**When** その state を store から読み出す（resume 経路）
**Then** 読み出した state の `state.touchedFiles` に先行 step の記録が保持されている

#### Scenario: resume 後の step prompt に注入される

**Given** resume で読み出した state が `state.touchedFiles` に先行 step の非空記録を持つ
**When** resume 後の後続 step の prompt を共有層が組み立てる
**Then** prompt に先行 step 名とそのファイル一覧のセクションが注入される

### Requirement: codex は記録せず、注入は共有層経由で将来拡張可能とする

codex adapter は touched files を記録してはならない（MUST NOT）。注入側は claude-code / codex 双方で
同一の共有層関数を経由しなければならず（MUST）、将来 codex 側が記録を実装した場合に注入側の追加変更なしで
記録が注入される形でなければならない（MUST）。

#### Scenario: codex job では記録が生成されず注入もされない

**Given** codex runtime の job（どの step も touched files を記録しない）
**When** 後続 step の prompt を共有層が組み立てる
**Then** `state.touchedFiles` は空のままで、注入は行われない（従来 prompt）

#### Scenario: 注入は両 adapter で共通の共有層関数を経由する

**Given** claude-code adapter と codex adapter の prompt 組成コード
**When** それぞれが後続 step の prompt を組み立てる
**Then** いずれも同一の共有層注入関数を呼び出しており、記録が存在すれば同じ形式で注入される
