# pipeline profile に権限スコープを宣言し、スコープ超過を diff から機械導出して既存 escalation に載せる

**Date**: 2026-06-14
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-13-decision-options-ledger.md`（decision-needed / decision-ledger 基盤）
- `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor 構造）
- `specrunner/adr/2026-06-10-judge-verdict-from-findings.md`（judge verdict 導出）

## Context

将来導入する制約付き経路（軽量 fast pipeline、fixup 再入場）に「責務 ＝ 権限の範囲」を宣言させ、実行がその範囲を越えたら黙って重い処理をやらずに escalation する機構が必要になった。

現状 escalation を駆動できるのは **agent 申告の finding だけ**。「この実行は経路の責務外のことをした」という **機械的に導出される** escalation 源が存在しない。プロジェクトの中心思想「判断は導出する、自己申告させない」をパイプライン境界の話に適用すると、以下の 2 点が要求される。

1. 権限の範囲は **profile の宣言データ** として持つ（プロンプトに心得として書かない）。
2. スコープ超過の機械的部分は **diff / changed-files から導出** する（agent の自己申告を信用しない）。

escalation の下位基盤は既に揃っていた。

- `deriveJudgeVerdict()`（`src/core/step/judge-verdict.ts`）が `decision-needed` finding を `escalation` verdict に落とす。
- step verdict `escalation` → transition table に該当行なし → `nextStep = "escalate"` → `transitionJob(state, "awaiting-resume")` のパスが存在する。
- `getOpenDecisionFindings` が `resumePoint.step` の最新 run findings から `decision-needed` finding を拾い、escalation コメントに描画する（`src/core/notify/issue-notifier.ts`）。
- decision-ledger（`src/core/decision/decision-ledger.ts`）が `computeFindingKey` をキーに open/closed 追跡し、`filterUndecidedFindings` で解決済みを verdict から除外する。

本変更はこの基盤の上に「第 2 の escalation 源（機械導出のスコープ超過）」を並置する。

## Decision

### D1: 権限スコープは PipelineDescriptor の宣言データとして持つ

`PipelineDescriptor`（`src/core/pipeline/types.ts`）に任意フィールド `permissionScope?: PermissionScope` を追加する。`PermissionScope` は:

- `checkpoint: string` — スコープ超過を評価する judge 系 step 名（finding → verdict 導出を持つ step）。評価点もデータで宣言する。
- `forbidden: ForbiddenSurface[]` — 機械軸の禁止面の列挙。各面は `id: string`（escalation の rationale に決定的に描画される安定識別子）と `paths: string[]`（base...HEAD の changed-file パスに対する glob 群）を持つ。

`permissionScope` absent → 無制限（現行挙動と完全一致）。`PIPELINE_REGISTRY` のどの profile（`standard` / `design-only`）も本変更では `permissionScope` を宣言しない。

**Rationale（why data not prompt）**: プロンプトへの心得記載は脆く強制力が無い。構造化フィールドで宣言し導出の歯で照合することで、機械軸は決定的・反証可能になる。評価点 `checkpoint` も同じ原則でデータ宣言する（`conformance` 等にハードコードしないことで fast pipeline 等 conformance を持たない profile でも再利用できる）。

### D2: トリガは 2 源、既存 2 機構を再利用し同一表現に畳む

- **機械境界** → D3 の純関数（歯）が breach を導出 → CLI が scope marker 付き `decision-needed` finding を **決定的に合成**（D4）。
- **意味境界** → agent が同じ `origin: "scope"` 付き `decision-needed` finding を **emit** → 既存 `parseFindings` が捕捉。

両者とも `decision-needed` という同一表現に畳み、既存の `deriveJudgeVerdict`・decision-ledger・`getOpenDecisionFindings`（issue-notifier）・`≥2 options` 契約を共有する。

**Rationale**: 「これはスコープ外か？」を agent に一括で問う案（統一案）は、導出可能な判断を agent に戻すため中心思想に逆行する。同一表現に畳むことで decision-ledger key・escalation 導出・issue 描画・options 契約の再実装が不要になる。並行機構を新設しない。

### D3: スコープ超過の機械導出は純関数として domain に置く

`src/core/pipeline/scope.ts`（新規）に純関数を置く:

