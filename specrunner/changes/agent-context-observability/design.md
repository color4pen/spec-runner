# Design: agent session の active context / compaction を計測可能にする

## Context

### 現状の観測点（実測済み）

| 観測値 | 型 / 場所 | 意味 |
|---|---|---|
| `ModelUsage` (`inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens`) | `src/kernel/model-usage.ts` | invocation の **累計** token 消費量。`src/adapter/claude-code/agent-runner.ts` が main work turn + follow-up / postWork / repair turn を per-model で加算する |
| `AgentInvocationMetrics` (`numTurns` / `durationMs` / `durationApiMs` / `totalCostUsd`) | `src/core/port/agent-runner.ts` | SDK result message から抽出する invocation 単位の実測値 |
| 永続先 | `specrunner/changes/<slug>/usage.json` の `CommandInvocation`（`src/core/usage/types.ts`） | `CommitOrchestrator.applySuccessPostPersistEffects` が `appendInvocation` で success 時のみ append する |
| 表示 | `specrunner usage show <slug>`（`src/core/command/usage-show.ts`） | per-invocation の `modelUsage` 行と `metrics:` 行 |

これらはすべて「どれだけ使ったか（累計）」であり、「その瞬間に session が何 token の active context を保持していたか」ではない。
`ModelUsage.inputTokens` は turn 加算値なので、context size として読むと実際より大きくなる（別 invocation の履歴再読込を含む）。

### provider が実際に報告できる事実（node_modules 実測）

**Claude Agent SDK**（`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`）:

- `SDKCompactBoundaryMessage`（L2364）: `{ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual" | "auto", pre_tokens: number, post_tokens?: number, duration_ms?: number } }`
  → **provider native compaction の発火と前後 token を明示的に通知する**。
- SDK 側 `ModelUsage`（L1099-1108）は `contextWindow` / `maxOutputTokens` / `costUSD` を持つ。SpecRunner の mapping（agent-runner.ts L999-1008）は 4 field のみ写して `contextWindow` を捨てている。
- `SDKAssistantMessage.message`（`BetaMessage`）の `usage` は 1 request 分の `input_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens` を返す。この 3 値の和 = **その request で実際にモデルへ送られた prompt token 数 = その時点の active context size**（provider が返した単一 request の事実であり、累計ではない）。
- `SDKResultError`（L3127）は `errors: string[]` を持つ。`Prompt is too long` はここに載る。`isTransientAgentError`（`src/adapter/shared/transient-error.ts`）の whitelist に該当しないため retry されず即 halt する。

**Codex SDK**（`node_modules/@openai/codex-sdk/dist/index.d.ts`）: `Usage` は `input_tokens` / `cached_input_tokens` / `output_tokens` / `reasoning_output_tokens` のみ。context window も compaction event も **報告しない**。

**Managed runtime**: `SessionUsage`（`src/core/port/session-client.ts`）に context window field は無い。`AgentRunResult.modelUsage` も undefined。

### 制約

- 失敗経路（`Prompt is too long`）は `completionReason: "error"` → `makeNonSuccessHalt`（`src/core/step/step-halt.ts`）→ `CommitOrchestrator.commitHalt` に流れる。現状 halt 経路は usage.json へ一切 append しない（`tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts` TC-019 がこれを固定している）。
- `StepRun.modelUsage`（`src/state/schema/types.ts` L209）は schema 上存在するが、success 経路の `projectSuccess` は modelUsage を渡していない。usage.json が実質の永続 home。
- 構造制約（`architecture/conformance.md`）: B-2 SDK 封じ込め（SDK 型は adapter 内）、B-3 shared-kernel は domain を import しない、B-13 store 書き込みは CommitOrchestrator が唯一のオーナー。

## Goals / Non-Goals

**Goals**:

