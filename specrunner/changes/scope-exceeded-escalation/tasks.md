# Tasks: pipeline profile 権限スコープ宣言 + スコープ超過機械導出 escalation 土台

> 既定挙動完全一致が最重要。各タスクは additive・後方互換で、`permissionScope` 未宣言・`Finding.origin` absent では現行と完全一致すること。

## T-01: PermissionScope 宣言フィールドを PipelineDescriptor に追加（データ・既定 absent）

- [x] `src/core/pipeline/types.ts` に `ForbiddenSurface` 型を追加: `id: string`（抵触面の安定識別子）、`paths: readonly string[]`（base...HEAD の changed-file パスに対する glob 群）。
- [x] `src/core/pipeline/types.ts` に `PermissionScope` 型を追加: `checkpoint: string`（スコープを評価する step 名。judge 系 step であること）、`forbidden: readonly ForbiddenSurface[]`（機械軸の禁止面の列挙）。
- [x] `PipelineDescriptor`（`src/core/pipeline/types.ts:32`）に任意フィールド `permissionScope?: PermissionScope` を追加。JSDoc に「absent = 無制限 = 現行挙動」「checkpoint は finding から verdict を導出する judge 系 step」「path 粒度。content 粒度は将来拡張」を明記。
- [x] `src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` には `permissionScope` を **足さない**（未宣言のまま）。

**Acceptance Criteria**:
- `PipelineDescriptor` に任意の `permissionScope` フィールドが存在し、absent が無制限を意味することが型と JSDoc で表現されている。
- `PIPELINE_REGISTRY` のどの profile も `permissionScope` を宣言していない（unit test で `STANDARD_DESCRIPTOR.permissionScope` / `DESIGN_ONLY_DESCRIPTOR.permissionScope` が undefined であることを固定）。
- `bun run typecheck` が green。

## T-02: Finding に scope discriminator origin を追加（任意・absent=現行・migration なし）

- [x] `src/kernel/report-result.ts` の `Finding` interface に任意フィールド `origin?: "scope"` を追加。JSDoc に「absent = in-scope = 現行」「scope 由来か否かのみを粗く持つ。細かい理由は rationale に接地」を明記。
- [x] `src/core/port/report-result.ts` の `parseFindings` を additive に拡張: `origin` が文字列 `"scope"` のときのみ `finding.origin` を設定する（不正値は黙って無視、`missingFields` に加えない）。`origin` absent 時の挙動・戻り値は現行と完全一致させる。
- [x] `src/core/step/report-tool.ts` の共有 `findingSchema` と `conformanceFindingSchema` に `origin: optional(union([literal("scope")]))`（または同等の任意 literal）を追加。意味源 agent が emit 可能・codex strict 変換で reject されないようにする。tool description の文面は変更不要（marker は利用者 prompt 側で誘導するため、土台では schema 受理のみ）。
- [x] `FindingResolution`（`src/kernel/report-result.ts`）の union は `fixable` / `decision-needed` のまま **変更しない**。

**Acceptance Criteria**:
- `origin` absent の finding を `parseFindings` に通した結果が本 request 適用前と完全一致する（unit test、migration なし）。
- `origin: "scope"` を持つ妥当な decision-needed finding を `parseFindings` が捕捉し保持する（unit test）。
- 既存の `tests/adapter/codex/strict-schema.test.ts` が green（additive な `origin` 追加後も `toContain` 系アサーションが満たされることを確認）。
- `bun run typecheck` が green。

## T-03: スコープ超過の機械導出（歯）と合成を純関数として実装

