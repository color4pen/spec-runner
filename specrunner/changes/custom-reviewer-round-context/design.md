# Design: custom reviewer に周回知識(前周 findings・operator 裁定)を注入する

## Context

custom reviewer は毎周回、独立した agent session として起動し、前周の記憶を持たない。
round N+1 の reviewer は「自分が前周何を指摘したか」「code-fixer がその後何を変更したか」
「operator が escalation にどう裁定したか」をいずれも知らない。結果として (a) 修正済み指摘の
stale な再提出、(b) 裁定済み事項の再発見による escalation の蒸し返し、が起きる。

同種の問題は既存 2 step で解消済みで、注入 seam も共通化されている:

- **周回 context 注入 seam**: `buildStepContext`（src/core/step/step-context-builder.ts:151-160）が
  step の `prepareRoundContext(state, cwd, runtimeStrategy)` を best-effort 実行し、戻り値の
  `Partial<DynamicContext>` を `dynamicContext` に spread-merge する。失敗は握り潰して degrade する。
  この enriched `dynamicContext` は adapter で `ctx.input.dynamicContext` →
  `step.buildMessage(state, deps)` の `deps.dynamicContext` へ渡る（src/adapter/claude-code/agent-runner.ts:452,462）。
- **spec-review**: iteration ≥ 2 で前周 findings + 前周 spec-fixer commit 由来の変更 file を注入
  （src/core/step/spec-review.ts:97-106 + src/core/step/prior-round-context.ts）。
- **adr-gen**: code-fixer commit 由来の post-fix 変更事実を注入
  （src/core/step/adr-gen.ts:179-187 + src/core/step/post-fix-context.ts）。

custom reviewer だけがこの seam を実装していない（src/core/step/custom-reviewer.ts:105-165 の step
object に `prepareRoundContext` が無く、buildCustomReviewerMessage は diffStat と request 制約のみ）。
fan-out member として実行される custom reviewer も `executor.produceResult` →
`buildStepContext` 経由で seam に到達する。

**現状の制約**:

- `job resume --prompt <text>` は one-shot・非永続。resume.ts:435 → runner.ts:223-225 →
  pipeline.ts:208-255（`depsWithoutResume` で strip、最初の unit のみ受領）。state への書き込み経路は無い。
- 構造化裁定 `decisions`（DecisionRecord[]）は issue-comment 経路のみで生成され
  （inbox/planner.ts:288-316、inbox/run-inbox.ts:289-294）、verdict 層の再エスカレーション抑制
  （decision-ledger.ts:66-73）にのみ使われる。reviewer の prompt には注入されない。
- custom reviewer の各 round は `state.steps[<reviewerName>]` に StepRun として記録され、
  `outcome.toolResult.findings` と `endedAt` を持つ（parallel-review-round → commitRound →
  projectSuccess 経由）。code-fixer は sequential step で `commitOid` + `endedAt` を持つ。
- JobState の top-level field は state.json 側で round-trip する（stateToStateJson が spread、
  composeSplitLayoutFromContent が validateJobState を通す）。event-journal threading 不要
  （`decisions` / `reviewerStatuses` / `touchedFiles` と同型）。

## Goals / Non-Goals

**Goals**:

- custom reviewer に `prepareRoundContext` を実装し、iteration ≥ 2 で「前周の自分自身の findings
  projection」+「前周以降の code-fixer commit 由来の変更 file 一覧（machine-derived）」+ 再指摘
  プロトコルを prompt block として注入する。
- `job resume --prompt <text>` の内容を JobState に operator 裁定記録（自由記述 + 対象 step + 時刻）
  として永続化する。one-shot deps 注入は変更しない（永続化は追加のみ）。
- 永続化された裁定記録 + 既存 `decisions` ledger の内容を、custom reviewer round の prompt に
  「operator 裁定」block として注入する（裁定 rationale への反論プロトコルを含む）。
- 導出失敗（git 失敗・findings 欠落）は block 全体を省略して throw せず続行する。

**Non-Goals**:

- built-in code-review step への同機構の適用（別 request 候補）。
- regression-gate への注入（独自の ledger block を既に持つ）。
- spec-review / adr-gen の既存注入の変更。
- `resumePrompt` の one-shot 意味論の変更（全周回への deps 再注入はしない）。
- inbox / issue-comment の decisions 生成フローの変更。
- verdict 層の decisions 抑制（decision-ledger.ts）の変更。

## Decisions

