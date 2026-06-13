# Design: pipeline profile に権限スコープを宣言し、スコープ超過を diff から導出して既存 escalation に載せる土台

## Context

将来の制約付き経路（軽量 fast pipeline、fixup 再入場）に「責務 ＝ 権限の範囲」を宣言させ、実行がその範囲を越えたら黙って重い処理をやらずに **escalation** するための土台を入れる。本 request は土台のみで、経路本体・昇格・再分類は別 request（スコープ外）。

検証済みの現状（コードを読んで確認した前提）:

- verdict / escalation 導出は純関数に分離済み。`deriveJudgeVerdict()`（`src/core/step/judge-verdict.ts`）は `ok=false` と `decision-needed` を `escalation` に落とす。`Finding`（`src/kernel/report-result.ts`）に verdict フィールドは無く、agent は finding を出すだけ。
- 停止状態は `awaiting-resume`。step verdict が `escalation` の場合、transition table に該当行が無ければ `nextStep` は `"escalate"` に既定化され（`src/core/pipeline/pipeline.ts:298`）、`escalate` terminal で `transitionJob(state, "awaiting-resume", { resumePoint: { step: <currentStep> } })`（同 line 330–345）へ落ちる。
- escalation コメントは `getOpenDecisionFindings(state)` が `resumePoint.step` の最新 run の `outcome.toolResult.findings` から `decision-needed`・未決・`options.length >= 2` を抽出して描画する（`src/core/notify/issue-notifier.ts:148`）。
- `decision-needed` finding は decision-ledger で `computeFindingKey(step, finding)`（`step|file|line|title|rationale`）をキーに open/closed 追跡される（`src/core/decision/decision-ledger.ts:32`）。人間が決めた breach は `filterUndecidedFindings` が落とすので再 escalate しない。
- judge step の verdict 導出・finding ref 検証は `StepExecutor.finalizeStep`（`src/core/step/executor.ts:605`）に集約され、diff 系 I/O は `RuntimeStrategy` seam（`verifyFindingRefs` / `listChangedFiles`、`src/core/port/runtime-strategy.ts`）経由で受け取る。
- `PipelineDescriptor`（`src/core/pipeline/types.ts:32`）に権限スコープ相当のフィールドは無い。registry は `standard` / `design-only` の 2 本（`src/core/pipeline/registry.ts`）。`composeReviewerDescriptor` は `{ ...base }` で base を spread するため、base に足したフィールドは合成 descriptor に伝播する。
- `pipelineId` は生成時に一度だけ設定され（`src/state/pipeline-id.ts` / `src/store/job-state-store.ts:104`）、途中での付け替え経路は存在しない。

現状 escalation を駆動できるのは **agent 申告の finding だけ**。「この実行は経路の責務外のことをした」という **機械的に導出される** escalation 源が存在しない。本 request はこれを足す。設計原理「判断は導出する、自己申告させない」を境界の話に適用する。

## Goals / Non-Goals

**Goals**:

- `PipelineDescriptor` に任意の権限スコープ宣言フィールドを足す（データで表現、absent = 無制限 = 現行）。
- 宣言スコープ・最終 changed-files・state を入力に超過有無と抵触面を返す **純関数（歯）** を、fs / child_process を import しない domain モジュールとして置く。
- 機械源の breach から CLI が **scope marker 付き `decision-needed` finding を決定的に合成** し、agent 申告の意味源 finding と **同一表現に畳む**。両者とも既存の `decision-needed → escalation` 導出・decision-ledger・issue 描画・`≥2 options` 契約を一本道で通す。
- 本 request の escalation 出口は「人間へ」（`awaiting-resume`）の 1 つだけ。既存 `issue-notifier` / resume 系を再利用する。
- スコープを宣言する profile が無いので、**既定挙動は完全一致**（スコープ超過は一切発火し得ず、既存テストが無変更で green）。

**Non-Goals**（スコープ外、いずれも土台 merge 後の上物 request）:

- 昇格（fast → standard）出口、再分類（fixup → 新 request）出口、軽量 fast pipeline 本体、fixup 再入場経路（`awaiting-archive → running`、Issue #629）、fixup の custom reviewer 選択的再実行。
- 既存 pipeline（`standard` / `design-only`）の挙動変更（スコープ未宣言のまま無改変）。
- `FindingResolution` への新 resolution 値の追加（本 request は型で「追加しないこと」を固定する）。
- 新しい escalation 機構・並行 escalation 経路の新設。
- `pipelineId` の付け替え経路。

## Decisions

### D1: 権限スコープは profile の宣言データとして持つ

`PipelineDescriptor` に任意フィールド `permissionScope?: PermissionScope` を足す。`PermissionScope` は小さな構造体（自由文ではなく導出可能な形）:

- `checkpoint: string` — スコープ超過を評価する step 名。ここで最終 diff に対して歯を回す。判断を導出に乗せるため、評価点も「どの step で評価するか」を **データで宣言** する（D5 で利用）。checkpoint は finding から verdict を導出する judge 系 step（`JUDGE` / `CODE_REVIEW` / `CONFORMANCE` report tool を持つ step）であること。
- `forbidden: ForbiddenSurface[]` — 機械軸の禁止面の列挙。各 `ForbiddenSurface` は:
  - `id: string` — 抵触面の安定識別子（escalation の rationale に決定的に描画される）。
  - `paths: string[]` — base...HEAD の changed-file パスに対する glob 群。いずれかにマッチしたら当該面に抵触。

`permissionScope` absent → 無制限（＝現行挙動）。意味軸の境界は D2/D3（agent finding）で扱う。

**Rationale（why data not prompt）**: プロジェクトが明示的に避けている「ルールをプロンプトに足し続ける対症療法」は脆く強制力が無い。スコープを構造化フィールドで持ち歯で照合すれば、機械軸は決定的・反証可能になる。`checkpoint` を profile に持たせるのは「scope はデータ」の対称形（評価点も宣言データ）であり、`conformance` 等を executor にハードコードしないため。

**Alternatives considered**: (a) 権限範囲をプロンプトの心得として書く → 却下（脆く強制力なし、対症療法の再発）。(b) 評価点を `conformance` に固定ハードコード → 却下（fast pipeline 等 conformance を持たない profile で再利用不能、データ駆動原則に反する）。(c) `checkpoint` を `PipelineDescriptor` のトップレベル別フィールドにする → 却下（scope 概念の凝集を崩す。「どこで・何を禁じるか」は 1 つの宣言に畳む）。

### D2: トリガは 2 源、既存 2 機構を再利用し同一表現に畳む

- **機械境界** → D4 の歯が breach を導出 → CLI が `decision-needed` finding を **合成**（D5）。core-invariants の grep（diff/src への違反導出）と同型。
- **意味境界** → agent が同じ scope marker 付き `decision-needed` finding を **emit** → 既存 `parseFindings` が捕捉。
- 両者とも `decision-needed` という同一表現に畳み、既存の `deriveJudgeVerdict` の `decision-needed → escalation` 導出と decision-ledger（`computeFindingKey`）を共有する。

**Rationale**: 「これはスコープ外か？」を agent に一括で問う統一案は、導出可能な判断を agent に戻すため中心思想に逆行する。機械軸は導出、意味軸のみ agent。同一表現に畳むことで decision-ledger key・escalation 導出・issue 描画・`≥2 options` 契約の再実装が不要になる。

**Alternatives considered**: 全境界を agent finding に統一 → 却下（機械的に導出できる判断を agent に戻す）。

### D3: 意味的境界は `decision-needed` + scope marker、新 resolution 値は採らない

`Finding`（`src/kernel/report-result.ts`）に任意の discriminator `origin?: "scope"` を 1 つ足す（absent = in-scope = 現行）。additive・後方互換で migration 不要。粗く保ち「scope 由来か否か」だけ持つ。intent 逸脱 / 矛盾 / 新 request にすべき等の細かい理由は既存 `rationale` に接地させる。derived（歯）vs agent の 2 軸目は計測要求が出てから足す（先に増やさない）。

`origin` は: (1) `Finding` interface に optional 追加、(2) `parseFindings`（`src/core/port/report-result.ts`）が present かつ妥当な時に捕捉、(3) agent-facing zod schema（`findingSchema` / `conformanceFindingSchema`、`src/core/step/report-tool.ts`）に optional として追加（意味源が emit 可能・codex strict で reject されないため）。

**Rationale（why marker not new resolution）**: resolution は「どう解消するか」の軸（fixable=fix で解消 / decision-needed=人間が選択肢から選ぶ）。scope 由来か否かは「出自」の別軸。新 resolution 値は軸の取り違えに加え、decision-needed にぶら下がる decision-ledger key・escalation 導出・issue 描画・options 契約を全て作り直す ＝ 中心思想の禁じる並行機構新設。marker なら全て既存のまま乗る。`FindingResolution` の union は `fixable` / `decision-needed` のまま据え置き、本 request では型で「新値を足していないこと」を固定する。

**Alternatives considered**: (a) 新 resolution 値 `scope-exceeded` → 却下（並行機構新設、spec-review escalate の公算大）。(b) `origin` に derived/agent の細粒度を持たせる → 却下（計測要求が出るまで増やさない）。

### D4: 機械的スコープ超過の導出（歯）は純関数として domain に置く