- [x] `src/core/pipeline/scope.ts` を新規作成（fs / child_process を import しない純モジュール）。
- [x] `ScopeBreach` 型（`{ breached: boolean; surfaces: string[] }`）を定義。
- [x] `deriveScopeBreach(input)` を実装: 入力 `{ scope?: PermissionScope; changedFiles: readonly string[]; state: JobState }`。`scope` absent / `forbidden` 空 → `{ breached: false, surfaces: [] }`。各 `ForbiddenSurface.paths` glob を `changedFiles` に照合し、マッチした面の `id` を **ソート済み・重複排除** で集めて返す。`state` は将来の state 軸のための予約（本土台では未使用、入力契約は 3 要素を取る）。glob 照合は既存の軽量 matcher を再利用（custom reviewer の `paths` 照合と同等の手段）か、依存を増やさない最小の glob 実装を用いる。
- [x] `synthesizeScopeFindings(breach, ctx)` を実装（純関数）: breach から決定的に `Finding[]`（通常 1 件）を合成する。各 finding は `origin: "scope"`、`resolution: "decision-needed"`、`severity: "high"`、`file` = `ctx` 由来の決定的 anchor（worktree に必ず存在するパス、例: 当該 change の `request.md` 相対パス）、`title` = 固定文言、`rationale` = ソート済み抵触面 `id` と該当 paths を列挙した決定的文字列、`options` = 決定的 3 択（重い経路でやり直す / scope 宣言を見直す / 却下、各 `label` + `consequence`）。`ctx` は anchor 算出に必要な最小情報（slug など）のみを受ける。

**Acceptance Criteria**:
- `deriveScopeBreach`: scope absent → breached=false（unit test）。禁止面にマッチする changed-file → breached=true かつ抵触面 id がソート済みで返る（unit test）。マッチしない → breached=false（unit test）。
- `synthesizeScopeFindings`: 同一入力で `file` / `title` / `rationale` / `options`（≥2）が完全一致する決定性を持つ（unit test）。合成 finding の `resolution` は `decision-needed`、`origin` は `"scope"`（unit test）。
- `bun run typecheck` が green。

## T-04: checkpoint judge step の finalize に合成点を配線（executor + buildPipeline）

- [x] `StepExecutor`（`src/core/step/executor.ts`）のコンストラクタに任意末尾引数 `permissionScope?: PermissionScope` を追加し private フィールドに保持（未指定 = undefined = 不活性）。既存の全コンストラクタ呼び出し・テストは引数追加で壊れないこと。
- [x] `src/core/pipeline/run.ts` の `buildPipeline` で `new StepExecutor(...)` に `descriptor.permissionScope` を渡す。`composeReviewerDescriptor` が `{ ...base }` で base を spread することを利用し、base profile の `permissionScope` が合成 descriptor 経由でも届くことを確認（必要なら compose 側で明示 spread を確認）。
- [x] `finalizeStep`（`src/core/step/executor.ts:605`）の judge 分岐に合成点を追加: `this.permissionScope` が定義され、かつ `step.name === this.permissionScope.checkpoint` で `deps.runtimeStrategy` がある場合のみ:
  1. `deps.runtimeStrategy.listChangedFiles(baseBranch, cwd, branch)` で changed-files を取得（`verifyFindingRefs` と同様の seam 利用、`baseBranch = deps.request.baseBranch ?? "main"`）。
  2. `deriveScopeBreach({ scope, changedFiles, state })` を評価。
  3. breach があれば `synthesizeScopeFindings` で finding を合成し、当該 step の agent findings に **追記** した findings を「この step の findings」とする。
  4. 合成込み findings を既存の `filterUndecidedFindings` → `deriveJudgeVerdict` / `deriveConformanceVerdict` に通す（合成 finding は decision-needed なので verdict は `escalation`）。`verifyFindingRefs` も合成込み findings に対して一貫して動くようにする。
  5. 永続化される `toolResult.findings`（`pushStepResult` に渡す toolResult）を合成込みにする。`permissionScope` 不活性時 / breach 無し時は toolResult を一切変更しない（byte 一致）。
- [x] 配線は judge / conformance 分岐の両方で機能すること（checkpoint がどちらの report tool を持つ step でも合成 finding が verdict に反映される）。

**Acceptance Criteria**:
- `permissionScope.checkpoint` step で禁止面に抵触する changed-files があるとき、verdict が `escalation` になり job が `awaiting-resume` に遷移し、`resumePoint.step` が checkpoint になる（test）。
- 抵触しないとき、verdict・遷移・永続 `toolResult.findings` が scope 機構が無い場合と完全一致する（test）。
- `permissionScope` 未宣言のとき、`listChangedFiles` も `deriveScopeBreach` も呼ばれず、既存の executor 挙動と完全一致する（test。既存 executor テストが無変更で green）。
- `bun run typecheck` が green。

## T-05: 2 源を同一表現に畳む配線の検証（合成 / emit ともに既存導出を通る）

