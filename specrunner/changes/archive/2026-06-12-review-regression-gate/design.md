# Design: レビュー収束後の退行ゲート（累積 findings 台帳の最終コード再照合）

## Context

直列 reviewer チェーン（#622 / #628、ADR-20260611）では impl phase の reviewer が
`["code-review", ...customReviewers]` の順で直列に走り、各 reviewer の needs-fix / fixable は
共用 `code-fixer` で修正される。後段 reviewer のループで `code-fixer` がコードを変更しても、
既に approved を返した上流 reviewer は再実行されない。上流の approved は「承認時点のコード」に対する
保証であり、「チェーン完走時点の最終コード」に対する保証ではない。

`conformance`（受け入れゲート）は tasks.md / design.md / spec.md / request.md の 4 成果物照合に
判定対象が固定されており（`src/prompts/conformance-system.ts:24-29`）、spec に表現されていない
reviewer レンズ（例: security / performance 観点）の退行は検出されない。

この空白を埋めるため、全 reviewer チェーン完走後・conformance 前に「退行ゲート」step を置き、
チェーン途中で修正された findings（累積台帳）が最終コードでも修正されたままかを再照合する。

現状コードの前提（参照先を実コードで確認した結果）:

- judge step の findings は `state.steps[step][n].outcome.toolResult.findings` に残る
  （`StepOutcome` の定義は `src/state/schema.ts:113-139`）。
- 修正対象 findings の抽出は純関数 `collectFixableFindings`（`src/core/step/judge-verdict.ts:53`、
  使用箇所 `src/core/pipeline/reviewer-chain.ts:140`）が `resolution === "fixable"` を返す。
- judge 契約（findings 報告・verdict の CLI 導出・実在検証・no-tool-call escalation）は
  `executor.ts` の `isJudgeStep`（`reportTool === JUDGE_REPORT_TOOL` の identity 判定、
  `src/core/step/executor.ts:475`）に集約され、reviewer step は無改修で全防御を受ける。
- pipeline 形状は `PipelineDescriptor` でデータ化され、`composeReviewerDescriptor`
  （`src/core/pipeline/compose-reviewers.ts`）が custom reviewer 非空時のみ base を拡張する。
  reviewer ゼロ個では base を参照同一で返す（ADR-20260611 D9）。

本変更は #622 / #628（custom reviewers）の着地を前提とし、その judge 契約・chain 合成機構を再利用する。

## Goals / Non-Goals

**Goals**:

- 全 reviewer チェーン（code-review + custom reviewers）の完走後・conformance 前に退行ゲート step を実行する。
- ゲートの入力を「累積 findings 台帳」（チェーン途中で fixer が修正した findings の集合）に限定し、
  開放的な再レビューではなく台帳項目の最終コードでの維持を照合する。
- ゲートを judge 契約に乗せ、findings 報告・verdict の CLI 導出・実在検証・escalation を無改修で適用する。
- 退行検出時は既存の code-fixer ループで修正し、矛盾（直すと別の台帳項目が壊れる）は escalation に落とす。
- custom reviewer がゼロの構成ではゲートを構造的に skip し、現行挙動・既存テストを完全一致で維持する。
- ゲート自身の iteration 予算と exhaustion を持たせる。

**Non-Goals**:

- conformance の判定範囲の拡張（4 成果物照合は不変）。
- 並列 reviewer 構成での退行保証。
- findings 台帳の job をまたぐ永続化。
- managed runtime でのゲート agent の自動登録（custom reviewers と同じ既知制約として deferred）。

## Decisions

### D1: 退行ゲートを「custom reviewer 非空時のみ」合成される impl-phase step として注入する

ゲートを `STANDARD_DESCRIPTOR` には含めず、`composeReviewerDescriptor` が custom reviewer を
1 件以上検出したときだけ、最後の reviewer と conformance の間に step として挿入する。
reviewer ゼロ個では `composeReviewerDescriptor` が base を参照同一で返す既存の早期 return
（ADR-20260611 D9）をそのまま通り、ゲートは pipeline に現れない。

