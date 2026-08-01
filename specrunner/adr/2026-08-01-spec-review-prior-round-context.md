# spec-review 周回間 context 注入 — stale 再指摘を情報ギャップから潰す

## Status

Accepted (2026-08-01)

## Context

spec-review → spec-fixer → spec-review の反復ループで、reviewer が前周 fixer の修正済み内容を
「未修正」として再指摘する stale 誤検出が実運用で発生した（issue #936: T-07 は前周 spec-fixer
が修正済みで実行時点の HEAD にも存在したが、再指摘の escalation で operator 対応が必要になった）。

**構造的原因は情報ギャップ**。reviewer は毎 round フレッシュな agent session で起動し worktree
（= HEAD）を読み直すため、「古い内容を読んでいる」わけではない。問題は reviewer が「前周に何が
指摘され、fixer が何を直したか」を知る経路を一切持たず、毎回ゼロから再導出することにある。
判断が揺れれば同一箇所を再指摘し、それを検出・抑制する機構も存在しない。

既存の finding-recency（ADR 2026-07-24 D2 / #925）は「後出し」検出の逆方向（reviewer が前周に
既に存在した観点を後出しする問題）であり観測専用で、本問題とは方向が異なる。

関連する実装事実:

- `src/core/step/spec-review.ts:102-114` — `buildSpecReviewInitialMessage` が埋め込む情報に
  前周 findings は含まれない。
- `src/core/step/step-context-builder.ts:96-98` — session 継続は `FIXER_STEP_NAMES` のみ。
  spec-review は毎 round フレッシュ session（フレッシュ session は「毎回 HEAD を読み直す」保証の
  裏面であり変えない）。
- `src/core/step/spec-fixer.ts:150` — fixer 側には `getLatestJudgeFindings(state, SPEC_REVIEW)` で
  最新 findings を受け取る seam があるが、reviewer 側には同等の seam が無い。
- `src/core/port/runtime-strategy.ts` — `listCommitChangedFiles(oid, cwd)` が commit 単位の変更
  file 集合を返す既存 seam（`ChangedFilesResult` DU、never-throw）。
- `src/state/schema/types.ts` — `StepRun.commitOid?` に agent step の exit-HEAD が記録される。

**層の制約（本設計の核心）**: `buildMessage(state, deps)` は pure（I/O 禁止）。
fixer 変更 file 集合の導出は `runtimeStrategy.listCommitChangedFiles`（async）を要する。
`runtimeStrategy` は `PipelineDeps`（core 層）にのみ存在し、adapter に渡る `AgentRunContext` は
`state` / `cwd` / `input.dynamicContext` を運ぶが `runtimeStrategy` を運ばない。
したがって導出は `runtimeStrategy` が生きている core 層で行い、結果を `DynamicContext` に載せて
pure な `buildMessage` に手渡す必要がある。

## Decision

### D1: 導出は core 層の `buildStepContext` で行う。adapter の `enrichContext` は使わない

前周 context の導出（`listCommitChangedFiles` 呼び出し）は core 層の `buildStepContext`
（`src/core/step/step-context-builder.ts`）で行う。`buildStepContext` は `deps: PipelineDeps`
（= `runtimeStrategy` を持つ）と `state` を受け取り、既に async I/O と step 固有の分岐を行う
core 層の唯一の async context 組立点である。

- **採用理由**: `enrichContext` は adapter（claude-code / managed-agent / codex）で起動され、
  `runtimeStrategy` を参照できない。`listCommitChangedFiles` を adapter から呼ぶには
  3 adapter すべてに `runtimeStrategy` を配線する必要があり、`AgentRunContext`（port 型）に
  `runtimeStrategy` を載せることになる（port→domain の逆流）。core 層で導出すれば port は
  core に閉じたまま済む。

**却下案**:

- *`enrichContext` の signature を `state` / `runtimeStrategy` 付きに拡張する*: 却下。
  4 つの既存 `enrichContext` 実装と 3 adapter 起動点に影響し blast radius が大きい。
  `AgentRunContext` への port 露出は層違反。
