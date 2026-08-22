# Spec: agent session の active context / compaction observability

## Requirements

### Requirement: context metrics は累計 ModelUsage と別の型で表現される

active context の観測値は `AgentContextMetrics`（`src/kernel/context-metrics.ts`）という独立した型で表現され、
累計 token usage を表す `ModelUsage` とは別の field 空間に置かれる。
実装 SHALL NOT add context fields to `ModelUsage`, and the cumulative `ModelUsage`
values MUST NOT be reinterpreted as an active context size anywhere in the system.
`AgentContextMetrics` は `provider`（必須）、`model`（optional）と、6 個の optional な観測値
（`contextWindowTokens` / `peakActiveContextTokens` / `compactionCount` /
`contextTokensBeforeCompaction` / `contextTokensAfterCompaction` / `exhaustionAtTokens`）を持つ。

#### Scenario: ModelUsage の形が変わらない

**Given** `src/kernel/model-usage.ts` の `ModelUsage`
**When** 本変更を適用した後に型定義を確認する
**Then** `ModelUsage` の field は `inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens` の 4 個のままであり、context 関連 field は 1 つも追加されていない

#### Scenario: context metrics が独立型として存在する

**Given** agent 実行結果（`AgentRunResult`）
**When** context metrics が記録される
**Then** それは `contextMetrics` という `AgentContextMetrics` 型の field に入り、`modelUsage` / `invocationMetrics` のどちらにも混ざらない

### Requirement: Claude adapter は provider が報告した active context の peak を記録する

Claude adapter は invocation 中に流れた assistant message のうち、main session のもの
（sub-agent 由来 = `parent_tool_use_id` が非 null のもの、および過去 session の replay を除く）について、
provider が報告した 1 request 分の prompt token 数
（`input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens`）を active context size とみなす。
adapter SHALL record the maximum observed value as `peakActiveContextTokens`,
and MUST count each SDK message at most once even when the invocation spans
main-work / follow-up / postWork / output-repair turns.

#### Scenario: 複数 turn の assistant message から最大値を採る

**Given** 1 invocation 中に active context 30,000 / 120,000 / 90,000 tokens を報告する main session の assistant message が流れる
**When** invocation が完了する
**Then** `contextMetrics.peakActiveContextTokens` は 120,000 になる

#### Scenario: sub-agent と replay の message は peak に数えない

**Given** main session の assistant message が 50,000 tokens を報告し、`parent_tool_use_id` が非 null の message と replay 扱いの message がそれぞれ 200,000 tokens を報告する
**When** invocation が完了する
**Then** `contextMetrics.peakActiveContextTokens` は 50,000 になる

#### Scenario: 同一 message を二重に数えない

**Given** postWork turn の message が follow-up ループと progress 観測の双方を通過する
**When** invocation が完了する
**Then** その message の観測は 1 回だけ反映され、`compactionCount` も peak も二重計上されない

> **Note: `contextWindowTokens` の multi-model 解決ロジック**
> result message の `modelUsage` が複数 model を含む場合、`contextWindowTokens` の解決順序は次の通り:
> (1) resolved model key が存在し `contextWindow` が number なら、その値を採る。
> (2) resolved model key が不在または `contextWindow` が number 以外なら、観測できた全 model の `contextWindow` のうち最大値を採る。
> number 以外の値は無視する。この解決ロジックは adapter（`context-observer.ts`）が担い、core 型には関与しない。

### Requirement: Claude adapter は provider native compaction の発火を記録する

Claude adapter は `type: "system"` かつ `subtype: "compact_boundary"` の message を compaction の発火として扱う。
adapter SHALL increment `compactionCount` for every observed compaction boundary and
SHALL record `contextTokensBeforeCompaction` / `contextTokensAfterCompaction` from the
most recently observed boundary's provider-reported values.
provider が after 側の値を返さない場合、`contextTokensAfterCompaction` は undefined のままとする。
compaction boundary を 1 件も観測しなかった invocation でも、他の context 観測値
（active context または context window）が 1 つ以上得られた場合、adapter SHALL set
`compactionCount` to 0 — 「compaction 0 回」と「観測不能（`contextMetrics` 自体が undefined、
または pre-feature entry）」を集計時に区別できるようにするためである。

