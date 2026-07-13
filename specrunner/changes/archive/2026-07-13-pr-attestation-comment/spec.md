# Spec: PR ごとの attestation をコメント添付する

## Requirements

### Requirement: attestation 組立は副作用なし純関数でなければならない

`buildAttestation` は raw events.jsonl 文字列と解析済み `UsageFile` を入力に取り、機械可読な `Attestation` を返す副作用なし純関数でなければならない（MUST）。ファイル I/O・ネットワーク・グローバル状態への書き込みを行ってはならない。同一入力に対し常に同一の `Attestation`（journal hash を含む）を返さなければならない（SHALL）。

#### Scenario: 代表的な journal + usage から機械可読サマリを生成する

**Given** design→test-case-gen→implementer→verification→code-review→conformance の step-attempt を含む events.jsonl 文字列と、各 step の `stepName` / `modelUsage` を含む usage.json（解析済み）

**When** `buildAttestation({ journalContent, usage })` を呼ぶ

**Then** 返り値は (1) ゲート実行順の配列、(2) 各ゲートの `verdict`、(3) verdict 導出入力 findings の要約、(4) step 別 model、(5) 予算/コスト消費、(6) events.jsonl の hash を含む

#### Scenario: 同一入力に対し同一の hash を返す

**Given** 同一の `journalContent` 文字列

**When** `buildAttestation` を 2 回呼ぶ

**Then** 両返り値の `journalHash` は一致し、その値は `journalContent` の sha256 hex digest と一致する

---

### Requirement: ゲート実行順と各ゲートの verdict を journal から導かなければならない

`Attestation.gates` は、fold 済み全 step-attempt を実行時刻順（`startedAt` 昇順）に整列した配列でなければならない（SHALL）。各 gate は `step`・`attempt`・`verdict`・`startedAt`・`endedAt` を持つ。verdict は journal の `outcome.verdict` をそのまま反映しなければならず、agent の自己申告や再計算を挟んではならない。

#### Scenario: 複数 step が実行時刻順に並ぶ

**Given** startedAt が交互になる複数 step の step-attempt を含む events.jsonl

**When** `buildAttestation` を呼ぶ

**Then** `gates` は `startedAt` 昇順に並び、各要素の `verdict` は対応する step-attempt の `outcome.verdict` と一致する

---

### Requirement: verdict 導出入力の findings を要約しなければならない

findings を報告した gate（review / conformance 系）について、`buildAttestation` は verdict 導出入力となった findings を severity（critical / high / medium / low）と resolution（fixable / decision-needed）の件数要約として持たせなければならない（SHALL）。finding 本文（title / rationale 等）を attestation に載せてはならない。findings を持たない gate には要約を付けない。

#### Scenario: critical/high と fixable/decision-needed の件数が集計される

**Given** code-review の step-attempt が `outcome.toolResult.findings` に critical 1 件・high 1 件・fixable 2 件を含む

**When** `buildAttestation` を呼ぶ

**Then** 該当 gate の findings 要約は total=2、bySeverity.critical=1、bySeverity.high=1、byResolution.fixable=2 を示し、finding 本文は含まれない

---

### Requirement: step 別 model と予算/コスト消費を usage.json から導かなければならない

`buildAttestation` は step 別の使用 model と token / コスト消費を `UsageFile` から導かなければならない（SHALL）。コスト算出は既存の pricing 表（`computeCostUsd`）を用いる。pricing 表に存在しない model のコストは `null` とし、`unpricedModels` に列挙しなければならない。`modelUsage` が `null` の invocation（例: managed runtime）は model 空・コスト null として扱う。

#### Scenario: 既知 model のコストが算出される

**Given** implementer の invocation が `claude-sonnet-4-6` の modelUsage を持つ usage.json

**When** `buildAttestation` を呼ぶ

**Then** step 別 model に implementer→`claude-sonnet-4-6` が現れ、該当 step の `costUsd` は `computeCostUsd("claude-sonnet-4-6", ...)` と一致する数値になる

#### Scenario: 未知 model は null コストと unpricedModels に反映される

**Given** pricing 表に無い model キーの modelUsage を持つ invocation

**When** `buildAttestation` を呼ぶ

**Then** 該当 step の `costUsd` は `null` になり、`cost.unpricedModels` にその model キーが含まれる

---

### Requirement: pr-create は PR 作成成功後に attestation コメントを添付しなければならない

pr-create step は、PR 作成が `created` または `existing-open` で成功した後に、build した attestation を PR コメント本文へ整形し、`githubClient.createIssueComment(owner, repo, prNumber, body)` で添付しなければならない（SHALL）。コメント本文は attestation object を機械可読に含む（`json` フェンスブロック）ものでなければならない。

#### Scenario: PR 作成成功時にコメントが添付される

**Given** `runPrCreate` が `{ status: "created", number: 42, url }` を返し、change folder に events.jsonl と usage.json が存在する

**When** pr-create step の `run` が実行される

**Then** `createIssueComment` が PR 番号 42 に対して 1 回呼ばれ、その body は attestation の機械可読ブロック（`json` フェンス）を含む

---

### Requirement: コメント添付の失敗は pr-create を失敗させてはならない（best-effort）

attestation コメントの添付は best-effort でなければならない（MUST）。events.jsonl / usage.json の読み取り失敗、attestation 組立の例外、`createIssueComment` の失敗のいずれが起きても、pr-create step は例外を送出してはならず、PR 作成の成否・`pr-create-result.md` の内容・parseResult の verdict を変えてはならない。失敗は warning に留めなければならない（SHALL）。

#### Scenario: createIssueComment が失敗しても PR 作成は成功のまま

**Given** `runPrCreate` が `created` を返すが、`createIssueComment` が例外を送出する

**When** pr-create step の `run` が実行される

**Then** `run` は例外を送出せず正常終了し、`pr-create-result.md` は `## Status: success` を保持し、warning が記録される

#### Scenario: journal が存在しない場合はコメントを添付せず成功する

**Given** `runPrCreate` が `created` を返すが、change folder に events.jsonl が存在しない

**When** pr-create step の `run` が実行される

**Then** `createIssueComment` は呼ばれず、`run` は例外を送出せず、`pr-create-result.md` は `## Status: success` を保持する
