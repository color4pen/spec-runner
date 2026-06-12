# Design: conformance needs-fix の戻り先 step 導出

## Context

conformance は code-review（および custom reviewer 群 + regression-gate）の収束後に走る受け入れゲートで、4 つの上流成果物（tasks.md / design.md / spec.md / request.md）への適合性を判定する read-only judge step である。verdict が needs-fix のとき、現在は一律 implementer に戻る。

- 遷移表 `src/core/pipeline/types.ts:173-174`：`CONFORMANCE on approved → ADR_GEN` / `on needs-fix → IMPLEMENTER` の 2 エントリのみ。
- conformance は paired fixer を持たない loop step。`src/core/pipeline/pipeline.ts:382-393` で「loop step かつ paired fixer 無し」の打ち切り判定が走り、`CONFORMANCE_RETRIES_EXHAUSTED`（`types.ts:116-120`）で halt する。
- verdict は agent の自己申告ではなく CLI が findings から決定的に導出する（R7 契約）。`src/core/step/judge-verdict.ts:32-40` の `deriveJudgeVerdict` が severity / resolution から `approved | needs-fix | escalation` を決め、`src/core/step/report-tool.ts:99` に「`approved` field は routing に使われない」と明記される。executor の導出呼び出しは `src/core/step/executor.ts:620-657`。
- findings 要素型は `{ severity, resolution, file, line?, title, rationale }`（`src/kernel/report-result.ts:21-32`）。戻り先を表すフィールドは存在しない。
- fixer への findings 注入は 2 系統ある：(a) state-based — code-fixer / spec-fixer が `getLatestJudgeFindings(state, reviewer)`（`src/core/step/fixer-helpers.ts:51-64`）で `StepRun.outcome.toolResult.findings` を読み、`buildFindingsBlock` で prompt 埋め込みする。(b) file-based — build-fixer が `enrichContext`（`src/core/step/build-fixer.ts:76-86`）で verification-result.md を実読みして dynamicContext へ注入する。
- 遷移表は `(step, outcome)` キー（`Transition.on: Verdict | string`、`pipeline.ts:295-298` で文字列一致 lookup）。`StepOutcome.verdict` は `Verdict | string | null`（`src/state/schema.ts:116`）で、閉じた `Verdict` union を拡張せずとも任意文字列 outcome を扱える。

### 観測された問題（issue #561 / #560）

conformance の findings は性質が混在する。「spec 自体の漏れ」を implementer に戻しても implementer は spec を直せず空振りする（#561 / #560 で implementer が 2 回空振り）。問題の性質に応じて implementer / code-fixer / spec-fixer へ戻すルーティングが必要。

### 制約

- routing の最終決定は CLI が findings から導出する（R7 契約維持、verify-don't-trust）。agent には「問題の性質分類」という semantic content だけを委ねる。
- 戻り先ごとに新しい後続遷移は定義しない。遷移表が `(step, outcome)` キーである以上、戻り先 step の既存遷移が後続フローを引き受ける（code-fixer → code-review、spec-fixer → spec-review、implementer → verification）。
- 3 方向どの戻り先を経由しても、収束予算は `CONFORMANCE_RETRIES_EXHAUSTED` の単一予算で打ち切る。
- 既存ジョブ記録（旧 plain `needs-fix` outcome を持つ history）の resume を壊さない。

## Goals / Non-Goals

**Goals**:

- conformance の findings 要素に戻り先分類 `fixTarget`（`implementer | code-fixer | spec-fixer`、省略時 implementer）を付与する。report tool schema と system prompt に「問題の性質 → 戻り先」の対応を指示する。
- CLI が conformance findings の `fixTarget` を集約して needs-fix の戻り先を導出する（優先則を定義）。agent の宣言値を直接 routing に使わない。
- 遷移表に `CONFORMANCE on needs-fix:implementer / needs-fix:code-fixer / needs-fix:spec-fixer` の 3 エントリを追加し、旧 `needs-fix → implementer` は後方互換として残置する。
- 戻り先 step（implementer / code-fixer / spec-fixer）が、conformance から戻されたときに conformance findings を読めるよう context へ注入する。
- 3 方向どの経路でも `CONFORMANCE_RETRIES_EXHAUSTED` の単一予算で打ち切る。戻り先 step 側の loop 予算（spec-review / code-review）との二重カウントを解消する。
- 旧形式 history の resume 後方互換をテストで固定する。

**Non-Goals**（request スコープ外）:

- design step への戻り（コスト高。実需を見極めてから別途検討）。
- 他の judge step（spec-review / code-review / request-review / custom reviewer）への fixTarget 導入（conformance のみ）。
- conformance の findings 品質そのものの改善。
- `Verdict` 閉 union の拡張（outcome は文字列で流れるため不要）。

## Decisions

### D1: conformance findings に `fixTarget` を付与し、conformance 専用 report tool を導入する

- `src/kernel/report-result.ts` に `export type FixTarget = "implementer" | "code-fixer" | "spec-fixer"` を追加し、`Finding` に optional `fixTarget?: FixTarget` を追加する（optional ゆえ既存 step は無影響）。
- `src/core/step/report-tool.ts` に **conformance 専用** の `CONFORMANCE_REPORT_TOOL`（`ReportToolSpec<ConformanceReportResult>`）を新設する。findings の zod schema に `fixTarget: optional(union(literal("implementer"), literal("code-fixer"), literal("spec-fixer")))` を含め、description に「問題の性質と戻り先の対応」を明記する。
- `src/core/port/report-result.ts` に `ConformanceReportResult extends JudgeReportResult`（追加フィールドなし。型の identity 用）と `parseConformanceReportInput` を追加する。`parseFindings`（`report-result.ts:145-168`）を拡張し、要素に `fixTarget` が存在し妥当な値であれば capture する（妥当でない / 不在なら undefined）。他 step の schema は `fixTarget` を広告しないため、agent は送らず undefined のまま。
- `src/core/step/conformance.ts` の `reportTool` と agent tools を `JUDGE_REPORT_TOOL` から `CONFORMANCE_REPORT_TOOL` に差し替える。

**Rationale**: spec-review も conformance も現在 `JUDGE_REPORT_TOOL` を共有しており、executor の verdict 導出分岐は reportTool の identity 判定（`executor.ts:617`）で行われる。conformance に専用 tool を与えることで、(1) fixTarget を conformance findings にだけ広告し（スコープ封じ込め）、(2) executor が conformance を spec-review と identity で区別して専用導出に分岐できる。`fixTarget` を base `Finding` の optional にするのは、`parseFindings` を 1 本に保ち（DRY）、capture と利用を分離するため（capture は共通、利用は conformance 限定）。

**Alternatives considered**:
- *agent が `fixTarget` を base Finding 必須にする*：他 judge step に無意味なフィールドを強制し schema が汚れる。却下。
- *conformance 専用の `parseConformanceFindings` を別実装*：parseFindings と二重管理になり drift の温床。optional capture の拡張で十分。却下。

### D2: CLI が `fixTarget` を集約して戻り先付き verdict を導出する（R7 維持）

- `src/core/step/judge-verdict.ts` に純関数 `deriveConformanceVerdict(findings, ok): "approved" | "escalation" | "needs-fix:implementer" | "needs-fix:code-fixer" | "needs-fix:spec-fixer"` を追加する。
  - まず `deriveJudgeVerdict(findings, ok)` を再利用して `approved | needs-fix | escalation` を得る。`approved` / `escalation` はそのまま返す。
  - `needs-fix` のとき、needs-fix を惹起した findings（severity `critical | high`）の `fixTarget`（省略時 `implementer`）を集約し、優先則で 1 つの戻り先を選び `needs-fix:<target>` を返す。
- **集約の優先則**: `spec-fixer > implementer > code-fixer`。
- executor（`executor.ts:620-643`）に conformance 分岐を追加する：`isConformanceStep = stepReportTool === CONFORMANCE_REPORT_TOOL` を導入し、`isRequestReviewStep` の次・`isJudgeStep` より前で `verdict = deriveConformanceVerdict(tr.findings ?? [], tr.ok)` を呼ぶ。`isJudgeStep` の定義に `isConformanceStep` を OR で含め、finding 実在検証（`verifyFindingRefs`、`executor.ts:645-657`）と no-tool-call escalation fallback（`executor.ts:662-664`）は conformance にも従来どおり適用する。

**優先則の Rationale**: 戻り先は「再実行が下流をどれだけ広く作り直すか」で並ぶ。
- `spec-fixer`（最優先）：spec / design の誤りは下流の test・実装・コード修正をすべて無効化する。spec-fixer → spec-review → test-case-gen → implementer → … と全 impl phase を再生成するため、他 2 つの修正を内包する。
- `implementer`（中位）：実装の欠落・design decision 未反映は再実装で解消し、verification → code-review を再走させる。
- `code-fixer`（最下位）：局所的なコード不適合のみ。再走範囲が最も狭い。