- 累計 `ModelUsage` と active context metric を、意味・型・永続表現のすべてで分離する。
- provider が明示的に報告する事実（compaction boundary / context window / per-request prompt tokens）だけから context lifecycle metrics を組み立てる。
- context exhaustion で step が halt したときも、観測できていた context size を永続データとして残す。
- job 完了後に step / model / provider 単位で context metrics を確認できる CLI 経路を用意する。
- 報告能力の無い provider（Codex / managed）では値を捏造せず unavailable のままにする。

**Non-Goals**:

- compact / rollover の閾値決定（何 token で発火するか）。本 Issue は観測のみ。
- SpecRunner 独自 compaction / fresh session rollover（#1058 本体）の実装。
- provider native compaction policy の上書き・抑制。
- pipeline step の追加・分割、既存 `ModelUsage` / cost 集計の意味変更。
- session log（`SessionLogWriter.writeSummary`）への context metrics 追加。debug 専用経路であり永続比較には使えないため対象外。
- `job stats` / `usage summary`（横断集計）への context 列追加。cost 集計の意味を触らないため今回は据え置く。

## Decisions

### D1: active context 用に独立型 `AgentContextMetrics` を新設し、`ModelUsage` を一切変更しない

`src/kernel/context-metrics.ts` に provider-neutral な `AgentContextMetrics` を定義する（`src/kernel/model-usage.ts` と同じ配置理由 = port 層と state / usage 層の双方から参照でき循環 import を作らない）。`src/core/port/agent-runner.ts` が type re-export し、adapter は port 経由で参照する。

- **Rationale**: 受け入れ条件「累計 `ModelUsage` と active context metric が意味上・型上区別される」を型で保証するには、別型・別 field 名前空間にするのが唯一確実。kernel 配置は B-3（shared-kernel は domain を import しない）に適合し、`ModelUsage` の既存 import 網（port / state / usage / pricing）に一切触れない。
- **Alternatives considered**:
  - *`ModelUsage` に `contextWindowTokens` 等を追加*: `ModelUsage` は「累計 usage」として cost 計算（`computeCostUsd`）に使われており、per-request context 値を同居させると集計の意味が壊れる。却下。
  - *`AgentInvocationMetrics` を拡張*: この型は `CommandInvocation` へ **flat spread**（`...(invocationMetrics ?? {})`）されるため、context field が累計 metrics と同じ平面に混ざる。「意味上区別される」を弱める。却下。

### D2: context metrics は invocation-scope の単一 record とし、model 別 map にしない

`AgentContextMetrics` は `provider`（必須・adapter identity 文字列）と `model`（optional）を自己記述として持つ 1 個の object とする。`modelUsage` のような `Record<model, …>` にはしない。

- **Rationale**: compaction は session 単位の事実であり model 単位ではない。model 別 map にすると同一 compaction を全 model key へ複製するか、どれか 1 model に恣意的に帰属させるかしかなく、どちらも事実を歪める。record 自身が `provider` / `model` を持てば、受け入れ条件「step / model / provider 単位で確認できる」は step 名を持つ usage.json entry と組み合わせて満たせる。
- **Alternatives considered**:
  - *`Record<model, AgentContextMetrics>`*: 上記の compaction 帰属問題。sub-agent 用 model が混ざると peak の意味も曖昧になる。却下。
  - *provider を持たせず runtime 設定から後付けで判定*: B-8（runtime 分岐の集約）に反する読み替えを消費側に強いる。却下。

### D3: field は request で列挙された 6 個に固定し、before / after は「最後に観測した compaction」とする

`AgentContextMetrics` の観測 field は以下（すべて optional / number）:

- `contextWindowTokens` — その invocation で provider が認識していた context window
- `peakActiveContextTokens` — 観測できた active context の最大値
- `compactionCount` — invocation 中に観測した compaction 回数。他の context 観測値が 1 つ以上ある invocation では 0 を明示し、報告能力の無い provider / pre-feature entry の absent と集計時に区別できるようにする
- `contextTokensBeforeCompaction` — **最後に観測した** compaction の直前 context size
- `contextTokensAfterCompaction` — **最後に観測した** compaction の直後 context size
- `exhaustionAtTokens` — context exhaustion 検知時点で観測できていた最新の active context size