- [x] 機械源: T-04 で合成された scope finding が `deriveJudgeVerdict` で `escalation` に落ち、`awaiting-resume` に遷移し、`getOpenDecisionFindings` で拾えることを test で固定。
- [x] 意味源: agent が `origin: "scope"` の decision-needed finding を emit したケース（`parseFindings` 経由）も同じ judge 経路で `escalation` に落ち、`getOpenDecisionFindings` で拾えることを test で固定。
- [x] 両源の scope finding が decision-ledger に乗ること（`computeFindingKey(checkpoint, finding)` が安定 key を生む）を test で固定。

**Acceptance Criteria**:
- 機械源 breach から合成された scope marker 付き decision-needed が options 込みで生成され、既存 `decision-needed → escalation` 導出で `awaiting-resume` に落ちる（test）。
- 意味源 scope finding も同経路で `awaiting-resume` に落ちる（test）。
- いずれの scope finding も `computeFindingKey` で安定 key を持つ（test）。

## T-06: 解決済み scope breach の再 escalate 抑止を検証

- [x] ある scope finding と一致する key の `DecisionRecord`（`step = checkpoint`）が state に存在するとき、同一の breach から再び同じ scope finding が合成（または emit）されても `filterUndecidedFindings` で除外され、verdict が `escalation` にならないことを test で固定。
- [x] `computeFindingKey` / decision-ledger は **変更しない**（合成 finding の決定性で対応）。

**Acceptance Criteria**:
- 解決済み scope breach は再 escalate しない（test）。
- 既存 decision-ledger テストが無変更で green。

## T-07: escalation コメント描画の検証（既存 issue-notifier 再利用）

- [x] `buildEscalationComment`（`src/core/notify/issue-notifier.ts`）を **変更せず**、合成 scope finding（≥2 options）が「Decisions needed」セクションに title・rationale（抵触面）・options 込みで描画されることを test で固定。
- [x] `resumePoint.step = checkpoint` のとき `getOpenDecisionFindings` が合成 scope finding を返すことを test で固定。

**Acceptance Criteria**:
- 宣言スコープの機械境界を越えた job の escalation コメントに超過理由（抵触面）が描画される（test）。
- issue-notifier 本体に新機構を足していない（描画は既存経路の再利用）。

## T-08: FindingResolution union の型固定（新 resolution 値を足していないこと）

- [x] `FindingResolution` の妥当値集合（`src/core/port/report-result.ts` の `VALID_RESOLUTIONS`）が `fixable` / `decision-needed` の 2 値だけであることを test で固定。
- [x] 可能なら型レベルでも固定（exhaustive な型アサーション、または union メンバの本数チェック）。

**Acceptance Criteria**:
- `FindingResolution` の union が `fixable` / `decision-needed` のままであることが test で固定される（新 resolution 値を追加していない）。

## T-09: arch 不変条件で歯の純粋性を固定

- [x] `tests/unit/architecture/core-invariants.test.ts` に、`src/core/pipeline/`（`scope.ts` を含む）が `child_process` / `node:child_process` / `execSync` / `spawnSync` を参照しないことを検証するアサーションを追加（既存 B-5 の fs call-site 検証を補完）。
- [x] `scope.ts` が domain の純関数として `src/core/pipeline/` 配下に置かれ、既存 B-5（fs call-site ゼロ）でカバーされることを確認。
- [x] 新規 import edge が DSM closure / B-1〜B-10 を破らないことを確認（`scope.ts` は kernel/state/shared-kernel と同層 domain のみに依存）。

**Acceptance Criteria**:
- `(scope, changed-files, state)` を取る純関数が fs / child_process を import しないことが arch test で固定され green（B-5 + child_process アサーション）。
- B-1〜B-10 ＋ DSM closure が green。

## T-10: 全体検証（既定挙動完全一致の最終確認）

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（既存テストは無変更、または additive 拡張のみで green）。
- [x] `bun run lint`（`--max-warnings 0`）が green（未使用引数は `^_` prefix で吸収するか、入力オブジェクト形で回避）。
- [x] `PIPELINE_REGISTRY` のどの profile も `permissionScope` 未宣言のため、スコープ超過が一切発火し得ず、既存テストが無変更で green であることを確認。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- arch 不変条件（B-1〜B-10 ＋ DSM closure）が green。
- 既定挙動完全一致（scope 未宣言・origin absent で現行と一致）が test で担保されている。