- *`enrichContext` 内で直接 git subprocess を叩く*: 却下。受け入れ基準は fixer 変更 file が
  `listCommitChangedFiles` の mock 経由で機械導出であることを要求する。直 subprocess では
  seam を mock できず AC を満たせない。
- *`commit-orchestrator` の post-persist で導出する*: 却下。post-persist は verdict 確定後に
  走る位相であり、注入は round 実行前に message へ載せる必要がある。

### D2: 宣言的 async フック `prepareRoundContext` を `AgentStep` interface に追加する

`AgentStep`（`src/core/port/step-types.ts`）に optional な async メソッドを追加する:

```typescript
prepareRoundContext?(
  state: JobState,
  cwd: string,
  runtimeStrategy: RuntimeStrategy | undefined,
): Promise<Partial<DynamicContext> | null>;
```

`buildStepContext` はこのフックが定義されていれば呼び出し、返った partial を `deps.dynamicContext`
にマージして `input.dynamicContext` に渡す。spec-review のみが実装し、他 step は未実装（後方互換）。

- **採用理由**: `buildStepContext` を step 非依存に保つ（返った partial を無差別にマージするだけで、
  `priorRoundContext` の存在を知らない）。宣言的フックは将来 code-review / conformance へ展開する
  際に「その step が `prepareRoundContext` を実装する」だけで済み、generic builder を編集しなくてよい。
  `reads` / `writes` / `enrichContext` / `skipWhen` / `getMaxTurns` 等、既存の宣言的 step メソッド群
  と同じ設計様式。
- **`enrichContext` との棲み分け**: `enrichContext` は adapter 起動・fs ベース・runtime port なし。
  `prepareRoundContext` は core 起動・runtime port あり。両者は層が異なり、interface の doc comment で
  この区別を明示する。

**却下案**:

- *`buildStepContext` 内に `step.name === SPEC_REVIEW` の直接分岐を書く*: 非採用。
  `FIXER_STEP_NAMES` 分岐の前例はあるが、将来展開のたびに builder 編集が要る。
  宣言的フックの方が拡張に開いている。
- *フックが完全な `DynamicContext` を返す（`enrichContext` を踏襲）*: 却下。
  非 null の base `dynamicContext` を要求し builder 側で defaults 複製が必要になる。
  `Partial<DynamicContext>` を返しマージする方が builder を step 非依存に保てる。

### D3: 導出結果は `DynamicContext` の optional field `priorRoundContext` で運ぶ

`DynamicContext`（`src/git/dynamic-context.ts`）に inline 構造型の optional field を追加する:

```typescript
priorRoundContext?: {
  findings: { severity: string; resolution: string; file: string; title: string }[];
  changedFiles: string[];
};
```

- **採用理由**: `DynamicContext` は既に step 固有の enrich field（`verificationContent`、
  `factCheckAttestation` 等）を inline 型で持つ前例があり、domain 型 import を避けられる。
  `DynamicContext` は per-round の in-memory 値で state へ永続化されないため、この field を載せる
  だけで **one-shot 寿命が構造的に保証**される（要件 4）。

### D4: 導出ロジックは専用モジュール `prior-round-context.ts` に 3 層で分解する

finding-recency（ADR 2026-07-24 D4）と同じ 3 層構成:

1. **純関数** `resolvePriorFixerOid(state): string | null` — 最新 spec-fixer StepRun の
   `commitOid`（`state.steps[SPEC_FIXER]` の末尾要素）。
2. **純関数** `buildPriorRoundContextBlock(ctx): string` — 前周 findings 表・変更 file 集合・
   再指摘プロトコル文言をレンダリング（副作用なし）。
3. **配線** `derivePriorRoundContext({ state, iteration, cwd, runtimeStrategy }): Promise<...| null>`
   — iteration ≥ 2 を gate し、prior findings を `getLatestJudgeFindings(state, SPEC_REVIEW)` で取得、
   prior fixer OID を解決、`listCommitChangedFiles` を呼んで変更 file を機械導出する。