#### Scenario: 観測済み invocation では compaction 0 回が明示される

**Given** invocation 中に active context を報告する assistant message は観測されるが compaction boundary は 1 件も観測されない
**When** invocation が完了する
**Then** `contextMetrics.compactionCount` は 0 になり、undefined ではない

#### Scenario: compaction 2 回で回数と直近の前後値が残る

**Given** invocation 中に before=150,000 / after=40,000 の compaction と、before=160,000 / after=45,000 の compaction がこの順で観測される
**When** invocation が完了する
**Then** `contextMetrics.compactionCount` は 2、`contextTokensBeforeCompaction` は 160,000、`contextTokensAfterCompaction` は 45,000 になる

#### Scenario: after 値を返さない compaction

**Given** compaction boundary が before 値だけを報告する
**When** invocation が完了する
**Then** `contextTokensBeforeCompaction` にその値が入り、`contextTokensAfterCompaction` は undefined のままになる

### Requirement: context exhaustion 時に観測できていた context size が残る

agent invocation が context 溢れ（例: `Prompt is too long`）で失敗したとき、
adapter SHALL set `exhaustionAtTokens` to the most recently observed active context size,
which is the last measured value before the failure — not a claim about the exact overflow point.
active context を一度も観測できていない場合、`exhaustionAtTokens` は undefined とし、0 や推測値を入れてはならない。
exhaustion で halt した step の context metrics は、job 完了後にも参照できる永続データとして残る。

#### Scenario: 溢れ直前の観測値が exhaustionAtTokens になる

**Given** 最後に観測された active context が 187,000 tokens である
**When** provider が context 溢れを示す error を返して invocation が失敗する
**Then** `contextMetrics.exhaustionAtTokens` は 187,000 になる

#### Scenario: 観測が無い場合は値を作らない

**Given** active context を報告する message が 1 件も流れていない
**When** provider が context 溢れを示す error を返して invocation が失敗する
**Then** `contextMetrics.exhaustionAtTokens` は undefined であり、0 は記録されない

#### Scenario: context 溢れ以外の失敗では exhaustionAtTokens を付けない

**Given** invocation が network error など context 溢れ以外の理由で失敗する
**When** context metrics が組み立てられる
**Then** `exhaustionAtTokens` は undefined のままで、他の観測値（peak / compaction 等）は観測できた分だけ残る

### Requirement: 報告能力の無い provider では context metrics を捏造しない

context size / compaction を報告しない provider（Codex adapter / Managed runtime）では、
adapter SHALL leave `contextMetrics` undefined and MUST NOT derive any context value
from cumulative token usage. Claude adapter でも観測値が 1 つも得られなかった invocation では
空の record を作らず undefined を返す。

#### Scenario: Codex / Managed runtime は unavailable

**Given** Codex adapter または Managed adapter が step を実行する
**When** step が成功して結果が返る
**Then** `AgentRunResult.contextMetrics` は undefined であり、usage.json にも `contextMetrics` は書かれない

#### Scenario: 観測ゼロの invocation では record を作らない

**Given** Claude adapter の invocation で context window / active context / compaction のいずれも観測できなかった
**When** invocation が完了する
**Then** `contextMetrics` は undefined になる（`provider` だけを持つ空 record は作られない）

### Requirement: context metrics は usage.json に永続化され step / model / provider 単位で確認できる

context metrics は既存の usage 観測経路と同じ `specrunner/changes/<slug>/usage.json` に
`CommandInvocation.contextMetrics` として永続化される。
成功した step SHALL record its context metrics through the existing usage append path, and
a halted step SHALL also append one usage entry when — and only when — context metrics were observed.
`specrunner usage show <slug>` は context metrics を持つ invocation について、
observed な field のみを含む専用行を表示する。