混在時に最も広い戻り先を選べば、その経路が下流成果物を作り直し、次の conformance round で再評価される。これが最も安全な収束（狭い修正に倒すと spec の誤りが残置し空振りが再発する）。`fixTarget` 省略時 `implementer` は既存挙動（plain `needs-fix → implementer`）に一致する。

**R7 維持の Rationale**: agent は finding ごとに「問題の性質」を `fixTarget` として **ラベル付け** するだけで、routing の決定（集約・優先則・verdict 文字列化）は CLI の純関数が握る。agent の宣言値が直接 outcome になる経路は作らない。

**Alternatives considered**:
- *却下（issue 原案）：agent が outcome 値（`needs-fix:implementer` 等）を直接宣言する* — verdict 導出を CLI が持つ R7 契約と矛盾し、自己申告が routing を直接決める経路を新設してしまう。outcome 値の分割自体は採用するが、値は CLI が findings から導出する。

### D3: 遷移表に 3 エントリを追加し、旧 `needs-fix` は残置する

- `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` の conformance 区画（`:173-174`）を以下に置き換える：
  - `{ CONFORMANCE, on: "approved", to: ADR_GEN }`（不変）
  - `{ CONFORMANCE, on: "needs-fix:spec-fixer", to: SPEC_FIXER }`（追加）
  - `{ CONFORMANCE, on: "needs-fix:implementer", to: IMPLEMENTER }`（追加）
  - `{ CONFORMANCE, on: "needs-fix:code-fixer", to: CODE_FIXER }`（追加）
  - `{ CONFORMANCE, on: "needs-fix", to: IMPLEMENTER }`（**残置** — 後方互換）
- 戻り先 step の後続遷移は新設しない（既存遷移が引き受ける）：`spec-fixer on approved → spec-review`（`types.ts:156`）、`implementer on success → verification`（`types.ts:158`）、code-fixer → reviewer/next は `buildReviewerChainTransitions`（`reviewer-chain.ts:187-208`）が供給。
- `composeReviewerDescriptor`（`compose-reviewers.ts:62-83`）は conformance 行を filter 対象に含めないため、3 エントリは custom reviewer 構成でも保持される（変更不要）。

**残置（置換しない）の Rationale**: 新しい conformance run は `deriveConformanceVerdict` により常に `needs-fix:<target>` を産出するので、通常 plain `needs-fix` は出ない。しかし (1) 旧 history を持つ state の resume・(2) 将来の fallback 経路が plain `needs-fix` を outcome として lookup に流す可能性がある。残置すれば `transition?.to ?? "escalate"`（`pipeline.ts:298`）の escalate 落ちを防ぎ、歴史的既定（implementer）へ解決する。残置はゼロリグレッション（既存 episode-reset テスト TC-070/071 は plain `needs-fix` リテラルで routing/exhaustion を検証しており、残置で無変更 green）。

**Alternatives considered**:
- *plain `needs-fix` を削除（置換）* — 旧 history resume と既存テストが escalate 落ちする可能性。後方互換要件 6 に反する。却下。

### D4: 戻り先 step への conformance findings 注入（state-based + entry 検出）

- `src/core/step/fixer-helpers.ts` に純関数 `getConformanceFixContext(state, stepName): Finding[] | null` を追加する。「この step が今 conformance の戻り先として入場したか」を判定し、該当時のみ conformance の最新 findings を返す：
  1. `lastConf = 最新 conformance run`。無ければ `null`。
  2. `lastConf.outcome.verdict` が `needs-fix:<target>` 形でなく、または `<target> !== stepName` なら `null`。
  3. **recency 判定**：`lastConf.endedAt` が、この step の「通常の前駆 step の最新 run」の `endedAt` より新しいときのみ採用する。前駆 step は step ごとに定める：code-fixer → active reviewer（`resolveActiveReviewer(state, deriveImplFixerChain(state))`）、spec-fixer → spec-review、implementer → implementer 自身の前 run。新しくなければ `null`。
  4. `lastConf.outcome.toolResult.findings` を返す。
- 各戻り先 step の `buildMessage` で `getConformanceFixContext` が非 null のとき、`buildFindingsBlock(findings)`（reviewer 名なし）で「## Conformance non-conformities（must resolve）」ブロックを構築し、conformance 起点であることを明示して埋め込む。fixer continuation（`isFixerContinuation`）でも同様に conformance findings を渡す。
  - code-fixer / spec-fixer：conformance 入場時は reviewer findings の代わりに conformance findings を使う（同一 `buildFindingsBlock` 経路）。
  - implementer：通常メッセージ（tasks.md / spec.md 指示 + dynamicContext）に conformance non-conformities セクションを追記する。