- **Rationale**: request が求める最小観測集合をそのまま契約にする。`compactionCount` が全発火回数を保持し、`peakActiveContextTokens` が「どこまで伸びたか」を保持するので、複数回 compaction しても「発火したか / どこまで伸びるか」の判断材料は失われない。before/after は「直近の実測ペア」であることを型の doc comment で明示する。
- **Alternatives considered**:
  - *compaction event の配列（`compactions[]`）*: 情報量は増えるが、閾値決定は Non-Goal であり、配列は usage.json のサイズと表示の複雑度を増やす。将来 additive に追加できる（Open Questions Q1）。今回は却下。
  - *最初の compaction を before/after に採る*: 「直近」の方が exhaustion 直前の状態と連続しており、rollover 判断に近い。

### D4: Claude adapter は provider-native event のみを情報源にし、累計値から推測しない

`src/adapter/claude-code/context-observer.ts`（新規・pure module）が SDK message を観測して metric を組み立てる。情報源は次の 4 つに限定する。

1. `peakActiveContextTokens`: `type: "assistant"` message の `message.usage` から `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` を計算し、その最大値を採る。**単一 request の prompt token 数**であり累計ではない。`parent_tool_use_id !== null`（sub-agent）と `isReplay === true`（過去 session の再生）は除外する。
2. `compactionCount` / `contextTokensBeforeCompaction` / `contextTokensAfterCompaction`: `type: "system", subtype: "compact_boundary"` の `compact_metadata.pre_tokens` / `post_tokens`。boundary を 1 件も観測しなくても、他の観測値が 1 つ以上あれば snapshot 時に `compactionCount: 0` を明示する（観測ゼロなら snapshot 自体が undefined のまま）。
3. `contextWindowTokens`: result message の `modelUsage[model].contextWindow`。複数 model が含まれる場合は resolved model の値を優先し、無ければ観測値の最大を採る。
4. `exhaustionAtTokens`: error 文字列が context 溢れを示すと分類できたときのみ、**観測済みの最新 active context 値**を入れる。観測が 1 件も無ければ undefined。

exhaustion 分類器（`Prompt is too long` 等の照合）は adapter-local に置く。

- **Rationale**: 要件 3「provider-native の事実を優先する」に対する直接の実装。1 だけは「算出」だが、provider が返した 1 request 分の usage 内訳を足しただけで他 turn の値を混ぜていないため推測ではない（provider 自身の context 表示と同じ計算）。`exhaustionAtTokens` は「溢れた正確な token 数」ではなく「溢れる直前に観測できた最後の値」であることを doc comment と spec で明示し、過大解釈を防ぐ。
- **Alternatives considered**:
  - *累計 `ModelUsage.inputTokens` を active context とみなす*: 要件 1 が明示的に禁止。却下。
  - *provider の transcript file を読んで再計算*: SDK 契約外の実装詳細に依存し壊れやすい。B-2 の SDK 封じ込め精神にも反する。却下。
  - *exhaustion 分類器を `src/adapter/shared/transient-error.ts` の隣に共有モジュールとして置く*: 現時点で該当 provider は Claude のみ。共有化は 2 番目の provider が必要になった時点で行う（要件 3「片方の仕様を core 契約として固定しない」）。今回は adapter-local。

### D5: SDK message は「1 message = 1 回だけ observe」で全 turn を対象にする

観測は runner 内の 3 つの message ループ（main work `runQuery` / `runFollowUpQueryWithRetry` / output-repair）それぞれで 1 回ずつ observe 関数を呼ぶ。既存の `observeMessage`（tool progress / last-tool tracker）には**混ぜない**。

