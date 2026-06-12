# Spec: judge report tool の observations チャネルと findings 契約の不変性

## Requirements

### Requirement: judge-family report tool は optional な observations チャネルを受理する

judge 系 `report_result` tool（`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` /
`REQUEST_REVIEW_REPORT_TOOL`）は、optional な `observations` 配列を受理する SHALL。各要素は
`{ severity, file, line?, title, rationale }` の構造を持ち、`resolution` フィールドを持たない（MUST NOT）。
`observations` は ok 判定および `findings` の検証に一切影響してはならない（MUST NOT）。

#### Scenario: observations 付き report が受理される

**Given** code-review agent が `{ ok: true, findings: [], observations: [{ severity: "low", file: "src/a.ts", title: "FYI", rationale: "既知リスク・対応不要" }] }` を申告する
**When** CLI が `report_result` の入力を parse する
**Then** parse は成功し、`observations` に 1 件の observation が、`findings` に 0 件が保持される

#### Scenario: observation 要素は resolution を持たない

**Given** observation 要素 `{ severity: "medium", file: "src/b.ts", title: "t", rationale: "r" }`
**When** CLI が observation を parse する
**Then** parse 済み observation には `resolution` キーが存在しない

### Requirement: findings の契約は observations の有無に関わらず不変である

verdict 導出・code-fixer への findings 注入・findings-ledger・regression-gate は、`findings` のみを
入力とし `observations` を読まない SHALL。同一の `findings`（および `ok`）に対する verdict・台帳・
fixer 入力は、`observations` を追加しても変化してはならない（MUST NOT）。

#### Scenario: observations を足しても verdict が変わらない

**Given** judge agent が `{ ok: true, findings: [], observations: [{ severity: "critical", file: "src/a.ts", title: "obs", rationale: "記録のみ" }] }` を申告する
**When** CLI が verdict を導出する
**Then** verdict は `approved` であり、observations の critical severity は verdict を変えない

#### Scenario: observations が code-fixer の findings ブロックに含まれない

**Given** 直前の code-review run の toolResult が `findings: [fixable 1 件]` と `observations: [1 件]` を持つ
**When** code-fixer の入力 findings ブロックを構築する
**Then** ブロックには finding 1 件のみが含まれ、observation の title は現れない

#### Scenario: observations が findings 台帳に含まれない

**Given** reviewer の StepRun の toolResult が `findings: [fixable 1 件]` と `observations: [1 件]` を持つ
**When** findings 台帳（regression-gate 入力）を構築する
**Then** 台帳には fixable finding 1 件のみが含まれ、observation は含まれない

### Requirement: observations の severity は記録専用で routing に使われない

`observations` の `severity` は記録用であり、verdict 導出・fixer 行き・escalation 判定・実在検証の
いずれの routing にも使用してはならない（MUST NOT）。この非利用は型（observation は `resolution` を
持たない）と回帰テストで明示される SHALL。

#### Scenario: critical な observation のみでも approved になる

**Given** judge agent が `{ ok: true, findings: [], observations: [{ severity: "critical", ... }] }` を申告する
**When** CLI が verdict を導出し、verdict-affecting findings を収集する
**Then** verdict は `approved` であり、verdict-affecting findings は 0 件で実在検証も起動しない

### Requirement: 旧形式 toolResult は後方互換に読める

`observations` フィールドを持たない旧形式の `report_result` 入力および永続化済み toolResult は、従来通り
parse・消費できる SHALL。observations 欠落時、parse 結果の `observations` は undefined であり、ok 判定・
findings 検証・verdict 導出は本変更導入前と一致しなければならない（MUST）。

#### Scenario: observations なしの report が従来通り読める

**Given** `{ ok: true, findings: [{ severity: "high", resolution: "fixable", file: "src/a.ts", title: "t", rationale: "r" }] }`（observations フィールドなし）
**When** CLI が parse する
**Then** parse は成功し、`observations` は undefined、`findings` は 1 件で、verdict 導出は `needs-fix`

#### Scenario: 不正な observations は report 全体を失敗させない

**Given** `{ ok: true, findings: [], observations: "not-an-array" }`
**When** CLI が parse する
**Then** parse は成功し（`missingFields` に `observations` を含めない）、`observations` は undefined、verdict は `approved`

### Requirement: observation 定義は judge-rules に集約され全 judge prompt に同梱される

システムは observation の定義を `judge-rules.ts` の単一定数として保持し、`DECISION_NEEDED_DEFINITION`
を注入する全ての judge prompt に同梱する SHALL。observation 定義は「対応不要だが記録すべき観察」と
「再現手順を構成できる問題を observation に入れることは禁止（それは finding）」を含まなければならない（MUST）。

#### Scenario: observation 定義が finding との境界禁止規律を含む

**Given** `judge-rules.ts` の observation 定義定数
**When** その内容を検査する
**Then** 「対応不要だが記録すべき観察」と「再現手順を構成できる問題」の observation 禁止規律の双方を含む

#### Scenario: decision-needed 定義を注入する全 prompt が observation 定義も含む

**Given** `DECISION_NEEDED_DEFINITION` を注入する 5 つの prompt（code-review / spec-review /
request-review / custom-reviewer / regression-gate）
**When** 各 prompt 文字列を検査する
**Then** いずれも observation 定義定数を含む
