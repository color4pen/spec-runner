# Spec: test-case-gen に繰り返し実行・冪等性の導出軸を追加する

このファイルはこの変更の自己完結 spec である。
「1 回目は成功するが 2 回目で壊れる」型の欠陥（module スコープの server/client への再 connect、
資源の二重初期化、状態残留による冪等性の破れ）を、テスト導出の段階で機械的に予見させることを狙う。

本変更が固定する Layer-1 の振る舞いは「導出を指示する prompt / template の文言が、
繰り返し実行・冪等性の観点を全 request で要求し、非該当時の明示を強制すること」である。
agent が実際にどんな TC を導出するかは LLM 実行の領分であり、単体テストの対象外
（分布改善であって機械保証ではない、と request 背景で宣言済み）。

## Requirements

### Requirement: test-case-gen prompt が繰り返し実行・冪等性の導出軸を全 request で要求する

test-case-gen の system prompt は、全 request に対して繰り返し実行・冪等性の観点の検討を
要求する導出軸を MUST 含む。この軸は、server / handler / 接続 / 初期化 / 資源管理系の成果物に
該当する場合は同一操作の連続呼び出し（2 回目以降）を検証する **must** TC を導出させ、
該当が無い場合は test-cases.md に「該当なし」を明示させる（無言の省略を許さない）。
軸の適用可否を agent の暗黙判断に委ねてはならず、検討自体は全 request で強制される。

#### Scenario: prompt に導出軸の指示が含まれる

**Given** test-case-gen の system prompt 文字列（TEST_CASE_GEN_SYSTEM_PROMPT）
**When** その内容を検査する
**Then** 「繰り返し実行・冪等性」の観点、2 回目以降の呼び出しを検証する must TC の導出指示、
および該当が無い場合の「該当なし」明示指示（無言の省略の禁止）が含まれる

#### Scenario: 該当成果物がある場合は 2 回目以降を検証する must TC を導出する

**Given** server / handler / 接続 / 初期化 / 資源管理系の成果物を含む変更
**When** agent が prompt に従って test-cases.md を導出する
**Then** 同一操作の連続呼び出し（2 回目以降）が成功／冪等であることを検証する must TC が導出される

#### Scenario: 該当成果物が無い場合は「該当なし」を明示する

**Given** 上記いずれの系にも該当しない成果物のみの変更
**When** agent が prompt に従って test-cases.md を導出する
**Then** 繰り返し実行・冪等性の軸について「該当なし」が test-cases.md に明示される（無言の省略ではない）

### Requirement: request template の受け入れ基準ガイダンスが同観点を案内する

`specrunner request template` が出力する request scaffold の受け入れ基準ガイダンスは、
繰り返し実行・冪等性の観点を MUST 案内する。すなわち、該当する成果物では
2 回目の呼び出しを受け入れ基準に含めるべき旨を、受け入れ基準の記述ガイダンスとして提示する。

#### Scenario: template 出力にガイダンスが含まれる

**Given** `specrunner request template`（buildScaffoldTemplate）の出力
**When** その内容を検査する
**Then** 受け入れ基準ガイダンスに、該当成果物では 2 回目の呼び出しを受け入れ基準に含める旨の
繰り返し実行・冪等性の案内が含まれる

### Requirement: 既存の test-cases.md 形式・契約を変更しない

本変更は test-cases.md の形式・TC-ID 契約・must/should 区分の意味を MUST 変更しない。
繰り返し実行・冪等性の「該当なし」明示は自由記述の注記として表現し、
機械 parse 対象の新しいフィールドや heading 契約を追加しない。

#### Scenario: 既存テストが無変更で green

**Given** test-cases.md テンプレート（TEST_CASES_TEMPLATE）と既存の prompt / template テスト
**When** 本変更を適用する
**Then** TEST_CASES_TEMPLATE の機械 parse 形式は不変で、既存テストは無変更のまま green である
