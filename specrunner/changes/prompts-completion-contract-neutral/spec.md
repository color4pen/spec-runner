# Spec: provider 非依存の完了契約文言

このファイルは本 change が達成する Layer-1 振る舞いを自己完結で記述する。
完了契約文言の provider 非依存性は型 / FSM / 不変条件では強制されず、prompt 文字列の組み立て方という intent 由来の選択であるため Layer-1 として spec 化する。

## Requirements

### Requirement: 共有 agent prompt は provider 中立の完了文言を使う

`src/prompts/` 配下の全 pipeline ステップ agent prompt（system prompt 定数および
agent へ送る初期メッセージ template / builder 出力）は、ステップの完了を
**runtime 固有の完了機構名を名指しせずに**指示しなければならない（MUST）。
具体的には、組み立て後の prompt 文字列は完了機構トークン `report_result` および
ターン意味論トークン `end_turn` を含んではならない（SHALL NOT）。

#### Scenario: system prompt に runtime 固有トークンが現れない

**Given** いずれかの pipeline ステップ（design / implementer / spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen / conformance / code-review / spec-review / regression-gate / request-review / custom-reviewer）の system prompt を組み立てる
**When** 組み立て後の prompt 文字列を検査する
**Then** 文字列に `report_result` が含まれない、かつ `end_turn` が含まれない

#### Scenario: 初期メッセージにも runtime 固有トークンが現れない

**Given** design / spec-review / request-review / test-case-gen の初期メッセージ（template 定数または builder 出力）
**When** その文字列を検査する
**Then** 文字列に `report_result` が含まれない、かつ `end_turn` が含まれない

### Requirement: 完了の意味は中立表現で保持される

完了文言の中立化後も、agent は正常完了と自発的失敗を区別して報告するよう指示されなければならない（MUST）。
中立完了文言は、正常完了（`ok: true`）と自発的失敗（`ok: false` + `reason`）の双方を表現し、
完了結果を報告する前に作業を終えてはならない旨を述べる（SHALL）。

#### Scenario: producer 系 prompt が中立完了指示を含む

**Given** producer 系ステップ（例 implementer）の system prompt
**When** 完了指示セクションを検査する
**Then** 正常完了 `ok: true` と自発的失敗 `ok: false` + `reason` を指示する中立文言を含み、完了結果を報告せずに作業を終えない旨の中立文言を含む

#### Scenario: judge 系 prompt が中立完了指示と findings 報告を両立する

**Given** judge 系ステップ（例 code-review）の system prompt
**When** 完了指示セクションを検査する
**Then** 中立完了文言を含み、かつ findings 配列の報告指示（severity / resolution / file / title / rationale）を引き続き含む

### Requirement: verdict 導出ガイドは完了機構名を含まない

judge の verdict blocking ルール文（`VERDICT_BLOCKING_RULES`）は、判定の根拠を
findings として参照する際に runtime 固有の完了機構名 `report_result` を用いてはならない（SHALL NOT）。
blocking 判定の論理（decision-needed → escalation、critical/high → needs-fix、
findings 由来の導出が markdown verdict 行より優先）は変更されず保持されなければならない（MUST）。

#### Scenario: VERDICT_BLOCKING_RULES が中立化される

**Given** `VERDICT_BLOCKING_RULES` 定数
**When** その文字列を検査する
**Then** `report_result` を含まず、かつ `decision-needed` / `escalation` / `needs-fix` / 「findings 由来の導出が優先」の各記述を引き続き含む