- **Rationale**: `observeMessage` は main / postWork / repair では呼ばれるが report-retry follow-up では呼ばれない。ここに相乗りすると report-retry turn の compaction を取りこぼす。逆に `observeMessage` の中に入れたうえで follow-up ループでも呼ぶと postWork turn が二重計上され `compactionCount` が壊れる。責務を分けて呼び出し点を明示するのが最も安全。
- 補足: transient retry で main turn が再実行された場合、観測は積算される（`compactionCount` は再実行分も数え、peak は全体の最大）。これは `modelUsage` が全 turn を加算するのと同じ invocation-scope の定義であり、doc comment で明示する。
- **Alternatives considered**: *main work turn のみ観測*: postWork / repair turn でも compaction は起こりうるため、exhaustion 直前の値を取りこぼす。却下。

### D6: 報告能力の無い provider は `contextMetrics` を undefined のままにする

Codex adapter / Managed adapter は `AgentRunResult.contextMetrics` を設定しない。空 object（`{ provider: "codex" }`）も作らない。Claude adapter でも観測が 1 件も取れなかった invocation では undefined を返す。

- **Rationale**: 受け入れ条件「値を捏造せず unavailable として扱う」。空 object を書くと usage.json に無意味な object が増え、「observed だが 0」と「unavailable」の区別も曖昧になる。undefined = unavailable の 1 規則に統一する。
- **Alternatives considered**: *`{ provider, availability: "unavailable" }` を常時記録*: 情報としては明確だが、全 entry に冗長な object が付く。却下（Open Questions Q2）。

### D7: 永続 home は usage.json の `CommandInvocation.contextMetrics` 一箇所。失敗経路も同じ file へ書く

- success 経路: `applySuccessPostPersistEffects` が `appendInvocation` するとき `contextMetrics` を nested field として載せる（`invocationMetrics` と同じ経路。ただし flat spread ではなく nested field）。
- halt 経路: `StepHalt` に `contextMetrics` を持たせ、`CommitOrchestrator.commitHalt` が **`contextMetrics` を持つ halt に限り** best-effort で usage.json に 1 entry append する。その entry は `modelUsage: null` とし、`numTurns` 等の invocation metrics は載せない。
- `commitHalt` は `deps` を optional な追加引数で受け取る（`apply()` から渡す）。既存呼び出し（テスト含む）は互換のまま。
- agent が success を返した後の post-run halt（main-checkout drift / output contract violation / step artifact の commit・push 失敗）でも、`runResult.contextMetrics` を `StepHalt.contextMetrics` へ引き継ぐ。引き継がないと、観測済みの context lifecycle 証跡が halt 種別によって失われ、「halted step は観測があれば必ず 1 entry append する」の spec 条項を満たせない（PR #1070 再レビュー [High]）。

- **Rationale**: 要件 4「session log だけに閉じず、job 完了後に比較・集計できる永続データ」＋「既存 usage / invocation metrics と同じ観測経路」。usage.json は active / archive 双方で読める唯一の per-invocation 永続 file であり、表示経路（`usage show`）も既にある。失敗経路を state.json 側に分けると exhaustion だけ別 file・別表示になり「比較・集計できる」が満たせない。
- cost 集計の不変性: 追加 entry は `modelUsage: null` かつ `totalCostUsd` 無しなので、`usage summary`（`inv.modelUsage` が falsy なら skip）も `job stats`（`costUsd` / `measuredCostUsd` / `turns` はいずれも値が存在する entry のみ加算）も数値が変わらない。既存 TC-019（error 時に invocation metrics を usage.json に書かない）も、`contextMetrics` を持たない halt では append しないため維持される。
- **Alternatives considered**:
  - *失敗時は `StepRun.outcome` に載せる（state.json）*: 型変更は最小だが集計・表示経路が二重になり、「job 完了後に step / model / provider 単位で確認できる」を 1 コマンドで満たせない。却下。
  - *session log のみ*: 要件 4 が明示的に否定。却下。
  - *全 halt で entry を append*: 既存の「error 経路は usage.json に記録しない」設計判断を無条件に反転させる。`contextMetrics` があるときだけに限定して差分を最小化した。

### D8: 確認経路は `specrunner usage show <slug>` の 1 行追加

