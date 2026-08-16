# Spec: rules の配送方式 `delivery`

## Requirements

### Requirement: rule ファイルの frontmatter で配送方式を宣言できる

各 rule ファイル（`specrunner/rules/<step>/*.md`）は、先頭の YAML frontmatter に
`delivery: followup | prompt` を宣言することで配送方式を選べる。CLI は frontmatter の
`delivery` キーのみを解釈し、その値に応じて配送先を決定する。frontmatter が無いファイルは
全体を本文として扱い、`delivery` の宣言が無い場合は `followup` とみなす。agent へ渡す rule
本文からは frontmatter を除去する。CLI は rule 本文の内容 SHALL NOT を解釈・検証しない
（配送 metadata のみ解釈する）。

#### Scenario: frontmatter が本文から除去される（prompt 配送）

**Given** frontmatter `---\ndelivery: prompt\n---` を持つ rule ファイル
**When** buildStepContext がそのファイルを配送分類する
**Then** agent へ渡す rule 本文には `---` 区切りの frontmatter ブロックが含まれず、frontmatter より後の本文のみが残る

#### Scenario: frontmatter が本文から除去される（followup 配送）

**Given** frontmatter `---\ndelivery: followup\n---` を持つ rule ファイル
**When** buildStepContext がそのファイルを配送分類する
**Then** agent へ渡す rule 本文には `---` 区切りの frontmatter ブロックが含まれず、frontmatter より後の本文のみが policy.postWorkPrompts に渡される

#### Scenario: frontmatter の無いファイルは全体が本文

**Given** frontmatter を持たない rule ファイル（本文のみ）
**When** buildStepContext がそのファイルを配送分類する
**Then** ファイル全体が本文として扱われ、`followup` 配送に振り分けられる（現行と同一）

### Requirement: `delivery: prompt` のルールは main work prompt に前置注入される

`delivery: prompt` を宣言した rule は、main work prompt に注入されなければならない（MUST）。
注入位置は base task・artifacts・resume context より**後**、report_result completion directive
より**前**とする。注入内容は prompt 配送用の framing（follow-up の 3 要素 wrap とは別物）で
包む。

#### Scenario: prompt ルールが resume context の後・completion directive の前に置かれる

**Given** step ディレクトリに `delivery: prompt` の rule が 1 件存在する
**When** claude-code adapter が main work turn の prompt を組み立てる
**Then** 生成された prompt 文字列内で、rule 本文の出現位置は resume-context セクションより後ろ、かつ report_result completion directive より前にある

#### Scenario: prompt ルールに follow-up の wrap が使われない

**Given** `delivery: prompt` の rule
**When** その rule が main work prompt に整形される
**Then** framing は「作業全体で遵守する」旨の文言であり、follow-up の 3 要素（修正範囲 / stop 条件 / 意図解釈）を含まない

### Requirement: `delivery: prompt` のルールは follow-up prompts に配送されない

`delivery: prompt` の rule は post-work follow-up prompts に含めてはならない（MUST NOT）。
prompt 配送と followup 配送は重複しない。

#### Scenario: prompt ルールが postWorkPrompts から除外される

**Given** step ディレクトリに `delivery: prompt` の rule のみが存在する
**When** buildStepContext が AgentRunContext を組み立てる
**Then** その rule 本文は policy.postWorkPrompts のいずれの要素にも含まれず、policy.promptRules 側に載る

### Requirement: `delivery: followup` と未指定のルールは follow-up だけに配送される

`delivery: followup` を宣言した rule、および `delivery` を宣言しない rule は、従来どおり
post-work follow-up prompts だけに配送されなければならない（SHALL）。wrap 文言・N 段の仕組みは
不変であり、未指定ルールの挙動は現行と完全に同一である。

#### Scenario: 未指定ルールが従来どおり follow-up に載る

**Given** frontmatter を持たない rule が 1 件存在する
**When** buildStepContext が AgentRunContext を組み立てる
**Then** その rule 本文は既存の 3 要素 wrap で policy.postWorkPrompts に載り、policy.promptRules は undefined のままである

#### Scenario: delivery: followup も同じく follow-up のみに配送される

**Given** frontmatter `delivery: followup` を持つ rule が 1 件存在する
**When** buildStepContext が AgentRunContext を組み立てる
**Then** frontmatter を除いた本文が既存 wrap で postWorkPrompts に載り、promptRules には載らない

### Requirement: 未知の `delivery` 値は step 実行前に設定エラーで fail する

`delivery` が `followup` / `prompt` 以外の値のとき、システムは silent fallback せず、
agent step を起動する前に設定エラーで fail しなければならない（MUST）。

#### Scenario: 未知 delivery 値で buildStepContext が throw する

**Given** frontmatter `delivery: bogus` を持つ rule が step ディレクトリに存在する
**When** buildStepContext がその step の AgentRunContext を組み立てようとする
**Then** buildStepContext は例外を投げ、AgentRunContext を返さない（agent は起動しない）
**And** 例外メッセージに不正値 `bogus` と許容値（followup / prompt）が含まれる
