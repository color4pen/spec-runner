# pipeline profile に権限スコープを宣言し、スコープ超過を diff から導出して既存 escalation に載せる土台を入れる

## Meta

- **type**: spec-change
- **slug**: scope-exceeded-escalation
- **base-branch**: main
- **adr**: true

## 背景

将来導入する制約付き経路（軽量 fast pipeline、fixup 再入場）に「責務（＝権限の範囲）」を宣言させ、**実行がその範囲を越えたら黙って重い処理をやらずに escalation する**ための土台を入れる。本 request は土台のみ。経路本体・昇格・再分類は別 request（スコープ外節）。

### escalation の基盤は既に揃っている（検証済み）

- verdict / escalation の導出は純関数に分離済み。`deriveJudgeVerdict()` は `ok=false` と `decision-needed` を escalation に落とす（`src/core/step/judge-verdict.ts`）。`Finding` VO に verdict フィールドは無く、agent は finding を出すだけ（`src/kernel/report-result.ts`）。
- 停止状態は `awaiting-resume`。step 失敗時にここへ遷移する（`src/core/runtime/local.ts:839` / `src/core/runtime/managed.ts:512`）。
- `decision-needed` finding と選択肢は issue の escalation コメントに描画される（`src/core/notify/issue-notifier.ts`、D5 周辺 line 147 / marker line 122 / awaiting-resume 分岐 line 236）。
- `decision-needed` finding は decision-ledger で `computeFindingKey(step, finding)` をキーに open/closed 追跡される（`src/core/decision/decision-ledger.ts:32` / `getOpenDecisionFindings`）。≥2 options は**文書化された契約**であり強制バリデータではない（`src/kernel/report-result.ts:26-27,60`、legacy は省略可）。
- regression-gate の findings-ledger は **fixable のみ**を集める（`src/core/pipeline/findings-ledger.ts` の `collectFixableFindings`）ため、decision-needed はそこには載らない。
- 連続 escalation の回路ブレーカが既にある（既定 3 回連続 escalation/error で resume をブロック、`src/core/resume/safety.ts:70-101`）。

### 何が無いか

現状 escalation を駆動できるのは **agent 申告の finding だけ**。「この実行は経路の責務外のことをした」という**機械的に導出される** escalation 源が存在しない。

### 設計原理との整合

これはこのプロジェクトの「判断は導出する、自己申告させない」を**境界の話に適用しただけ**。したがって本 request では2点を守る。

1. 権限の範囲は **profile の宣言データ**として持つ（プロンプトに心得として書かない）。
2. スコープ超過の機械的部分は **diff / state から導出**する（agent の自己申告を信用しない）。導出の歯のパターンは既存の arch 不変条件と同型（`tests/unit/architecture/core-invariants.test.ts` が diff/src への grep から違反を導出している）。

### 現状コードの前提（検証済み）

- `PipelineDescriptor`（`src/core/pipeline/types.ts:32`）に権限スコープ相当のフィールドは無い。
- `pipelineId` は標準 fallback 付きで解決され（`src/state/pipeline-id.ts:19-20`）、生成時に一度だけ設定される（`src/store/job-state-store.ts:104`）。**途中での付け替え経路は存在しない**。
- FSM の `awaiting-archive` の遷移先は `archived` / `canceled` のみ（`src/state/lifecycle.ts:39`）。`awaiting-resume ↔ running` は存在する（同 line 37-38）。
- registry は `standard` / `design-only` の 2 本（`src/core/pipeline/registry.ts`）。

## 要件

最重量の変更を名指しする: **既存の「finding → verdict 導出」に、agent 申告ではない第2の escalation 源（機械導出のスコープ超過）を並置し、pipeline profile に権限スコープの宣言フィールドを追加する。両者とも既定では挙動完全一致**（スコープを宣言する profile がまだ無いため）。

1. **権限スコープの宣言フィールドを `PipelineDescriptor` に追加（任意・既定 absent）**
   - `src/core/pipeline/types.ts:32` の `PipelineDescriptor` に任意フィールドを足す。absent → 無制限（＝現行挙動）。
   - スコープは**データ**で表現する。機械軸の禁止面の列挙（公開型 / 永続形式 / state-transition 表 / 新規トップレベル module 等）。意味軸は要件 3。
   - 正確な形は design step が決定。私の意見は自由文ではなく小さな構造体（導出可能にするため）。

