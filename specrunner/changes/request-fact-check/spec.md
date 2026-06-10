# Spec: request の現状コード断定を untrusted input として消費側が突き合わせる

## Requirements

### Requirement: request scaffold は「現状コードの前提」任意節を含める

`buildScaffoldTemplate()` が生成する scaffold は `## 現状コードの前提` 節と、(1) 現状コードの断定を file:line を伴ってこの節に書く旨、(2) これらは未検証の前提として design / request-review が実コードと突き合わせる旨、(3) 意図・方針・将来の話は対象外である旨、を含む書き手向けコメントを含まなければならない（MUST）。この節は `request template` と `request new` の両出力に現れなければならない（MUST）。

#### Scenario: template 出力に節とコメントが含まれる

**Given** ユーザーが `specrunner request template`（任意の `--type`）を実行する
**When** scaffold template が生成される
**Then** 出力に `## 現状コードの前提` heading と、file:line・未検証前提・対象外を案内するコメントが含まれる

#### Scenario: request new の生成ファイルにも節が含まれる

**Given** ユーザーが `specrunner request new <slug>` を実行する
**When** draft の request.md が生成される
**Then** 生成ファイルに `## 現状コードの前提` 節が含まれる

### Requirement: 節を持たない request は validate を green で通過する

`## 現状コードの前提` 節は validate の必須要件であってはならない（MUST NOT be required）。`## 現状コードの前提` を持たない request.md は `request validate` で exit 0（green）を返さなければならない（MUST）。

#### Scenario: 節を持たない既存 request が green

**Given** `## 現状コードの前提` を持たない妥当な request.md
**When** `specrunner request validate <file>` を実行する
**Then** exit 0 を返し、エラーを stderr に出力しない

### Requirement: request-review は現状コード断定を実コードと突き合わせる

request-review の system prompt は、file:line または具体的なシンボル名・ファイルパスを伴う現状コードの断定（節の内外を問わず request 全体が対象）を、既存の read-only 探索権限で実コードと突き合わせ、不一致を severity high の finding として findings に載せるよう指示しなければならない（MUST）。意図・方針・将来の話は突き合わせ対象外である旨を含めなければならない（MUST）。

#### Scenario: prompt に突き合わせ観点と severity 規定が含まれる

**Given** `REQUEST_REVIEW_SYSTEM_PROMPT` 文字列
**When** その内容を検査する
**Then** 現状コード断定の突き合わせ観点、不一致を severity high とする規定、対象（file:line / 具体シンボル / パス）と対象外（意図・方針・将来）の定義が記述されている

### Requirement: design は前提を実コードと突き合わせ不一致を escalate する

design の system prompt は、request 内の現状コード断定（file:line / 具体的なシンボル名・ファイルパスを伴うもの、request 全体が対象）を設計の前提にする前に Read / Grep で実コードと突き合わせ、不一致を発見した場合は誤った前提のまま設計せず `report_result` を ok=false + reason で呼んで報告するよう指示しなければならない（MUST）。意図・方針・将来の話は突き合わせ対象外である旨を含めなければならない（MUST）。

#### Scenario: prompt に検証工程と報告経路が含まれる

**Given** `DESIGN_SYSTEM_PROMPT` 文字列
**When** その内容を検査する
**Then** 前提を実コードと突き合わせる工程、不一致時に ok=false + reason で報告する経路、対象/対象外の定義が記述されている

### Requirement: request-generate は「現状コードの前提」を任意節として案内する

request-generate の system prompt は、「現状コードの前提」を任意（optional）セクションとして案内しなければならず（MUST）、必須セクション一覧（"MUST include all of the following sections"）に追加してはならない（MUST NOT）。

#### Scenario: generate prompt が任意節を案内する

**Given** `REQUEST_GENERATE_SYSTEM_PROMPT` 文字列
**When** その内容を検査する
**Then** 「現状コードの前提」が optional として案内され、かつ必須セクション一覧には含まれていない