- **Rationale**: 要件 5 の skip 条件は「custom reviewer がゼロ」という構造的な性質なので、
  実行時の動的 skip ではなく合成時の構造判定で表現するのが正しい。`STANDARD_DESCRIPTOR` が
  byte-identical に保たれるため、zero-reviewer のテスト群が無変更で green になる（受け入れ基準）。
- **Alternatives considered**:
  - (A) `STANDARD_DESCRIPTOR` に常設し runtime で skip 判定する → zero-config parity が崩れ、
    standard pipeline のテスト・遷移表が変わる。skip 判定ロジックが pipeline engine に漏れる。
  - (B) ゲート専用の pipeline id を新設する → 既存 chain 合成と二重管理になり過剰。

### D2: チェーン先頭からの再走ではなく「台帳照合」を選ぶ（architect 評価済み）

ゲートは reviewer チェーンを先頭から再実行せず、累積台帳の各項目が最終コードで維持されているかだけを
照合する。

- **Rationale**: 再走は reviewer 間の矛盾要求による振動（互いの修正の差し戻し合い）で予算を
  食い潰すリスクがある。台帳照合は項目数で収束が有界であり、矛盾は「直すと別項目が壊れる」という形で
  顕在化して escalation として人間に届く。
- **Alternatives considered**:
  - チェーン全体の再走 → 収束が項目数で有界にならず、振動リスクを持ち込む（architect 却下）。

### D3: `JUDGE_REPORT_TOOL` identity の再利用で executor を無改修にする

ゲート step の `reportTool` に `JUDGE_REPORT_TOOL` singleton をそのまま参照させる。`executor.ts` の
`isJudgeStep` は identity（`=== JUDGE_REPORT_TOOL`）で判定するため、findings 由来の verdict 導出
（`deriveJudgeVerdict`）・finding ref の実在検証（`verifyFindingRefs`）・no-tool-call 時 escalation が
ゲートにも executor 無改修で適用される（要件 3）。

- **Rationale**: ADR-20260611 D3 で custom reviewer が確立した手法。専用 report tool と
  `isJudgeStep` 拡張は判定面を増やすだけで利得がない。
- **Alternatives considered**:
  - 専用 `REGRESSION_GATE_REPORT_TOOL` + `isJudgeStep` 拡張（ADR-20260611 Alt-E と同型）→ 利得なし。

### D4: 既存の chain 遷移 generator にゲートをチェーン末尾として乗せる

`composeReviewerDescriptor` が遷移を生成する際、reviewer chain（`["code-review", ...names]`）に
ゲートを末尾追加した `fixableChain = [...reviewerChain, REGRESSION_GATE]` を
`buildReviewerChainTransitions` に渡す。`nextAfterReviewer(REGRESSION_GATE, fixableChain)` は末尾要素
なので `conformance` を返し、ゲートには次の遷移が自動生成される:

- `regression-gate` needs-fix → `code-fixer`
- `regression-gate` approved → `conformance`
- `regression-gate` approved + fixable findings → `code-fixer`（observation-fix path、通常は不発）
- `code-fixer` approved → `regression-gate`（active reviewer がゲートのとき）

ステップ列も `composeReviewerDescriptor` が custom reviewer step 群の直後・conformance の直前に
ゲート step を挿入する。

- **Rationale**: 既に parity テストで固定された generator を再利用することで、ゲートの遷移行を
  新規ロジックなしに得られる。ゲートは「needs-fix→fixer / approved→次 / 共用 fixer」という点で
  チェーン末尾の reviewer と振る舞いが同型であり、generator の対象として自然に収まる。
- **Alternatives considered**:
  - ゲート専用の遷移行を手書きで足す → generator と二重系統になり、parity が崩れやすい。

### D5: code-fixer を共用し、fixer の findings 取得チェーンにゲートを含める

ゲート専用の fixer は作らず、`code-fixer` を共用する。`loopFixerPairs[REGRESSION_GATE] = code-fixer` と
することで、`pipeline.ts` の fixer 逆引き（`resolvePairedReviewForFixer`）と episode-reset は
ゲートを `[code-review, ...names, REGRESSION_GATE]` の sibling として既存ロジックのまま扱える。