各 invocation 行の下に、既存 `metrics:` 行と同じスタイルで `context:` 行を出す。存在する field だけを `key=value` で並べ、`contextMetrics` が無い entry では行自体を出さない。step 名は既存の見出し行が、model / provider は `context:` 行が持つため、step / model / provider 単位の確認が 1 コマンドで完結する。

- **Rationale**: 既存 UI の拡張のみで受け入れ条件を満たせる。新コマンド追加は最小変更方針（要件 4）に反する。
- **Alternatives considered**: *`job stats` に列追加*: 横断集計は cost 中心の table で、per-step の context 比較には粒度が粗い。却下（Open Questions Q3）。

### D9: core 契約は provider-neutral に保つ

- `AgentContextMetrics` には `trigger`（Claude の manual/auto）や閾値、compaction policy を含めない。
- core（port / usage / state / command）は provider 名を文字列として運ぶだけで、値の意味づけ・分類は adapter が行う。
- 新 field はすべて optional。provider が増えても core 契約を変えずに部分実装できる。

- **Rationale**: 受け入れ条件「Claude / Codex adapter のどちらか一方の仕様を core 契約として固定しない」。
- **Alternatives considered**: *`compactionTrigger: "auto" | "manual"` を core 型に入れる*: Claude 固有の分類語彙を core に固定してしまう。却下。

## Risks / Trade-offs

- **[Risk] `peakActiveContextTokens` の定義（prompt tokens = input + cacheRead + cacheCreation）が provider の内部 context 表示と一致しない可能性** → Mitigation: 値の定義を型の doc comment と spec に明記し、「provider が 1 request について報告した prompt token 数」であることを固定する。閾値決定は Non-Goal なので、絶対値の完全一致より系列の比較可能性が重要。
- **[Risk] `exhaustionAtTokens` が「溢れた token 数」と誤読される** → Mitigation: 「exhaustion 検知時点で観測できていた最後の active context」と doc comment / spec / 表示ラベル（`exhaustedAt=`）で一貫して表現する。観測が無い場合は undefined とし、0 を書かない。
- **[Risk] halt 経路の usage.json 追記により error entry が混在し、既存集計が歪む** → Mitigation: `modelUsage: null` かつ invocation metrics 無しで append する。`usage summary` / `job stats` はいずれも値のある entry のみ加算するため数値は不変。回帰テストで既存 TC-019 と cost 集計の不変を固定する。
- **[Risk] `commitHalt` への `deps` 追加が単一書き込みオーナー（B-13/B-14）の責務を膨らませる** → Mitigation: optional 引数 + best-effort（try/catch で握りつぶす）とし、失敗しても halt の FSM 遷移・rethrow 順序に影響させない。`applySuccessPostPersistEffects` の usage append と同じ扱い。
- **[Risk] parallel round（custom reviewer）member の halt では usage.json append 経路が無い** → Mitigation: 本 Issue の観測対象は主に implementer / fixer（sequential step）。round member の success は共有 `applySuccessPostPersistEffects` を通るため記録される。member halt の context metrics が残らないことを既知の限界として design に明示する。
- **[Trade-off] compaction を「回数 + 直近 before/after」に丸めるため中間 compaction の詳細は残らない** → peak と count で lifecycle の輪郭は取れる。詳細が必要になった時点で additive に拡張する。

## Open Questions

1. compaction を event 配列（各回の before/after/trigger）として残すべきか。今回は count + 直近ペアで足りると判断したが、実測で compaction が多発するようなら追加を検討する。
2. 「provider が報告できない」ことを usage.json 上で明示的に残す価値があるか（現設計では undefined = 記録なし）。provider 別の観測可能性を後から集計したくなった場合に再検討する。
3. `job stats` / `usage summary` に context 列（peak の中央値など）を出すべきか。閾値決定を始める段階で必要性を判断する。
4. Codex が将来 context / compaction を報告し始めた場合、exhaustion 分類器を `src/adapter/shared/` へ共有化するかどうか（今回は adapter-local に留める）。
