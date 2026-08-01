# Design: spec-review の周回間 context 注入

## Context

spec-review → spec-fixer → spec-review の反復ループで、reviewer が前周 fixer の修正済み内容を「未修正」として再指摘する stale 誤検出が実運用で発生した（issue #936）。

構造的原因は、reviewer が毎 round フレッシュな agent session で起動して worktree（HEAD）を読み直すため「古い内容を読んでいる」わけではなく、reviewer が **前周に何が指摘され fixer が何を直したかを知る経路を一切持たない** ことにある。判断が揺れれば同一箇所を再指摘し、それを抑制する機構も無い。

修正方針は iteration ≥ 2 の reviewer message への前周 context 注入。現状コードの前提:

- `src/core/step/spec-review.ts:82-90` — `reads()` は request.md / spec.md / design.md / tasks.md の 4 ファイルのみ。前周 result は含まない。
- `src/core/step/spec-review.ts:102-114` + `src/prompts/spec-review-system.ts:174-196` — `buildSpecReviewInitialMessage` が埋め込むのは slug / requestType / requestContent / branch / iteration / findingsPath / mode のみ。前周 findings は渡らない。
- `src/core/step/step-context-builder.ts:96-98,164` — session 継続は `FIXER_STEP_NAMES` のみ。spec-review は毎 round フレッシュ session。`buildStepContext` は `input.dynamicContext: deps.dynamicContext` をそのまま渡す。
- `src/core/step/spec-fixer.ts:150` — fixer 側には `getLatestJudgeFindings(state, SPEC_REVIEW)` で最新 findings を受け取る seam がある（reviewer 側には無い）。
- `src/core/port/runtime-strategy.ts:651,810` — `listCommitChangedFiles(oid, cwd)` は commit 単位の変更 file 集合を返す既存 seam（`ChangedFilesResult` DU、never-throw、managed は常に `unavailable`）。
- `src/state/schema/types.ts:209` — `StepRun.commitOid?` に agent step の exit-HEAD が記録される。`src/core/step/commit-orchestrator.ts:277-278` が `stepRuns[stepRuns.length - 2]?.commitOid` で priorOid を解決する前例。

### 層の制約（本設計の核心）

`buildMessage(state, deps)` は pure（I/O 禁止、invariant B-5）。fixer 変更 file 集合の導出は `runtimeStrategy.listCommitChangedFiles`（async）を要する。`runtimeStrategy` は `PipelineDeps`（core 層）にのみ存在し、adapter に渡る `AgentRunContext`（`src/core/port/agent-runner.ts:157-195`）は `state` / `cwd` / `input.dynamicContext` を運ぶが `runtimeStrategy` を運ばない。したがって既存の adapter 起動フック `enrichContext(dynamicContext, cwd, slug)` はこの導出を行えない。導出は `runtimeStrategy` が生きている core 層で行い、結果を `DynamicContext` に載せて pure な `buildMessage` に手渡す必要がある。

## Goals / Non-Goals

**Goals**:

- iteration ≥ 2 の spec-review reviewer message に、(a) 前周 spec-review の findings（state 由来の構造化データ）と (b) 前周 spec-fixer が変更した file 集合（fixer の commit OID から `listCommitChangedFiles` で機械導出）を注入する。
- 注入ブロックに再指摘プロトコル（現在内容の読み直し・不十分理由の rationale 明示・解消済みの再指摘禁止）を課し、かつ全量列挙規律（ADR 2026-07-24 D1）を弱めない。
- fixer 変更 file 集合は commit diff 由来の機械導出のみとし、fixer agent の自己申告を真実源にしない。
- 注入は one-shot（その round の message にのみ載せ、state 永続・後続 step 伝播はしない）。
- 導出不能時（OID 欠落・diff unavailable・managed runtime）は注入を黙って省略し、step は正常続行する。

**Non-Goals**:

- stale 再指摘の機械 auto-reject / verdict 上書き（「fixer が触ったが修正不十分」の正当な再指摘を機械では区別できないため採らない）。
- finding-recency（後出し検出）の gate 化（ADR 2026-07-24 D2 の将来送りを維持）。
- code-review / conformance 等、spec-review 以外の review ループへの展開（効果確認後の将来 request）。
- reviewer の session 継続化（フレッシュ session 前提は維持）。

## Decisions

### D1: 導出は core 層の `buildStepContext` で行う。adapter 起動の `enrichContext` は使わない

前周 context の導出（`listCommitChangedFiles` 呼び出し）は core 層の `buildStepContext`（`src/core/step/step-context-builder.ts`）で行う。`buildStepContext` は `deps: PipelineDeps`（= `runtimeStrategy` を持つ）と `state` を受け取り、既に async I/O（project.md / rules 読み込み）と step 固有の分岐（`FIXER_STEP_NAMES` の session 継続）を行っている core 層の唯一の async context 組立点である。

- **Rationale**: `enrichContext` は adapter（claude-code / managed-agent / codex）で起動され、`runtimeStrategy` を一切参照できない。`listCommitChangedFiles` は `runtimeStrategy` のメソッドであり、これを adapter から呼ぶには 3 adapter すべてに `runtimeStrategy` を配線する必要がある（`AgentRunContext` に port を載せる = 層越え）。core 層で導出すれば port は core に閉じたまま済む。
- **Alternatives considered**:
  - *`enrichContext` の signature を `state` / `runtimeStrategy` 付きに拡張し、3 adapter に `runtimeStrategy` を配線する*: 却下。`AgentRunContext`（port 型）に `runtimeStrategy` を載せることになり、port→domain の逆流を招く。4 つの既存 `enrichContext` 実装と 3 adapter 起動点に影響し blast radius が大きい。
  - *`enrichContext` 内で直接 git subprocess（`gitExec`、`src/git/dynamic-context.ts` の前例）を叩く*: 却下。受け入れ基準は「fixer 変更 file が `listCommitChangedFiles` の mock 経由で機械導出であること」を要求する。直 subprocess では seam を mock できず AC を満たせない。
  - *finding-recency と同じく `commit-orchestrator` の post-persist で導出する*: 却下。post-persist は verdict 確定後に走る位相であり、この round の message は既に構築済み。注入は round 実行 **前** に message へ載せる必要がある。

### D2: 新しい宣言的 async フック `prepareRoundContext` を `AgentStep` に追加する

`AgentStep`（`src/core/port/step-types.ts`）に optional な async メソッドを追加する:

```
prepareRoundContext?(
  state: JobState,
  cwd: string,
  runtimeStrategy: RuntimeStrategy | undefined,
): Promise<Partial<DynamicContext> | null>;
```

`buildStepContext` はこのフックが定義されていれば呼び出し、返った partial を `deps.dynamicContext` にマージして `input.dynamicContext` に渡す。spec-review のみが実装し、他の step は未実装（後方互換）。

- **Rationale**: `buildStepContext` を step 非依存に保つ（返った partial を無差別にマージするだけで、`priorRoundContext` の存在を知らない）。宣言的フックは将来 code-review / conformance へ展開する際に「その step が `prepareRoundContext` を実装する」だけで済み、generic builder を編集しなくてよい（scope-out の将来 request への道を残す）。`reads` / `writes` / `enrichContext` / `skipWhen` / `getMaxTurns` 等、既存の宣言的 step メソッド群と同じ設計様式。
- **enrichContext との棲み分け**: `enrichContext` は adapter 起動・fs ベース・runtime port なし。`prepareRoundContext` は core 起動・runtime port あり。両者は層が異なり、interface の doc comment でこの区別を明示する。
- **Alternatives considered**:
  - *`buildStepContext` 内に `step.name === SPEC_REVIEW` の直接分岐を書く*: 却下ではないが非採用。前例（`FIXER_STEP_NAMES` 分岐）はあるが、step 識別で generic builder を分岐させると将来展開のたびに builder 編集が要る。宣言的フックの方が拡張に開いている。
  - *フックが完全な `DynamicContext` を返す（`enrichContext` を踏襲）*: 却下。非 null の base `dynamicContext` を要求し、builder 側で defaults 複製が必要になる。`Partial<DynamicContext>` を返しマージする方が builder を step 非依存に保てる。