2. **機械的スコープ超過の導出（歯）**
   - `(宣言スコープ, 最終 diff / changed-files, state)` を入力に、機械軸の超過有無と**抵触した面**を返す純関数。fs / child_process を import しない（B-5 準拠 / arch test 対象）。diff/参照は既存の seam 経由で受け取る（`RuntimeStrategy` の `verifyFindingRefs` 前例、ADR `2026-06-10-findings-verification-seam`）。
   - スコープが宣言されている時だけ走る → 既定では不活性。

3. **意味的スコープ超過は decision-needed + scope marker で表現する（新 resolution 値は採らない）**
   - resolution は「どう解消するか」の軸（fixable=fix で解消 / decision-needed=人間が選択肢から選ぶ）。intent 逸脱の解消形は「人間が amend / reject / accept を選ぶ」＝ decision-needed と同形。違うのは解消形ではなく finding の**出自**であり、これは resolution とは別軸。よって新 resolution 値は軸の取り違え。
   - `Finding`（`src/kernel/report-result.ts`）に任意の discriminator を 1 つ足す（例 `origin?: "scope"`、absent = in-scope = 現行）。additive・後方互換で migration 不要（本 request の「absent=現行」パターンと同型）。粗く保ち「scope 由来か否か」だけ持つ。intent 逸脱 / 矛盾 / 新 request にすべき、の細かい理由は既存 `rationale` に接地させる（嘘をつかない ≠ 全部構造化する）。derived（歯）vs agent を 2 軸目に足すのは計測要求が出てからにし、先に増やさない。
   - **2 源を同一表現に畳む**: 機械源（要件 2 の歯）の breach は CLI が scope marker 付き decision-needed を**合成**する（options は `{重い経路でやり直す / scope 宣言を見直す / 却下}` を決定的に生成）。意味源は agent が同じ scope marker 付き decision-needed を emit。どちらも既存の `decision-needed → escalation` 導出（`src/core/step/judge-verdict.ts`）と decision-ledger（`src/core/decision/decision-ledger.ts:32` の `computeFindingKey(step, finding)` / `getOpenDecisionFindings`）を一本道で通る。合成 finding の key は決定的なので「人間が決めた scope breach は再 escalate しない」が自動で効く。
   - これにより並行機構（decision-ledger key・escalation 導出・issue 描画・≥2 options 契約）の再実装が不要。新 resolution 値はこれらを全て作り直す ＝ 中心思想の禁じる並行機構新設になる。

4. **本 request の escalation 出口は「人間へ」の 1 つだけ**
   - `awaiting-resume` へ遷移し、超過理由（抵触面 / 意味的理由）を既存の escalation コメント・resume-context に載せる。新機構は作らず `issue-notifier` / resume 系を再利用する。

5. **既定挙動完全一致の保証**
   - `PIPELINE_REGISTRY` のどの profile も本 request ではスコープを宣言しない → スコープ超過は一切発火し得ず、既存テストが無変更で green。

## スコープ外

隣接する誘惑を名指しで切る。下記はいずれも本土台 merge 後の**上物 request**。

- **昇格（fast → standard）出口** — 同一 job に 2 つ目の execution を重ねつつ `pipelineId` に嘘をつかない実行履歴モデル（前議論の executions[] 正直問題）と FSM 変更が要る。別 request。状態遷移を変えるため fast 適格ではなく、フル standard design を通す。
- **再分類（fixup → 新 request）出口** — 新しい出口・別ライフサイクル。別 request。
- **軽量 fast pipeline 本体（新 descriptor）** — 本機構の**利用者**。土台 merge 後に起票し、本 request が足すフィールドで自分の権限スコープを宣言する。
- **fixup 再入場経路（`awaiting-archive → running`）** — 利用者 ＋ FSM 変更。別 request（Issue #629 を参照）。
- **既存 pipeline の挙動変更** — `standard` / `design-only` はスコープ未宣言のまま無改変。
- **fixup の custom reviewer 選択的再実行** — fixup request の領分。本 request では一切扱わない。