- **採用理由**: 純関数は最小依存で単体テスト可能。I/O は `runtimeStrategy` port の背後に隔離
  （DSM 規律に一致）。finding-recency の実装様式を踏襲することでレビュー負荷を下げる。

### D5: 導出不能なら注入をブロックごと省略する

`derivePriorRoundContext` は以下のいずれかで `null` を返し、注入をブロックごと省略する:

- `iteration < 2`（前周が存在しない）
- prior fixer OID が解決できない（`resolvePriorFixerOid` が null）
- `runtimeStrategy` または `listCommitChangedFiles` が不在（managed runtime / テスト fake）
- `listCommitChangedFiles` が `{ kind: "unavailable" }` を返す

成功時のみ `{ findings, changedFiles }` を返す。findings が空配列でも changedFiles が導出できて
いれば注入する（前周が全 approve だった場合も fixer 変更 file の signal は有効）。
changedFiles が success で空配列（fixer commit が空）の場合も注入する（「変更なし」も正当な情報）。

- **採用理由**: fixer 変更 file が機械導出できないなら findings だけ載せても「fixer が何を直したか」
  の情報ギャップを埋められない。ブロック全体を省略する方が契約が単純で「黙って壊れない」に合致する。

**却下案**:

- *diff unavailable でも findings だけ部分注入する*: 却下。受け入れ基準の「注入が省略」に反し、
  テスト契約が二分岐して曖昧になる。

### D6: 再指摘プロトコル文言は全量列挙規律を弱めない

`buildPriorRoundContextBlock` が生成するブロックには以下を必ず含める:

- **読み直し指示**: 同一対象を再指摘する前に Read tool で現在のファイル内容を確認する。
- **rationale 明示指示**: 再指摘する場合は修正がなぜ不十分かを finding の rationale に明示し、
  現在の内容で解消を確認できた指摘は再指摘しない。
- **全量列挙維持**: 前周に approve 済みだった観点も含め、この round で見えている finding は
  severity を問わず全量列挙する。「前回 approve 済みの観点は省略してよい」という免除は与えない。

- **採用理由**: 本 request のスコープは stale 再指摘の抑制であって、全量列挙規律（ADR 2026-07-24
  D1）の弱体化ではない。免除文言を入れると全量列挙が崩れ、後出し問題が再発する。

### D7: `buildMessage` への配線 — 新 placeholder `{{PRIOR_ROUND_CONTEXT}}`

`SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE`（`src/prompts/spec-review-system.ts`）に
`{{PRIOR_ROUND_CONTEXT}}` placeholder を追加。`SpecReviewPromptInput` に
`priorRoundContextBlock?: string` を足す。`SpecReviewStep.buildMessage` は
`deps.dynamicContext?.priorRoundContext` があれば `buildPriorRoundContextBlock` でレンダリングし、
無ければ空文字を渡す。

- **採用理由**: `buildMessage` は pure のまま。iteration の gate は `derivePriorRoundContext` に
  集約し、`buildMessage` は「`priorRoundContext` があれば載せる」単一責務にする。
  iteration 1 では `prepareRoundContext` が null を返すため message に block は出ない。

## Alternatives Considered

### A1: stale 再指摘の機械 auto-reject

fixer がファイルを変更した finding を機械的に auto-reject（verdict 変更）する案。

- **Pros**: 実装が単純で reviewer への指示が不要。
- **Cons**: 「fixer がファイルを触ったが修正は不十分」という**正当な再指摘**を機械では区別できない。
  fixer が対象ファイルを変更したことと修正が十分であることは等値ではなく、正当な再指摘を殺す
  fail-open（検査空洞化）になる。
- **Why not**: 機械 auto-reject は採らず、reviewer に判断を委ねる。reviewer に前周情報を渡し
  「現在の内容を確認した上で再指摘せよ」と求める方が判断の精度を保てる。

### A2: reviewer session の継続化で文脈を保たせる

spec-review を `FIXER_STEP_NAMES` と同様にセッション継続にし、前周の会話履歴を保持させる案。