`src/core/pipeline/scope.ts`（新規）に純関数を置く:

- `deriveScopeBreach(input)` — 入力 `{ scope?, changedFiles, state }` を取り `{ breached: boolean, surfaces: string[] }` を返す。`scope` absent / `forbidden` 空 → `{ breached: false, surfaces: [] }`。各 `ForbiddenSurface` の `paths` glob を `changedFiles` に照合し、マッチした面の `id` を **ソート済み** で集める。`state` は将来の state 軸（state-transition 表の変更など）のための予約フィールドで、本土台では changed-files 軸のみ実装する（入力契約は受け入れ基準どおり `(scope, changed-files, state)` の 3 つを取る）。
- `synthesizeScopeFindings(breach, ctx)` — breach から **決定的** に `decision-needed` finding を合成する純関数。後述の D5 の決定的構成（`origin: "scope"`、anchor file、決定的 title / rationale、決定的 3 options）を持つ。

両関数とも fs / child_process を import しない。`scope.ts` を `src/core/pipeline/` 配下に置くことで、既存の **B-5 arch test**（`src/core/pipeline/` 内の fs call-site をゼロ検証、`tests/unit/architecture/core-invariants.test.ts`）が自動でカバーする。child_process についても同等の grep アサーションを arch test に追加して固定する。

diff（changed-files）は executor が **既存の `RuntimeStrategy.listChangedFiles(baseBranch, cwd, branch)` seam** で取得して歯に渡す（ADR `2026-06-10-findings-verification-seam` の `verifyFindingRefs` と同じ前例）。これにより歯は純粋・runtime 非依存に保たれる。

**Rationale**: B-5 / B-8 を守るため diff は domain 内で読まない。`listChangedFiles` は base...HEAD の changed-file 名を返す既存 seam で、新 seam を足さずに再利用できる。changed-file パス glob は「公開型 / 永続形式 / state-transition 表 / 新規トップレベル module」等の機械軸をファイル粒度で表現できる。

**Alternatives considered**: (a) domain 内で diff を直接読む → 却下（B-5 / B-8 違反）。(b) diff 内容（追加行）を返す新 seam を足す → 却下（土台では changed-files 軸で十分、新 seam は最小依存原則に反する。content 粒度は将来拡張で `state` 予約軸とともに検討）。

### D5: 機械源 breach の合成は checkpoint judge step の finalize で行い、既存導出に一本道で乗せる

executor `finalizeStep`（`src/core/step/executor.ts`）の judge 分岐に、`verifyFindingRefs` seam 呼び出しと同位置の合成点を足す。`permissionScope` が宣言され、かつ現在の step が `permissionScope.checkpoint` のとき（runtimeStrategy がある時）:

1. `listChangedFiles` seam で base...HEAD の changed-files を取得。
2. `deriveScopeBreach` で breach 評価。
3. breach があれば `synthesizeScopeFindings` で `decision-needed` finding を合成し、agent findings に **追記** したものを「この step の findings」として扱う。
4. この合成込み findings を `filterUndecidedFindings` → `deriveJudgeVerdict` / `deriveConformanceVerdict` に通す（合成 finding は `decision-needed` なので verdict は `escalation` に落ちる）。
5. 永続化される `toolResult.findings` も合成込みにする（`pushStepResult`）。これにより `getOpenDecisionFindings`（issue-notifier）と decision-ledger が合成 finding を参照できる。

step verdict `escalation` → transition table に該当行なし → `nextStep = "escalate"` → `awaiting-resume`、`resumePoint.step = checkpoint`。`getOpenDecisionFindings(state)` は `resumePoint.step` の最新 run の findings から合成 finding を拾い、既存の escalation コメントに描画する。新機構ゼロ。

合成 finding の決定的構成（decision-ledger key と再 escalate 抑止を効かせるため）:

- `origin: "scope"`、`resolution: "decision-needed"`、`severity: "high"`。
- `file` — 抵触に依らず常に存在する **決定的 anchor**（例: 当該 change の `request.md` 相対パス）。`verifyFindingRefs` が「存在しない ref」として再フラグしないよう、worktree に必ず存在するパスを使う。
- `title` — 固定文言（例「Execution exceeded the pipeline's declared permission scope」）。
- `rationale` — ソート済み抵触面 `id` とマッチした paths を列挙した決定的文字列。
- `options` — 決定的 3 択（`≥2` 契約を満たす）: 重い経路でやり直す / scope 宣言を見直す / 却下。

`computeFindingKey(checkpoint, finding)` は `step|file|line|title|rationale` で、上記が決定的なので key は安定する。人間が `/resume` で決めると decision-ledger に `step=checkpoint` の record が積まれ、`filterUndecidedFindings` が同一 key の合成 finding を落とす ＝ 解決済み breach は再 escalate しない。意味源（agent emit）も同じ judge 経路・同じ key 機構を通るので対称に効く。