### D3: 導出結果は `DynamicContext` の新規 optional field `priorRoundContext` で運ぶ

`DynamicContext`（`src/git/dynamic-context.ts`）に inline 構造型の optional field を追加する:

```
priorRoundContext?: {
  findings: { severity: string; resolution: string; file: string; title: string }[];
  changedFiles: string[];
};
```

- **Rationale**: `DynamicContext` は既に step 固有の enrich field（`verificationContent`（build-fixer）、`factCheckAttestation`（design）等）を inline 型で持ち、`src/git/` への domain 型 import を避ける前例がある。`priorRoundContext.findings` は string primitives のみなので `Finding` を import せず inline 宣言できる。`DynamicContext` は per-round の in-memory 値で state へ永続化されないため、この field を載せるだけで **one-shot 寿命が構造的に保証**される（要件 4）。

### D4: 導出ロジックは専用モジュール `src/core/step/prior-round-context.ts` に純関数 + 薄い配線 + runtime seam の 3 層で分解する

finding-recency（ADR 2026-07-24 D4）と同じ 3 層構成:

1. **純関数** `resolvePriorFixerOid(state): string | null` — 最新 spec-fixer StepRun の `commitOid`（`state.steps[SPEC_FIXER]` の末尾要素の `commitOid ?? null`）。
2. **純関数** `buildPriorRoundContextBlock(ctx): string` — 前周 findings 表・変更 file 集合・再指摘プロトコル文言をレンダリングする（副作用なし）。
3. **配線** `derivePriorRoundContext({ state, iteration, cwd, runtimeStrategy }): Promise<PriorRoundContext | null>` — iteration ≥ 2 を gate し、prior findings を `getLatestJudgeFindings(state, SPEC_REVIEW)`（`src/core/step/fixer-helpers.ts:52`）で取得、prior fixer OID を解決、`listCommitChangedFiles` を呼んで変更 file を機械導出し、`PriorRoundContext` を組み立てる。

- **Rationale**: 純関数は最小依存で単体テスト可能。I/O は `runtimeStrategy` port の背後に隔離（DSM 規律に一致）。finding-recency の実装様式を踏襲することでレビュー負荷を下げる。

### D5: `derivePriorRoundContext` の省略契約 — 導出不能なら丸ごと null

`derivePriorRoundContext` は以下のいずれかで `null` を返し、注入をブロックごと省略する:

- `iteration < 2`（前周が存在しない、要件 1・受け入れ基準 2）
- prior fixer OID が解決できない（`resolvePriorFixerOid` が null、受け入れ基準 3）
- `runtimeStrategy` または `listCommitChangedFiles` が不在（managed runtime / テスト fake）
- `listCommitChangedFiles` が `{ kind: "unavailable" }` を返す（diff unavailable、受け入れ基準 3）

成功時のみ `{ findings, changedFiles }` を返す。findings は空配列でも changedFiles が導出できていれば注入する（前周が全 approve だった稀ケースでも fixer 変更 file の signal は載る）。changedFiles が `success` で空配列（fixer commit が空）の場合も注入する（導出は成功しており「変更なし」も正当な情報）。

- **Rationale**: 受け入れ基準 3 は「OID 解決不能・diff unavailable の場合、注入が省略される」ことをテストで固定するよう要求する。fixer 変更 file が機械導出できないなら、findings だけ載せても本 request の情報ギャップ（「fixer が何を直したか」）を埋められないため、ブロック全体を省略する方が契約が単純で「黙って壊れない」に合致する。
- **Alternatives considered**: *diff unavailable でも findings だけ注入する（部分注入）*: 却下。受け入れ基準 3 の「注入が省略」に反し、テスト契約が二分岐して曖昧になる。

### D6: 再指摘プロトコル文言は全量列挙規律を弱めない（要件 2）