#### Scenario: 成功 step の context metrics が usage.json に残る

**Given** implementer step が context metrics を伴って成功する
**When** CommitOrchestrator が step の完了を記録する
**Then** usage.json の該当 invocation entry に `contextMetrics` が含まれ、`stepName` と `contextMetrics.provider` / `contextMetrics.model` から step / model / provider 単位で識別できる

#### Scenario: exhaustion で halt した step の metrics が usage.json に残る

**Given** implementer step が context 溢れで halt し、context metrics が観測されている
**When** CommitOrchestrator が halt を適用する
**Then** usage.json に `modelUsage` が null の invocation entry が 1 件追加され、その `contextMetrics.exhaustionAtTokens` から溢れ直前の context size を確認できる

> **Note: runner throw（予期しない例外）経路での contextMetrics**
> 上記 "exhaustion で halt した step の metrics が usage.json に残る" シナリオは、`runner.run()` が `AgentRunResult`（`completionReason: "error"`）を返す正常失敗経路を指す。
> これに対して `runner.run()` 自体が予期しない例外を throw した場合（SDK 内部エラー等）、executor は `makeAgentThrowHalt` を生成するが、この経路では `runResult` が得られないため `contextMetrics` は伝播せず、usage.json への追記も行われない。
> context exhaustion は runner 内部で catch されて `AgentRunResult` として返るため、exhaustion 経路がこの制限を受けることはない。
> この挙動は設計上 acceptable であり、runner throw 経路に限った既知の限界である。

#### Scenario: usage show が context 行を表示する

**Given** usage.json に `contextMetrics` を持つ invocation entry がある
**When** `specrunner usage show <slug>` を実行する
**Then** その entry の出力に provider / model と observed な context 値を含む `context:` 行が現れ、値の無い field は行に現れない

#### Scenario: context metrics を持たない entry では context 行を出さない

**Given** usage.json に `contextMetrics` を持たない invocation entry がある
**When** `specrunner usage show <slug>` を実行する
**Then** その entry には `context:` 行が表示されず、既存の usage / metrics 表示は変わらない

### Requirement: 既存の usage / cost 集計の意味を変えない

context metrics の追加は既存の token usage / cost 集計の意味を変更しない。
halt 経路で追加される entry MUST carry `modelUsage: null` and MUST NOT carry invocation
metrics (`numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd`), so that cost and turn
aggregation results stay identical to the pre-change behavior.
context metrics が観測されていない halt では usage entry を追加しない。

#### Scenario: halt entry が cost 集計を動かさない

**Given** context metrics を伴う halt が usage.json に 1 entry を追加した slug
**When** `usage summary` / `job stats` の集計を実行する
**Then** cost / turns の集計値は、その entry が無い場合と同一である

#### Scenario: context metrics の無い halt では entry を追加しない

**Given** step が context metrics を持たない理由（入力欠落・output contract 違反など）で halt する
**When** CommitOrchestrator が halt を適用する
**Then** usage.json には新しい entry が追加されない

### Requirement: core 契約は provider 中立に保たれる

core 層（port / usage / state / command）の context 契約は特定 provider の仕様に依存しない。
The core type SHALL expose only provider-neutral optional fields and MUST NOT encode
provider-specific compaction triggers, thresholds, or policies.
provider 固有の event 解釈・error 分類は adapter 層に閉じる。

#### Scenario: core 型に provider 固有語彙が無い

**Given** `AgentContextMetrics` の定義
**When** field を確認する
**Then** compaction の trigger 種別・閾値・compaction policy を表す field は存在せず、provider は自由文字列として保持されるだけである

#### Scenario: 片方の provider だけが実装しても core が壊れない

**Given** Claude adapter だけが context metrics を報告し、Codex / Managed は報告しない
**When** pipeline が両 runtime で実行される
**Then** core の型・永続化・表示はいずれの runtime でも例外なく動作し、報告しない provider では context 情報が単に存在しない