唯一の追加点は code-fixer の findings 取得チェーンである。code-fixer は
`resolveActiveReviewer(state, deriveImplReviewerChain(state))` で「いま収束中の reviewer」を解決し、
その findings ファイルを読む。ここで使うチェーンにゲートを含めるため、新たに
`deriveImplFixerChain(state)`（= reviewer chain に、custom reviewer 非空時のみゲートを末尾追加）を
導入し、code-fixer の `reads()` / `buildMessage()` をこれに切り替える。ゲートが最新 `startedAt` を
持つときだけ active reviewer がゲートになり、code-fixer はゲートの退行 findings を読む。
非ゲートの reviewer を収束中は `startedAt` の比較で従来どおり当該 reviewer の findings を読む。

ゲートの findings ファイルパスは `resolveReviewerResultPath(slug, "regression-gate", n)`
（非 code-review なので `customReviewerResultPath` 経由 = `<slug>/regression-gate-result-NNN.md`）で
解決され、ゲート step の `writes()` も同じパスに書く。

- **Rationale**: ADR-20260611 D5 の many-to-one fixer 機構をそのまま再利用する。reviewer ごとの専用
  fixer は収束ループの組み合わせ爆発を招く（ADR-20260611 Alt-C）。fixer 側で追加が必要なのは
  「ゲートも findings 供給元になり得る」という 1 点のみで、`deriveImplFixerChain` に局所化できる。
- **Alternatives considered**:
  - ゲート専用 fixer → 組み合わせ爆発。
  - `deriveImplReviewerChain` 自体にゲートを足す → 「reviewer chain」の意味を歪め、
    `buildReviewerChainTransitions` の zero-reviewer parity 入力（`["code-review"]`）にも影響し得る。
    fixer 用の派生関数を分けることで意味境界を保つ。

### D6: 累積 findings 台帳の構築戦略（request-review MEDIUM #3 の未定義を解消）

純関数 `collectFindingsLedger(state, reviewerChain)` を新設する。台帳は次で定義する:

- 対象は reviewer chain（`["code-review", ...names]`、**ゲート自身は除く**）の各 step。
- 各 step の **全 `StepRun`**（全 iteration）の `outcome.toolResult.findings` を走査する。
- そのうち `resolution === "fixable"` の finding（= `collectFixableFindings` が返す集合）だけを採る。
  `decision-needed` は escalation に分岐して fixer の対象にならず、その時点で job が halt するため
  チェーン完走（= ゲート到達）時点の台帳には現れない。
- 構造的重複（同一 `file` + `line` + `title`）を排除する（`dedupeFindings`）。意味的重複
  （表現違いの同一指摘）の判断はゲート agent に委ねる（台帳を prompt に提示して agent が照合する）。

台帳はゲート step の `buildMessage` が `collectFindingsLedger` で構築し、findings ブロックとして
prompt に埋め込む。ゲートは台帳項目の集合に対してのみ最終コードを照合する。

- **Rationale**: 「needs-fix / fixable として報告され fixer が修正した findings の集合」という要件 2 の
  定義は、ルーティング上 `resolution === "fixable"`（critical/high の fixable と approved-route の
  low/medium fixable の和）と一致する。全 iteration を走査するのは「途中で修正されて後に approved に
  なった項目」を取りこぼさないため。
- **Alternatives considered**:
  - 最終承認直前の run のみ収集 → 途中で修正された項目（最終 run では findings に出ない）を取りこぼす。
  - `decision-needed` も含める → それらは escalation 済みで fixer 修正の対象ではない（台帳の定義に反する）。

### D7: ゲート自身の iteration 予算と exhaustion

`composeReviewerDescriptor` が `maxIterationsByStep[REGRESSION_GATE] = REGRESSION_GATE_MAX_ITERATIONS`
（hardcode 定数）を供給し、`loopNames` にゲートを含める。`Pipeline.resolveMaxIterations` と既存の
per-step exhaustion / episode-reset 機構（ADR-20260611 D6）がゲートにそのまま適用される。
`LOOP_ERROR_CODES[REGRESSION_GATE]` に専用エラー形（`REGRESSION_GATE_RETRIES_EXHAUSTED`）を追加し、
exhaustion 時に `regression-gate-result-NNN.md` を指す hint を出す。exhaustion は
`handleExhausted` 経由で `awaiting-resume`（resumeStep = `code-fixer`）に落ちる。