### D1: 注入は既存 `prepareRoundContext` seam で行う(adapter 共通 bundle には足さない)

custom reviewer step object に `prepareRoundContext` を実装し、戻り値の `Partial<DynamicContext>` を
seam が既存 `dynamicContext` に merge、`buildCustomReviewerMessage` が `deps.dynamicContext` から
block を組み立てる。spec-review / adr-gen と同型。

- **Rationale**: findings・裁定は step 固有の意味（再指摘プロトコル / 反論プロトコル）を持ち、
  全 step 共通の artifact bundle（agent-runner.ts:464-476）に混ぜると受け手の規律が書けない。
  seam は既に fan-out member にも到達し、best-effort degrade を保証している。
- **Alternatives considered**:
  - adapter 層の touched-files / artifact bundle に相乗り → 却下（受け手規律が書けない・全 step に漏れる）。
  - buildMessage 内で直接 state を読む → 却下（buildMessage は pure 契約、git diff の I/O を持てない）。

### D2: 導出と block 構築は新 step-local module `custom-reviewer-round-context.ts` に置く

prior-round-context.ts / post-fix-context.ts の構成を踏襲し、以下を export する:

- `deriveCustomReviewerPriorRound(...)` → `{ findings, changedFiles } | null`（I/O は runtimeStrategy port 背後のみ）
- `buildCustomReviewerPriorRoundBlock(ctx)` → XML block（pure）
- `deriveOperatorAdjudicationContext(state)` → 裁定 projection `| null`（pure・no I/O）
- `buildOperatorAdjudicationBlock(ctx)` → XML block（pure）

- **Rationale**: 既存 2 module と同じ「pure block builder + async derivation（port 背後 I/O）」の
  分離により、block 構築とデグレ分岐を独立にテストできる。step 非依存の導出関数にすることで、
  将来 built-in code-review へ流用可能な形（architect の「機構は流用可能な形」要件）を満たす。
- **Alternatives considered**: prior-round-context.ts に相乗り → 却下（spec-review 専用モジュール、
  fixer 種別（spec-fixer vs code-fixer）と再指摘文言が異なる）。

### D3: 前周変更 file は「前周 round 以降の code-fixer commit」を machine-derived で union する

reviewer の前周 round endedAt（`state.steps[<reviewerName>]` 末尾 run の endedAt）より後の
code-fixer StepRun（commitOid 保持分）を対象に、`runtimeStrategy.listCommitChangedFiles(oid, cwd)`
の結果を union する。post-fix-context.ts の `resolveCodeFixerRounds`（既存 export）を再利用する。

- **Rationale**: 「前周以降の変更」を正確に捉える。共有 code-fixer は 1 review 収束ループ内で複数回
  走り得るため、「末尾 code-fixer 1 件だけ」では取りこぼす。commit diff 由来なので agent 自己申告に
  依存しない。all-or-nothing degrade（1 commit でも解決失敗なら null）で部分注入の誤認を防ぐ
  （post-fix-context.ts と同方針）。
- **Alternatives considered**:
  - spec-review 同様「末尾 fixer OID 1 件」→ 却下（複数 fixer round を取りこぼす）。
  - reviewer/fixer が自己申告した touched-files → 却下（machine-derived 要件に反する）。

### D4: operator 裁定の永続化は新レコード型 `OperatorAdjudication` とする

JobState に top-level field `operatorAdjudications?: OperatorAdjudication[]` を追加する。
`OperatorAdjudication = { text: string; step: string; recordedAt: string }`（自由記述 + 対象 step + ISO 時刻）。
`appendOperatorAdjudication(state, record)` を schema/operations.ts に pure helper として置き、
validateJobState に lightweight 検証 block を追加する（`reviewerStatuses` / `touchedFiles` と同型）。

- **Rationale**: architect 採用判断。自由記述の裁定は DecisionRecord の必須 `findingKey` +
  finding snapshot に構造的に適合しない。top-level field は state.json 側で自動 round-trip する。
- **Alternatives considered**: 既存 `DecisionRecord` への相乗り → 却下（構造不適合）。

### D5: 永続化点は resume prepare()。`--prompt` があるときのみ append する

resume.ts prepare() で「running」遷移後、`this.options.prompt` が非空なら
`appendOperatorAdjudication(state, { text: prompt, step: startStep, recordedAt: now })` を適用し、
既存の persist 経路（runStore / no-worktree store）で永続化する。startStep は resolveResumeStep で
解決済みの実際の再開 step。one-shot deps 注入（pipeline.ts D4 の `<resume-context>`）は無改変。