- `deriveScopeBreach({ scope?, changedFiles, state })` — 超過有無と抵触面識別子（ソート済み）を返す。`scope` absent または `forbidden` 空 → `{ breached: false, surfaces: [] }`。各 `ForbiddenSurface` の glob を changed-files に照合し、マッチした面の `id` を集める。`state` は将来の状態軸のための予約フィールド（本土台では changed-files 軸のみ実装）。
- `synthesizeScopeFindings(breach, ctx)` — breach から決定的に `decision-needed` finding を合成する純関数。

両関数とも fs / child_process を import しない。`src/core/pipeline/` 配下に置くことで既存の B-5 arch test が自動でカバーし、child_process 禁止アサーションも同テストファイルに追加して固定する。

diff（changed-files）は executor が **既存の `RuntimeStrategy.listChangedFiles` seam** で取得して歯に渡す（`verifyFindingRefs` と同じパターン）。これにより歯は純粋・runtime 非依存に保たれる。

**Rationale**: B-5 / B-8 を守るため diff は domain 内で直接読まない。`listChangedFiles` は base...HEAD の changed-file 名を返す既存 seam で、新 seam を足さずに再利用できる。

### D4: 機械源 breach の合成は checkpoint judge step の finalize で行い、既存導出に一本道で乗せる

`finalizeStep`（`src/core/step/executor.ts`）の judge 分岐に合成点を追加する。`permissionScope` が宣言され、かつ現在の step が `checkpoint` のとき:

1. `listChangedFiles` seam で changed-files を取得。
2. `deriveScopeBreach` で breach 評価。
3. breach があれば `synthesizeScopeFindings` で finding を合成し、agent findings に **追記**。
4. 合成込み findings を `filterUndecidedFindings` → `deriveJudgeVerdict` に通す（合成 finding は `decision-needed` → verdict = `escalation`）。
5. 永続化する `toolResult.findings` も合成込みにする（`pushStepResult`）。

合成 finding の決定的構成（decision-ledger key の安定のため）:

- `origin: "scope"`、`resolution: "decision-needed"`、`severity: "high"`。
- `file` — worktree に必ず存在する決定的 anchor（当該 change の `request.md` 相対パス）。
- `title` — 固定文言。
- `rationale` — ソート済み抵触面 `id` とマッチした paths を列挙した決定的文字列。
- `options` — 決定的 3 択（`≥2` 契約を満たす）: 重い経路でやり直す / scope 宣言を見直す / 却下。

`computeFindingKey(checkpoint, finding)` のキーが決定的なので、人間が `/resume` で決めた scope breach は decision-ledger により自動で再 escalate しない。

`permissionScope` を executor に届ける経路: `buildPipeline`（`src/core/pipeline/run.ts`）が `descriptor.permissionScope` を `StepExecutor` のコンストラクタに渡す。`composeReviewerDescriptor` は `{ ...base }` spread で base の `permissionScope` を保持する。

### D5: Finding に scope 由来を表す discriminator を追加し、FindingResolution union は凍結する

`Finding`（`src/kernel/report-result.ts`）に任意フィールド `origin?: "scope"` を追加する。additive・後方互換で migration 不要。粗く保ち「scope 由来か否か」だけ持つ。細かい理由は既存 `rationale` に接地させる。

`FindingResolution` の union は `fixable | decision-needed` の 2 値のままとし、scope 由来を表す新 resolution 値は追加しない。scope 由来か否かは「出自」の別軸（`Finding.origin`）で表現する。

`origin` は: (1) `Finding` interface に optional 追加、(2) `parseFindings` が present かつ妥当なとき捕捉（不正値は黙って無視）、(3) agent-facing zod schema（`findingSchema` / `conformanceFindingSchema`）に optional として追加。

**Rationale（why marker not new resolution value）**: resolution は「どう解消するか」の軸（fixable=fix で解消 / decision-needed=人間が選択肢から選ぶ）。scope 由来か否かは「出自」の別軸。新 resolution 値は軸の取り違えに加え、decision-needed にぶら下がる decision-ledger key・escalation 導出・issue 描画・options 契約を全て再実装する ＝ 並行機構新設。marker なら全て既存のまま乗る。

### D6: 土台の escalation 出口は「人間へ」のみ。pipelineId を付け替えない