- **Rationale**: 要件 6。ゲートの予算を pipeline の global maxRetries から独立させ、台帳照合という
  有界タスクに見合う小さな予算で収束/halt させる。
- **Alternatives considered**:
  - global `maxRetries` を共用 → ゲートの予算が pipeline 既定値に結合し、独立調整できない。
  - 予算の config 公開 → 初期は hardcode 定数とし、必要になれば別途（Open Questions）。

### D8: ゲートの role は `gate`、managed は custom reviewer と同じ既知制約

descriptor の `roles[REGRESSION_GATE] = { role: "gate", phase: "impl" }` とする。これは impl phase の
「reviewer は code-review 1 つ」という不変条件（pipeline-roles）を壊さない。agent definition の `role` は
custom reviewer と同様に型アサーション（`"regression-gate" as AgentStepName`）で持たせ、
`AGENT_STEP_NAMES` / `STEP_NAMES` には追加しない。managed runtime での agent 自動登録は
custom reviewers と同じく deferred（ゲートは custom reviewer 非空時のみ走るため制約も同型）。

- **Rationale**: ADR-20260611 の custom reviewer と同じ「注入される非標準 step」カテゴリに収め、
  kernel の step 名 whitelist・双方向 guard・`STEP_NAMES` を一切触らないことで zero-reviewer の
  既存テストへの波及をゼロにする。
- **Alternatives considered**:
  - `AGENT_STEP_NAMES` / `STEP_NAMES` / `AgentStepName` に `regression-gate` を追加する →
    kernel churn が増え、ゲートは standard registry に入らないため managed 自動登録の利得もない。

## Risks / Trade-offs

- [ゲートが prompt frame を逸脱して開放的再レビューを始める] → CLI 所有の固定 frame
  （`REGRESSION_GATE_SYSTEM_PROMPT`）で「台帳項目の照合のみ」「台帳に無い新規観点を出さない」を明示し、
  台帳を prompt に列挙して照合対象を閉じる（ADR-20260611 D2 のスロット注入と同型の防御）。
- [custom reviewer 非空のテストが変わる] → 最後の reviewer の遷移が「→ conformance」から
  「→ regression-gate → conformance」に変わるため、`compose-reviewers.test.ts` /
  `custom-reviewers-e2e.test.ts` 等の reviewer 非空テストは更新する。zero-reviewer
  （`STANDARD_DESCRIPTOR` 由来）のテストは一切触らず green を維持する。
- [台帳が空でもゲートが agent session を起動する] → ゲート prompt は空台帳で即 approved（findings: []）と
  する。構造的 skip は要件 5 どおり「custom reviewer ゼロ」に限定する。
- [矛盾検出が agent の判断に依存する] → frame で「ある台帳項目を直すと別の台帳項目が必然的に再発する場合は
  `decision-needed` を報告する」と criterion を明示し、`deriveJudgeVerdict` で escalation に落とす。
  収束しない場合は D7 の exhaustion が最終的な安全網になる。
- [managed runtime でゲートが getAgentId 失敗する] → custom reviewers と同じ既知制約。ゲートは
  custom reviewer 非空時のみ走るため、影響範囲は custom reviewers と一致。E2E は managed mock で
  agentId をハンドコンフィグして検証する。

## Open Questions

- ゲート予算を config（例: `config.steps["regression-gate"].maxIterations`）に公開すべきか。
  初期は hardcode 定数とする。
- 空台帳の skip を「agent の即 approved」ではなく決定的な遷移（ゲート step を走らせない）にすべきか。
  初期は agent 即 approved とし、構造的 skip は reviewer ゼロのみに限定する。

## Migration Plan

新規 step の additive な注入であり、既存 state スキーマ・config・成果物レイアウトの変更はない。
opt-in（custom reviewer 非空時のみ有効）であり、ロールバックは本変更の revert で完結する。
進行中 job は `JobState.reviewers` snapshot により pipeline 形状が固定されるため、resume 時も一貫する。
