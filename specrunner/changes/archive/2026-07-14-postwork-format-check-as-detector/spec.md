# Spec: post-work の決定論的 self-check を outputContract（detect→repair）へ移す

## Requirements

### Requirement: 汎用 content 形式検査契約 kind を追加する

`OutputContract` に、宣言的な検査リストで content の形式を決定論検証する新しい kind
`"content-format"` を追加 SHALL する。契約は任意フィールド `checks: ContentFormatCheck[]` を持ち、
各 check は人間可読な `label`・正規表現 `pattern`・任意の `flags` からなる。

検査は content から HTML コメント（`<!-- ... -->`）を除去したうえで各 check の正規表現を評価し、
**match しない check を失敗**として扱う。失敗した check が 1 件以上、または対象ファイルが欠落・空の場合、
検出は失敗した check の `label` を violation の `detail` に列挙して返さなければならない（MUST）。
検出に LLM を用いてはならない（MUST NOT）。

#### Scenario: 全 check が match すれば violation 0 件

**Given** HTML コメント除去後の content が宣言された全 check の正規表現に match する
**When** content-format 契約を検証する
**Then** 検出は violation を 0 件として返す

#### Scenario: match しない check があれば失敗ラベルを列挙する

**Given** 宣言された check のうち 1 件以上の正規表現が content に match しない
**When** content-format 契約を検証する
**Then** 検出は当該 check の `label` を `detail` に含む violation を 1 件返す

#### Scenario: HTML コメント内の例文では合格しない

**Given** content の本文には対象マーカーが無く、HTML コメント内の例文にだけ対象マーカーが含まれる
**When** content-format 契約を検証する
**Then** コメントは検査前に除去され、当該 check は失敗として扱われる

### Requirement: content-format 検出は local / managed 両 runtime で決定論的に動作する

`"content-format"` の検出は、既存 seam と対称に local runtime（worktree fs）と managed runtime
（branch git state）の両 `validateStepOutputs` で実装 SHALL する。検査ロジックは純関数として単一箇所に
集約し、両 runtime はファイル読み取り（I/O）のみを担い、同一の宣言 check を評価しなければならない（MUST）。
本メソッドは throw せず、violation を構造化して返す。

#### Scenario: local runtime が worktree 上の content を検証する

**Given** worktree にある対象ファイルが宣言 check の一部に違反する
**When** local runtime の `validateStepOutputs` が content-format 契約を検証する
**Then** メソッドは throw せず、失敗した check ラベルを含む violation を返す

#### Scenario: managed runtime が branch git state 上の content を検証する

**Given** branch 上の対象ファイルが宣言 check の一部に違反する
**When** managed runtime の `validateStepOutputs` が content-format 契約を検証する
**Then** メソッドは throw せず、local runtime と同一の判定で violation を返す

### Requirement: design の spec 形式検査を spec 必須 type 限定の follow-up 契約へ移す

design step は spec.md の形式 self-check（`### Requirement:` header・`#### Scenario:`・本文の
normative keyword の有無）を、無条件 post-work turn ではなく `outputContracts` の content-format 契約
（`policy: "follow-up"`）で宣言 SHALL する。この形式契約は spec.md が必須の request type
（`isSpecRequired` が true）のときのみ宣言し、spec-exempt type では宣言してはならない（MUST NOT）。
design の旧 `followUpPrompt` にあった当該決定論的形式検査の記述は残してはならない（MUST NOT）。

#### Scenario: spec.md 形式が正しければ検査由来の追撃は発火しない

**Given** spec 必須 type で design が Requirement header・Scenario・normative keyword を備えた spec.md を産出した
**When** CLI が content-format 契約を検出する
**Then** violation は 0 件で、この形式検査による post-work / repair turn は 1 度も発火しない

#### Scenario: spec.md 形式に違反があれば同一 session の repair が発火する

**Given** spec 必須 type で design が `#### Scenario:` を欠いた spec.md を産出した
**When** CLI が content-format 契約を検出する
**Then** 違反が検出され、同一 session へ repair turn が発火する

#### Scenario: spec-exempt type では形式契約を宣言しない

**Given** spec-exempt type（例: chore）の design
**When** design の `outputContracts` を組み立てる
**Then** spec.md に対する content-format 契約は宣言されず、その検査による追撃は起きない

### Requirement: code-review のテーブル形式検査を follow-up 契約へ移す

code-review step は review-feedback ファイルの Findings が Markdown テーブル形式か・必須 7 カラム
（# / Severity / Category / File / Description / How to Fix / Fix）が揃うかの決定論検査を、無条件
post-work turn ではなく `outputContracts` の content-format 契約（`policy: "follow-up"`）で宣言 SHALL する。
code-review の旧 `followUpPrompt` にあった当該テーブル形式・必須カラムの記述は残してはならない（MUST NOT）。
決定論的に検査できない意味的判断（severity 定義との整合）と per-row 値検査（Fix カラムの値）は、
無条件 post-work turn に残してよい。

#### Scenario: テーブル形式が正しければ検査由来の追撃は発火しない

**Given** code-review が必須 7 カラムのヘッダー行と区切り行を備えた review-feedback を産出した
**When** CLI が content-format 契約を検出する
**Then** violation は 0 件で、このテーブル形式検査による repair turn は 1 度も発火しない

#### Scenario: テーブル形式違反があれば同一 session の repair が発火する

**Given** code-review が必須カラムを欠く、またはテーブル形式でない review-feedback を産出した
**When** CLI が content-format 契約を検出する
**Then** 違反が検出され、同一 session へ repair turn が発火する

### Requirement: 形式違反は従来どおり修復され、通常経路の観測挙動は不変である

移設した形式検査は、違反時に従来どおり同一 session の repair で修復 SHALL する。valid / 修復済みの
通常経路では、verdict 導出・pipeline 遷移・commit の観測挙動は本変更前と一致しなければならない（MUST）。
follow-up 予算を使い切ってもなお形式違反が残る病的ケースでは、既存の follow-up 契約と同様に
executor の出力ゲートが commit 前に停止する。

#### Scenario: 違反は修復されて step は前進する

**Given** 形式違反が検出され、agent が予算内の repair で形式を満たした
**When** executor が最終の出力検証を実行する
**Then** 当該 content-format 契約の violation は 0 件となり、step は従来どおり commit に進む

#### Scenario: 予算枯渇後も残る形式違反は commit 前に halt する

**Given** repair を予算回数実行してもなお形式違反が残る
**When** executor が最終の出力検証を実行する
**Then** commit より前に `STEP_OUTPUT_MISSING` で停止し、エラーは失敗した形式 check を示す