`permissionScope` を executor に届ける経路: `buildPipeline`（`src/core/pipeline/run.ts`）が `descriptor.permissionScope` を `StepExecutor` のコンストラクタに渡す（任意・末尾 optional 引数）。`composeReviewerDescriptor` は `{ ...base }` で base を spread するため、custom reviewer 合成後も base profile の `permissionScope` が保たれる。

**Rationale**: 合成は findings を 1 箇所で源泉に追記するだけで、verdict 導出・decision-ledger key・escalation 導出・issue 描画・options 契約の全並行機構を既存のまま通せる。`finalizeStep` は judge verdict と finding ref 検証が既に集約された唯一の合流点であり、合成を別 step に切り出すと findings 永続のタイミングがずれる。

**Alternatives considered**: (a) 合成を専用 CLI step にする → 却下（findings 永続と verdict 導出の合流点から外れ、`getOpenDecisionFindings` が拾えない）。(b) executor が registry を引いて scope を解決 → 却下せず可だが、step 層 → pipeline registry の結合を避けコンストラクタ DI を採る。

### D6: 土台の出口は「人間へ」のみ。`pipelineId` を付け替えない

breach は `awaiting-resume` への遷移のみで終わる。超過理由（抵触面 / 意味的理由）は既存の escalation コメント・resume-context（いずれも open `decision-needed` finding を源にする既存経路）に載る。昇格 / 再分類の出口は作らない。`pipelineId` は生成時一度設定のままで、合成 finding も `pipelineId` を書き換えない（由来に嘘をつかない。正直なモデルは将来の execution 履歴層）。

**Rationale**: 昇格 / 再分類は FSM（`awaiting-archive → running` 等）と `pipelineId` 正直モデルに触れ、「1 request = 1 収束ループ」「既定挙動完全一致」を壊す。最重量の FSM 変更は独立 request に値する。

**Alternatives considered**: 3 出口を今やる → 却下（規模過大）。

### D7: 既定挙動完全一致

`PIPELINE_REGISTRY` のどの profile（`standard` / `design-only`）も `permissionScope` を宣言しない。`permissionScope` absent → D5 の合成点は常に不活性 → スコープ超過は一切発火し得ない。`Finding.origin` absent / `forbidden` 空も現行と完全一致。既存の `judge-verdict` / decision-ledger / executor テストは無変更で green、または additive 拡張のみ。

## Risks / Trade-offs

- [Risk] managed runtime では `listChangedFiles` が常に `[]` を返す（seam 契約）ため、managed では機械軸 breach が不活性になる。→ Mitigation: 本土台は scope 宣言 profile を持たず影響ゼロ。利用者（local 想定の fast pipeline）が別 request で扱う。必要なら将来 managed 用 diff seam を足す（本 request 範囲外）。
- [Risk] 禁止面を changed-file パス glob で表現するため、同一ファイル内の「公開型変更」と「内部型変更」をファイル粒度で区別できない。→ Mitigation: 土台は path 粒度で機械軸を表現し、content 粒度は将来拡張（`deriveScopeBreach` の `state` 予約軸 ＋ 追加 seam）に委ねる。土台のフィールド形はこの拡張を妨げない。
- [Risk] `origin` を agent-facing zod schema に足すと tool の JSON schema が変わり、codex strict 変換で `origin` が `required` + nullable に入る。→ Mitigation: 既存 strict-schema テスト（`tests/adapter/codex/strict-schema.test.ts`）は `toContain` / 特定キー検証で exact snapshot ではないため additive で green を保つ。実装時に当該テスト群の green を確認する。
- [Risk] 合成 finding の `file` が `verifyFindingRefs` に「存在しない ref」と判定されると意味がぶれる。→ Mitigation: worktree に必ず存在する決定的 anchor（change の `request.md`）を使う。仮に再フラグされても結果は `escalation`（望む出口）で変わらない。
- [Trade-off] checkpoint を judge 系 step に限定する（finding 経由で verdict を導出する step でないと合成 finding が routing されない）。→ 利用者 profile はこの制約下で checkpoint を選ぶ。本土台ではドキュメントで明示する。

## Open Questions

- `ForbiddenSurface` の最終形は path glob の列挙で確定とするか（content 粒度の面まで土台に含めるか）。本設計は **path glob の列挙** を推奨し、content 粒度は将来拡張に倒す。
- `permissionScope.checkpoint` が judge 系 step であることを build 時に検証する guard を足すか。本土台では未宣言のため実害ゼロ。利用者 request で guard を検討する（先に増やさない）。
