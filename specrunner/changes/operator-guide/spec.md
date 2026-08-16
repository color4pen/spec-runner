# Spec: specrunner guide サブコマンド

## Requirements

### Requirement: guide コマンドは topic 一覧と topic 本文を静的に出力する

`specrunner guide` は引数なしのとき topic 一覧(topic 名 + 一行説明)を stdout に出力し、
`specrunner guide <topic>` は当該 topic の全文を stdout に出力する SHALL。ガイド本文は CLI パッケージ
内の定数/資産として保持し、実行時のネットワーク・repo 状態に依存しない MUST。topic は jobs / merge /
audit / setup / escalation / request / review / inject / inbox の 9 件である。

#### Scenario: 引数なしで topic 一覧を出力する

**Given** guide コマンドが実装されている
**When** ユーザーが `specrunner guide` を引数なしで実行する
**Then** 9 topic すべての topic 名と一行説明を含む一覧が stdout に出力され、exit code は 0 である

#### Scenario: topic 指定で全文を出力する

**Given** 有効な topic 名(例 jobs)が指定される
**When** ユーザーが `specrunner guide jobs` を実行する
**Then** jobs topic の本文が stdout に出力され、exit code は 0 である

#### Scenario: repo 外でも動作する

**Given** カレントディレクトリが git repo の外である
**When** ユーザーが `specrunner guide` または `specrunner guide <topic>` を実行する
**Then** repo 検出エラーにならず、一覧または本文が出力される

### Requirement: 未知 topic はエラーと一覧を返す

`specrunner guide <topic>` に未知の topic 名が渡されたとき、システムはエラーメッセージと topic 一覧を
出力し、非ゼロ exit code を返す SHALL。

#### Scenario: 未知 topic

**Given** registry に存在しない topic 名(例 nonexistent)が指定される
**When** ユーザーが `specrunner guide nonexistent` を実行する
**Then** エラーメッセージと topic 一覧が出力され、exit code は非ゼロ(2)である

### Requirement: 一覧・未知候補・init snippet の topic 列挙は単一 registry から導出される

topic 名・一行説明・本文は単一の topic registry(`GUIDE_TOPICS`)に集約され、`guide`(引数なし)の
一覧、未知 topic エラー時の候補一覧、init snippet の topic 一覧一行の全てがこの registry から導出
される MUST。いずれの出力面にも topic を手書き列挙しない。

#### Scenario: 一覧が registry から導出される

**Given** `GUIDE_TOPICS` が単一ソースである
**When** `guide`(引数なし)一覧、未知 topic エラーの候補一覧、init snippet の topic 一覧一行を生成する
**Then** 3 つの出力面はすべて `GUIDE_TOPICS` 由来の topic 名を含み、registry と独立した手書き列挙を
持たない

### Requirement: operator 向け escalation 出力に guide escalation 導線を含める

halt して operator 対応が必要になる escalation 出力(`formatEscalation` と
`buildCanonEscalationReason` の resumePoint.reason 文面)は `specrunner guide escalation` への一行導線を
含む SHALL。

#### Scenario: finish/archive escalation の導線

**Given** finish/archive が escalation を整形する
**When** `formatEscalation` が出力文字列を生成する
**Then** 出力は `specrunner guide escalation` を含む

#### Scenario: 保護正典 escalation の導線

**Given** 保護正典への fixable finding が write-scope で解消不能である
**When** `buildCanonEscalationReason` が reason 文面を生成する
**Then** 文面は `specrunner guide escalation` を含む

### Requirement: --help に guide の案内を含める

`specrunner --help`(top-level usage)は guide サブコマンドの案内を含む SHALL。

#### Scenario: usage に guide が現れる

**Given** top-level usage が生成される
**When** `specrunner --help` を実行する
**Then** 出力は guide の案内一行を含む

### Requirement: init 完了時に CLAUDE.md 用 snippet を出力する

`specrunner init` は完了時に、project の CLAUDE.md へ貼るための snippet(spec-runner 運用時に
`specrunner guide <topic>` を参照する旨 + registry 導出の topic 一覧一行)を stdout に出力する SHALL。
CLAUDE.md ファイルへの自動書込は行わない MUST。

#### Scenario: init が snippet を出力する

**Given** init の scaffold 処理が成功する
**When** `specrunner init` が完了する
**Then** stdout に `specrunner guide` を参照する snippet が出力され、snippet の topic 一覧は
`GUIDE_TOPICS` 由来の topic 名を含み、CLAUDE.md ファイルは書き換えられない

### Requirement: escalation topic 本文は復帰 flag 分岐と reopen 制約を含める

`guide escalation` の本文は誤案内 drift を防ぐため、`--apply-canon` / `--adopt-commits` / `--from` の
復帰 flag 分岐と、`job reopen` の制約(apply-canon / adopt-commits / detach を持たない)を含む MUST。

#### Scenario: escalation 本文の必須要素

**Given** escalation topic が実装されている
**When** `specrunner guide escalation` の本文を取得する
**Then** 本文は `--apply-canon`・`--adopt-commits`・`--from`・reopen の制約を含む

### Requirement: skill を薄いトリガーへ縮退し廃止コマンド文字列を排除する

job-run-monitor / rebase-finish / acceptance-and-issue-audit の各 SKILL.md は、発火条件
(description)と `guide <topic>` への誘導だけの薄いトリガー(本文 10 行以内)である SHALL。
parallel-request-workflow skill は存在しない SHALL。`.claude/skills/` 配下に廃止済みコマンド文字列
(`request review` / `job finish` / `specrunner ps`)が出現しない MUST。

#### Scenario: 薄いトリガー化

**Given** guide topic が運用手順の正本を持つ
**When** 縮退後の 3 skill を確認する
**Then** 各 SKILL.md 本文は 10 行以内で `guide <topic>` 誘導を含み、厚い手順本文を持たない

#### Scenario: 廃止 skill とコマンド文字列の不在

**Given** skill のダイエットが完了している
**When** `.claude/skills/` 配下を走査する
**Then** `parallel-request-workflow/` は存在せず、いずれのファイルにも `request review` /
`job finish` / `specrunner ps` が出現しない

### Requirement: guide 本文の specrunner コマンドは現行 CLI に実在する

guide 本文(`GUIDE_TOPICS[*].body`)に記載する specrunner コマンドは、現行 command registry に実在
する MUST。存在しないコマンドを案内しない。

#### Scenario: 本文コマンドが registry で解決される

**Given** guide 本文に `specrunner <command>` 形式のコマンド参照が含まれる
**When** 本文から抽出したコマンドパストークンを `resolveCommand` に渡す
**Then** すべての参照が `status === "ok"` で解決される