- 各戻り先 step の `reads()` を整合させる：conformance 入場時は required input を conformance 結果ファイル（`conformanceResultPath(slug, latestIteration(state, CONFORMANCE))`）に切り替える（存在保証され STEP_INPUT_MISSING を起こさない）。非入場時は現行の reads を維持する。

**Rationale**: conformance findings は構造化されて `StepRun.outcome.toolResult.findings` に格納される（spec-review / code-review と同じ）。よって build-fixer の file-based `enrichContext`（verification は prose 出力ゆえ実読みが必要）ではなく、code-fixer / spec-fixer と同じ **state-based 注入**が自然で、`fixTarget` を保ったまま構造化 findings を渡せる。`enrichContext` は `(dynamicContext, cwd, slug)` 署名で state を受け取らないため「conformance 入場か」の条件分岐（state 依存）を表現できず、本用途には不適。注入の seam は buildMessage（state を持つ）に置く。

**recency 判定が必要な理由**: conformance の verdict は次に conformance が走るまで `needs-fix:spec-fixer` のまま残る。`conformance → spec-fixer → spec-review →（needs-fix）→ spec-fixer` の二巡目では spec-fixer は **spec-review から**入場しており、ここでは spec-review findings を使うべきで conformance findings を使ってはならない。verdict-target 一致だけでは両者を区別できないため、前駆 step との `endedAt` 比較で「直前に走ったのが conformance か」を判定する。pipeline は step を逐次実行するため production の `endedAt` は step 間で単調であり、この比較は決定的（同一 timestamp は synthetic test のみ。injection の unit test は異なる timestamp を与える）。

**Alternatives considered**:
- *file-based `enrichContext` で conformance-result.md を実読み* — enrichContext が state を持たず entry 条件を判定できない。prose の再 parse も必要で構造化 findings を失う。却下。
- *verdict-target 一致のみで判定* — spec-fixer / code-fixer の二巡目（reviewer からの再入場）で stale な conformance findings を誤注入する。却下。

### D5: 単一収束予算（CONFORMANCE_RETRIES_EXHAUSTED）への統一と二重カウント解消

- conformance は paired fixer を持たない loop step であり、`loopIters["conformance"]` の生涯カウンタが conformance-fix 再試行ループの **唯一の予算**である。`pipeline.ts:387-393` の打ち切り判定は「outcome が approved/passed 以外」で発火するため、`needs-fix:<target>` でも従来どおり発火する（条件式は文字列等値ではないため変更不要）。各経路の収束は次のとおり：
  - **code-fixer 経路**：`conformance → code-fixer`。code-fixer は completionVerdict `approved` で完了し、`buildReviewerChainTransitions` の forward 行（`reviewer-chain.ts:190-201`、`active==code-review && lastVerdict(code-review)==approved` で発火）により `code-fixer → conformance` へ戻る（code-review を再走しない）。`conformance ⇄ code-fixer` の tight loop で conformance カウンタが毎周 +1 し、max で `CONFORMANCE_RETRIES_EXHAUSTED`。
  - **implementer 経路**：`conformance → implementer → verification → code-review → conformance`。verification / code-review は非 fixer から入場するため既存の「fresh convergence episode reset」（`pipeline.ts:365-380`）でカウンタがリセットされ、内側 loop の予算が干渉しない（既存挙動。TC-070 で固定済み）。
  - **spec-fixer 経路**：`conformance → spec-fixer → spec-review → … → conformance`。spec-review 以降の verification / code-review は非 fixer 入場でリセットされる。
- **二重カウント解消**：「fresh convergence episode reset」を **fixer step への conformance 起点入場**にも拡張する。`pipeline.ts` の reset ブロック（`:365-380`）の後・exhaustion 判定（`:387-419`）の前に、`nextStep` が fixer かつ `currentStep === CONFORMANCE` のとき、`fixerIters[nextStep] = 0` と、その fixer に対応する review の `loopIters[pairedReview] = 0` をリセットする（`pairedReview = resolvePairedReviewForFixer(state, nextStep, loopFixerPairs)`）。これにより：
  - code-fixer 経路で `fixerIters["code-fixer"]` が code-review phase の残量を引き継いで `CODE_REVIEW_RETRIES_EXHAUSTED` を誤発火しない。
  - spec-fixer 経路で `loopIters["spec-review"]` / `fixerIters["spec-fixer"]` が spec phase の残量を引き継いで `SPEC_REVIEW_RETRIES_EXHAUSTED` を誤発火しない。