- **Pros**: reviewer が前周の議論を自然に参照できる。追加の実装が少ない。
- **Cons**: フレッシュ session は「毎回 HEAD を読み直す」保証の裏面。継続 session は逆に
  「前周に読んだ古いスナップショットを引きずる」（本 issue の別の顔）を招く。
  session 継続は fixer のように「前回の作業を引き継いで編集を続ける」用途向きであり、
  「現在の HEAD をまっさらに評価する」reviewer には合わない。
- **Why not**: フレッシュ session 前提は維持する。情報は message への one-shot 注入で渡す。

### A3: 前周 result ファイル（`spec-review-result-NNN.md`）を reads に追加するだけ

`reads()` に前周 spec-review-result-NNN.md を追加し、reviewer に自由文で読ませる案。

- **Pros**: 実装が最小（reads 配列への追加のみ）。
- **Cons**: 構造化 findings でなく自由文の再解釈になり、前周 fixer の変更 file 集合も欠く。
  state 由来の構造化注入の方が情報の正確性・定型性が高い。result ファイルは spec-fixer が
  reads に含む前例があるが、reviewer に渡すと「ファイルが変わっていなくても前周の verdict を
  そのまま引き継ぐ」バイアスを生むリスクがある。
- **Why not**: 構造化 findings ＋ commit diff 由来の変更 file 集合を state から機械導出する
  本方針の方が情報ギャップを直接埋める。

## Consequences

### Positive

- spec-review iteration ≥ 2 の reviewer が「前周に何が指摘され、fixer が何を直したか」を
  構造化データで把握でき、stale 再指摘の機会が減る。
- fixer 変更 file の導出は commit diff 由来の機械導出のみ（agent 自己申告を真実源にしない）。
- one-shot 注入（`DynamicContext` per-round 値）により state への汚染がなく、寿命が構造的に保証される。
- 宣言的フック `prepareRoundContext` は将来 code-review / conformance 等への展開時に
  builder を変更せず step 実装を追加するだけで済む（拡張点として機能する）。
- managed runtime では `listCommitChangedFiles` が常に `unavailable` のため注入は省略されるが、
  step は正常続行する（finding-recency と同じ既知の限界として受容）。

### Negative / Trade-offs

- `buildStepContext` に `prepareRoundContext` フックの呼び出し分岐が追加される。
  `enrichContext`（adapter fs ベース）との 2 フック体制になり、doc comment で棲み分けを明示する必要がある。
- `buildStepContext` でフックが throw した場合は best-effort で握りつぶし続行する
  （`derivePriorRoundContext` は never-throw 設計だが防御的に wrap）。

### Known Debt

- managed runtime での注入は `listCommitChangedFiles` が `unavailable` を返すため常に省略される。
  managed での前周 context 注入は将来の別 request として残る（finding-recency と同じ既知限界）。
- finding-recency（後出し検出）の gate 化は ADR 2026-07-24 D2 の将来送りを維持する。
- code-review / conformance 等、spec-review 以外の review ループへの `prepareRoundContext` 展開は
  spec-review での効果確認後の将来 request として残る。

## References

- Request: `specrunner/changes/spec-review-prior-round-context/request.md`
- Design: `specrunner/changes/spec-review-prior-round-context/design.md`
- Spec: `specrunner/changes/spec-review-prior-round-context/spec.md`
- Implementation: `src/core/step/prior-round-context.ts` / `src/core/step/spec-review.ts` /
  `src/core/step/step-context-builder.ts` / `src/core/port/step-types.ts` /
  `src/git/dynamic-context.ts` / `src/prompts/spec-review-system.ts`
- Related（全量列挙規律・後出し検出）: `specrunner/adr/2026-07-24-spec-review-full-enumeration.md`
- Related（spec-review verdict と fixer routing）: `specrunner/adr/2026-07-23-spec-review-fixer-routing.md`
- Related（resume-context の one-shot 注入前例）: `specrunner/adr/2026-05-26-request-constraints-initial-injection.md`