- **Rationale**: resume が prompt の起点であり startStep の解決責務を持つ。ここで append すれば
  「どの step に対する裁定か」を単一箇所で確定できる。pipeline/runner 側は prompt を one-shot として
  strip する設計を維持でき、永続化と one-shot 注入の責務が交差しない。
- **Alternatives considered**: pipeline.ts / runner.ts で永続化 → 却下（strip 責務と交差し、
  startStep 解決文脈も持たない）。

### D6: DynamicContext には custom reviewer 専用の 2 field を追加する(in-memory only)

- `customReviewerPriorRound?: { findings: {...}[]; changedFiles: string[] }`
- `operatorAdjudicationContext?: { adjudications: {...}[]; decisions: {...}[] }`

いずれも in-memory only（collectDynamicContext で毎 run 生成、state/journal へ非永続）。

- **Rationale**: spec-review の `priorRoundContext` を流用すると field の doc/意味（spec-fixer 由来・
  spec-review 専用）が嘘になる。専用 field により各 field の意味と受け手を honest に保つ。
  DynamicContext は元々非永続なので要件 4 の「in-memory only」を自動的に満たす。
- **Alternatives considered**: `priorRoundContext` の再利用 → 却下（意味の overload、doc 不整合）。

### D7: 裁定 block は永続裁定 + decisions ledger の両方を含める(reviewer 単位の絞り込みはしない)

`deriveOperatorAdjudicationContext` は `state.operatorAdjudications` と `state.decisions` の両方を
projection する。両方空なら null（block なし）。block には「裁定済み事項を再指摘する場合は裁定
rationale への反論を明示せよ」プロトコルを含める。

- **Rationale**: どちらも operator 由来の裁定であり、reviewer が respect すべき対象。block 内で
  step ラベルを併記するため、他 reviewer 宛の裁定が混ざっても害は小さい。要件は「decisions ledger
  の内容を注入」であり、絞り込みは要件に含まれない。
- **Alternatives considered**: reviewer 名でのフィルタ → Open Question に送る（過剰スコープ回避）。

### D8: degrade 分岐

- 前周 block を省略（`deriveCustomReviewerPriorRound` → null）する条件:
  iteration < 2 / 前周 findings 欠落（`getLatestJudgeFindings` が null）/
  `runtimeStrategy.listCommitChangedFiles` 不在 / いずれかの diff が非 success or throw。
- 裁定 block を省略する条件: `operatorAdjudications` と `decisions` が共に空。
- seam の best-effort try/catch と pure 導出により、いかなる失敗でも throw しない。

- **Rationale**: 要件 4「導出失敗は block 全体を省略・部分注入しない・throw しない」。
  空 findings（`[]`、前周全 approve）は「欠落」ではないため、変更 file が導出できれば注入する
  （prior-round-context.ts の先例 TC-031 と整合）。

## Risks / Trade-offs

- [Risk] operator 自由記述が reviewer prompt に注入され、prompt-injection / role 逸脱を誘発しうる
  → Mitigation: XML block（`<operator-adjudication>`）で「operator 由来の context」と明示ラベルし、
  裁定への盲従ではなく「反論するなら rationale を明示」という規律 text で囲う。reviewer の system
  prompt は既に `<user-request>` をデータとして扱う規律を持つ。
- [Risk] endedAt ベースの「前周以降」判定は sequential 実行順に依存する
  → Mitigation: pipeline は step を sequential 実行し code-fixer.endedAt > reviewer 前周.endedAt が
  成立する。曖昧時（該当 fixer 無し）は changedFiles=[] に degrade し「変更なし」を明示。
- [Risk] code-fixer が多数回走ると changedFiles union が肥大する
  → Mitigation: commit diff の実変更に上限され、全量列挙が要件のため許容。
- [Risk] decisions を絞り込まないため他 reviewer 宛の裁定が混ざる
  → Mitigation: 各 entry に step ラベルを併記。害は「余分な context」に留まる。

## Open Questions

- 裁定 block を reviewer 名でスコープするか（現状は全裁定を注入）。過剰スコープを避け初回は全注入とし、
  ノイズが問題化したら reviewer 単位フィルタを検討する。
- DecisionRecord の `resumeComment` / `selectedOption.consequence` をどこまで block に展開するか
  （初回は step / title / file / 選択肢ラベル / rationale の projection に留める）。