breach は `awaiting-resume` への遷移のみで終わる。超過理由（抵触面 / 意味的理由）は既存の escalation コメント・resume-context に載る。昇格（fast → standard）/ 再分類（fixup → 新 request）の出口は作らない。`pipelineId` は生成時に一度設定されたまま変更しない（由来に嘘をつかない。正直なモデルは将来の execution 履歴層）。

## Alternatives Considered

### A1: 権限範囲をプロンプトの心得として書く

- **Pros**: 実装コストゼロ
- **Cons**: 脆く強制力が無い。プロジェクトが明示的に避けている「ルールをプロンプトに足し続ける対症療法」の再発
- **Why not**: 却下

### A2: 全境界を agent finding に統一する

- **Pros**: 実装が単純
- **Cons**: 機械的に導出できる判断を agent に戻す。中心思想「判断は導出する、自己申告させない」に逆行
- **Why not**: 却下

### A3: 新 resolution 値 `scope-exceeded` を追加する

- **Pros**: 出自が resolution 型で自明になる
- **Cons**: resolution は解消形の軸であり scope 由来か否かは別軸。decision-needed にぶら下がる decision-ledger key・escalation 導出・issue 描画・options 契約を全て再実装する並行機構新設になる
- **Why not**: 却下

### A4: domain 内で diff を直接読む

- **Pros**: seam 経由より実装が直接的
- **Cons**: B-5 / B-8（`src/core/pipeline/` が fs / child_process を import しない不変条件）に違反する
- **Why not**: 却下

### A5: diff の行内容を返す新 seam を足す

- **Pros**: ファイル粒度より細かい禁止ルールを表現できる
- **Cons**: 土台の段階では changed-files 軸で十分。新 seam は最小依存原則に反する
- **Why not**: 却下。content 粒度は将来拡張として `deriveScopeBreach` の `state` 予約軸とともに検討

### A6: checkpoint を `conformance` step にハードコードする

- **Pros**: 設定不要
- **Cons**: fast pipeline 等 conformance を持たない profile で再利用不能。データ駆動原則に反する
- **Why not**: 却下

### A7: `origin` に derived（歯）vs agent の 2 軸目を今足す

- **Pros**: 機械源と意味源を区別できる
- **Cons**: 計測要求が出る前に増やす先行投資。粗く保つ（scope 由来か否かのみ）が原則
- **Why not**: 却下。計測要求が出てから追加する

### A8: 3 出口（人間へ / 昇格 / 再分類）を今やる

- **Pros**: 一括で完結する
- **Cons**: 昇格は FSM と pipelineId 正直モデルに触れ規模過大。「1 request = 1 収束ループ」と「既定挙動完全一致」を壊す
- **Why not**: 却下。昇格 / 再分類は別 request

## Consequences

### Positive

- 制約付き経路（fast pipeline 等）が `permissionScope` を宣言するだけで機械軸のスコープ超過 escalation を得られる。実装コストゼロ（declaration only）。
- agent の自己申告に依存しない escalation 源が加わる。「判断は導出する、自己申告させない」が境界の話にも適用される。
- 既存の decision-ledger key・escalation 導出・issue 描画・`≥2 options` 契約を全て再利用するため、並行機構の新設コストゼロ。
- `permissionScope` absent で既定挙動完全一致。既存テストが無変更で green。

### Negative / Known Debt

- managed runtime では `listChangedFiles` が常に `[]` を返すため、managed では機械軸 breach が不活性になる。本土台はスコープ宣言 profile を持たないため影響ゼロ。利用者（local 想定の fast pipeline）が別 request で必要なら managed 用 diff seam を検討する。
- 禁止面を changed-file パス glob で表現するため、同一ファイル内の「公開型変更」と「内部型変更」をファイル粒度で区別できない。content 粒度は将来拡張（`deriveScopeBreach` の `state` 予約軸）に委ねる。
- `checkpoint` が judge 系 step（finding → verdict 導出を持つ step）でないと合成 finding が routing されない制約がある。利用者 profile はこの制約下で checkpoint を選ぶ必要がある。build 時 guard は利用者 request で検討する。

## References

- Request: `specrunner/changes/scope-exceeded-escalation/request.md`
- Design: `specrunner/changes/scope-exceeded-escalation/design.md`
- Spec: `specrunner/changes/scope-exceeded-escalation/spec.md`