`buildPriorRoundContextBlock` が生成するブロックには次を必ず含める:

- 現在内容の**読み直し**指示（同一対象を再指摘する前に Read tool で現在のファイル内容を確認する）。
- 再指摘時は修正が**なぜ不十分か**を finding の rationale に明示し、現在の内容で解消を確認できた指摘は再指摘しない。
- **全量列挙維持**: 前周に approve 済みだった観点も含め、この round で見えている finding は severity を問わず全量列挙する。「前回 approve 済みの観点は省略してよい」という免除は与えない。

- **Rationale**: 本 request のスコープは stale 再指摘の抑制であって、全量列挙規律（ADR 2026-07-24 D1）の弱体化ではない。免除文言を入れると全量列挙が崩れ、後出し問題が再発する。

### D7: buildMessage への配線 — 新 placeholder `{{PRIOR_ROUND_CONTEXT}}`

`SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE`（`src/prompts/spec-review-system.ts:104-121`）に `{{PRIOR_ROUND_CONTEXT}}` placeholder を追加。`SpecReviewPromptInput` に `priorRoundContextBlock?: string` を足す。`SpecReviewStep.buildMessage`（`src/core/step/spec-review.ts:102-114`）は `deps.dynamicContext?.priorRoundContext` があれば `buildPriorRoundContextBlock` でレンダリングし、無ければ空文字を渡す。`buildSpecReviewInitialMessage` は placeholder を block（または空文字）で置換する。

- **Rationale**: `buildMessage` は pure のまま（`deps` から読んで純関数 `buildPriorRoundContextBlock` を呼ぶだけ）。iteration の gate は `derivePriorRoundContext` に集約し、`buildMessage` は「`priorRoundContext` があれば載せる」単一責務にする。iteration 1 では `prepareRoundContext` が null を返し `priorRoundContext` が載らないため、message に block は出ない。

## Risks / Trade-offs

- [managed runtime では `listCommitChangedFiles` が常に `unavailable`] → 注入は managed で常に省略される。本 request は local runtime の改善であり、finding-recency（同じく managed で no-op）と同じ既知の限界。degrade は静かで step は正常続行する。ADR に既知債務として記す。
- [prior fixer OID の取り違え] → spec-review ⇄ spec-fixer ループでは spec-review iteration ≥ 2 の直前に走る spec-fixer が「最新 spec-fixer run」であり、その `commitOid` が対象の fix commit。conformance 由来の spec-fixer 起動は spec-fixer → test-gen へ抜けて spec-review へ戻らない（`src/core/step/fixer-helpers.ts` の routing）ため、spec-review 時点の最新 spec-fixer run はループ fixer であることが保証される。→ Mitigation: この timing 不変を design/spec に明記し、`derivePriorRoundContext` のテストで固定する。
- [prior findings の取得タイミング] → `buildStepContext` は現 round の StepRun が push される前（executor.ts:313、agent 実行前）に走るため、`getLatestJudgeFindings(state, SPEC_REVIEW)` は前周（round iteration−1）の findings を返す。→ Mitigation: この load-bearing な timing を design/spec に明記し、テストで固定する。
- [フックが 2 つ（enrichContext / prepareRoundContext）になる混乱] → 層が異なる（adapter fs / core port）。→ Mitigation: interface doc comment で棲み分けを明示。
- [`buildStepContext` でフックが throw した場合] → best-effort（try/catch）で握りつぶし enrich せず続行。`derivePriorRoundContext` 自体は `listCommitChangedFiles` の never-throw 契約と純関数で構成され throw しない設計だが、防御的に wrap する。

## Open Questions

- なし（request の architect 評価済み設計判断で採用/却下が確定しており、実装路は D1〜D7 で一意に定まる）。

## Migration Plan

- 後方互換の追加のみ（新 optional field / 新 optional フック / 新 placeholder）。既存 state・既存 step・既存テストへの破壊的変更なし。
- ADR（request.adr === true）は pipeline の adr-gen step が本 design の D1（導出を core 層に置く seam 決定）と D5（省略契約）を中心に生成する。