- 各 conformance episode は内側 loop に fresh 予算を与える。内側 loop が当該 episode 内で本当に収束不能なら、その内側 loop が正当に exhaust する（episode をまたぐ予算共有だけがバグ）。

**Rationale**: 既存 reset は「loop step への非 paired-fixer 入場」のみを fresh episode 化する（`pipeline.ts:365-380`）。conformance は fixer に **直接**入場するため既存 reset を素通りし、内側 fixer/loop カウンタが run 内で累積していた。conformance 起点の fixer 入場を同型の fresh episode として扱うことで、唯一の打ち切り予算を conformance カウンタに一本化する。

**Alternatives considered**:
- *conformance を loopFixerPairs に登録して専用 fixer を与える* — paired fixer を持つと conformance 自身のカウンタ意味論（生涯カウンタ＝全 phase 再実行の termination guarantee）が壊れ、TC-071 が崩れる。却下。
- *内側 loop の予算リセットをしない* — 単一 run 内で内側 loop が先に exhaust し `CONFORMANCE_RETRIES_EXHAUSTED` を覆い隠す。要件 5 に反する。却下。

### D6: resume 後方互換

- 旧 history（conformance verdict が plain `needs-fix`）の state は、resume 時 conformance を再実行する（`handleExhausted` の resumeStep は paired fixer 不在のため conformance 自身、`pipeline.ts:571`）。再実行で `deriveConformanceVerdict` が新形式 `needs-fix:<target>` を産出するため、routing は新エントリで解決される。
- 万一 plain `needs-fix` outcome が lookup に到達しても D3 の残置エントリが implementer に解決する。
- `getConformanceFixContext` は `verdict` が `needs-fix:<target>` 形でないとき `null` を返すため、旧形式 toolResult（`fixTarget` 不在）を持つ run でも誤注入せず安全に degrade する。

**Rationale**: resume は step 再実行モデルであり、過去の verdict 文字列を直接 routing に使わない。新旧どちらの verdict でも壊れない二重の安全（再導出 + 残置エントリ）。

### D7: 進捗イベントの整合（cosmetic）

- `pipeline.ts:422` の `outcome === "needs-fix"` 等値判定は `needs-fix:<target>` に一致しないため、loop の `pipeline:iteration:verdict`（action: fixer）イベントが conformance で発火しなくなる。`outcome === "needs-fix" || outcome.startsWith("needs-fix:")` に拡張し進捗表示を保つ。打ち切り・routing の正しさには影響しない（cosmetic）。

## Risks / Trade-offs

- **[Risk] agent が `fixTarget` を誤分類し、不適切な戻り先へ routing される** → 戻り先が不適切でも conformance が再評価し、最大 `CONFORMANCE_RETRIES_EXHAUSTED` で打ち切る。最悪ケースでも無限ループにならず escalation に落ちる。優先則（spec-fixer 最優先）が「広く作り直す」側に倒すため、誤分類しても収束方向に働きやすい。
- **[Risk] code-fixer 経路が code-review の再レビューを飛ばす** → conformance が最終ゲートであり、conformance findings の修正後に conformance 自身が再判定するため受け入れ品質は担保される。code-review の再走を挟まないのは re-work 最小化の意図的トレードオフ。
- **[Risk] recency 判定が `endedAt` の単調性に依存** → pipeline は step を逐次実行するため production では単調。synthetic test のみ同一 timestamp になり得るため、injection を検証する unit test は異なる timestamp を与えて固定する。
- **[Risk] custom reviewer 構成での code-fixer 経路** → custom reviewer chain + regression-gate が存在する場合も、conformance → code-fixer 入場時の fixer/loop リセット（D5）と code-fixer の active-reviewer forward routing（既存）で conformance カウンタに一本化される。E2E は標準 pipeline を主対象とし、chain 構成は episode-reset の既存テスト型で補強する。

## Open Questions

- design step への戻り（spec-fixer でも救えない、design 自体の構造的誤り）は本変更のスコープ外。実需が観測されたら別 request で `needs-fix:design`（design 再実行）を追加検討する。優先則は `design > spec-fixer > implementer > code-fixer` に自然拡張できる設計余地を残す。