## 受け入れ基準

- [ ] `PipelineDescriptor` に任意の権限スコープフィールドが追加され、absent は無制限として扱われる（unit test）
- [ ] `(scope, diff/changed-files, state)` を取り超過有無と抵触面を返す純関数が存在し、fs / child_process を import しない（B-5、arch test で固定）
- [ ] 宣言スコープの機械境界を越えた時、job が `awaiting-resume` に遷移し、超過理由が escalation コメントに描画される（test）
- [ ] 越えない時は現行と挙動完全一致（test）
- [ ] `Finding` に scope discriminator（任意・absent=現行）が追加され、absent の挙動が現行と完全一致（unit test、migration なし）
- [ ] `FindingResolution` の union は `fixable` / `decision-needed` のまま（新 resolution 値を追加していないことを型で固定）
- [ ] 機械源 breach から CLI が scope marker 付き decision-needed を options 込みで決定的に合成し、既存 `decision-needed → escalation` 導出で `awaiting-resume` に落ちる（test）
- [ ] 意味源 / 機械源いずれの scope finding も decision-ledger（`computeFindingKey`）に乗り、人間が解決済みの scope breach は再 escalate しない（test）
- [ ] 並行 escalation 機構を新設していない（既存 `judge-verdict` / decision-ledger test が無変更 green、または拡張のみ）
- [ ] `PIPELINE_REGISTRY` のどの profile も本 request ではスコープ未宣言 → 既存テストが無変更で green
- [ ] `bun run typecheck && bun run test` が green
- [ ] arch 不変条件（B-1〜B-10 ＋ DSM closure）が green（新導出は domain の純関数として配置）

## architect 評価済みの設計判断

- **スコープはデータ、プロンプトではない**: 権限範囲を profile の構造化フィールドとして持ち、導出の歯で照合する案を採用。却下（プロンプト記載のみ）: 脆く強制力が無く、プロジェクトが明示的に避けている「ルールをプロンプトに足し続ける対症療法」の再発。
- **トリガは 2 源、既存 2 機構を再利用**: 機械境界 → 導出の歯（core-invariants の grep と同型）、意味境界 → agent finding → 既存 `decision-needed → escalation` 導出。却下（統一案）: 「これはスコープ外か？」を agent に一括で問う設計は、導出可能な判断を agent に戻すためプロジェクトの中心思想に逆行。
- **意味的境界は decision-needed + scope marker、新 resolution 値は採らない**: resolution は解消形の軸であり、scope 由来か否かは出自の別軸。新 resolution 値は軸取り違えに加え、decision-needed にぶら下がる decision-ledger key・escalation 導出・issue 描画・options 契約を全て再実装する ＝ 並行機構新設。marker（`Finding.origin?: "scope"`、absent=現行）なら全て既存のまま乗り、機械源（合成）と意味源（emit）を同一表現に畳める。却下（新 resolution 値）: spec-review が「並行機構 ＝ 中心思想違反」で escalate する公算が高く、避けたい往復を生む。marker を粗く保つ（scope 由来か否かのみ）のは「嘘をつかない ≠ 全部構造化する」の線で、細かい理由は `rationale` に接地。
- **土台の出口は「人間へ」のみ**: 昇格 / 再分類は FSM と pipelineId 正直モデルに触れ、「1 request = 1 収束ループ」と「既定挙動完全一致」を壊す。最重量かつ設計負荷の高い FSM 変更は独立 request に値する。却下（3 出口を今やる）: 規模過大。
- **`pipelineId` を付け替えない**: 将来の昇格でも `pipelineId` は生成時一度設定（`pipeline-id.ts`）で、書き換えは由来に嘘をつく。正直なモデルは execution 履歴層。土台のフィールド形が「付け替え前提」にならないようここで明記。
- **diff アクセスは `RuntimeStrategy` seam を再利用**（ADR `2026-06-10-findings-verification-seam` の `verifyFindingRefs` 前例）し導出を純粋・runtime 非依存に保つ。却下（domain 内で diff を読む）: B-5 / B-8 違反。
