# Tasks: 軽量 fast pipeline profile を追加する — permissionScope を宣言する最初の利用者

> 本 request は **additive**。`standard` / `design-only` の descriptor 内容・挙動、`pipeline` 未指定の既定経路、reviewer activation、`FindingResolution` union は完全に不変。実装は registry / pipeline-ids / 遷移テーブルへの追加と、それを起動するテストに閉じる。既存 step（design / implementer / verification / code-review / conformance 等）の prompt・振る舞いは変更しない。`fast` 固有の分岐（`pipelineId === "fast"` 等）を src に一切作らない（gate は #693 から継承）。

## T-01: PIPELINE_IDS に `fast` を追加

- [ ] `src/kernel/pipeline-ids.ts` の `PIPELINE_IDS` に `FAST: "fast"` を追加する（`STANDARD` / `DESIGN_ONLY` と同列）。`PipelineId` union は `typeof PIPELINE_IDS[keyof typeof PIPELINE_IDS]` で自動更新されるため追加編集不要。
- [ ] `STANDARD_PIPELINE_ID` 等の既存 export は無改変。

**Acceptance Criteria**:
- `PIPELINE_IDS.FAST === "fast"`。
- `PipelineId` 型が `"fast"` を含む（型レベルで `fast` を代入可能）。
- `bun run typecheck` green。

## T-02: `FAST_TRANSITIONS` を types.ts に追加（標準を範に、削った step 行を除去）

- [ ] `src/core/pipeline/types.ts` に `export const FAST_TRANSITIONS: Transition[]` を `STANDARD_TRANSITIONS` の隣に定義する（既存 import `STEP_NAMES` / `buildReviewerChainTransitions` / `conformanceApprovedLatest` / `codeChangedSinceLastVerification` を再利用、新規 import なし）。
- [ ] 遷移行は design.md D2 のテーブルどおり構成する:
  - request-review gate: `approve→design` / `needs-discussion→escalate` / `reject→escalate` / `error→escalate`。
  - `design success→implementer`（spec-review / test-case-gen を経由しない） / `design error→escalate`。
  - `implementer success→verification` / `implementer error→escalate`。
  - verification loop: `passed→pr-create (when conformanceApprovedLatest)`（無条件 `passed→code-review` の**前**に置く） / `passed→code-review` / `failed→build-fixer` / `escalation→escalate`。`build-fixer success→verification` / `build-fixer error→escalate`。
  - code-review loop: `...buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW])` を展開（標準と同一。clean approved は chain 末尾なので conformance へ）。
  - conformance: `approved→verification (when codeChangedSinceLastVerification)`（無条件 `approved→pr-create` の**前**に置く） / `approved→pr-create` / `needs-fix:implementer→implementer` / `needs-fix:code-fixer→code-fixer` / `needs-fix→implementer`（legacy catch-all）。**`needs-fix:spec-fixer` の行は作らない**（不一致 → escalate が意図、design.md D2）。
  - pr-create: `success→end` / `error→escalate`。
- [ ] spec-review / spec-fixer / test-case-gen / adr-gen に関する遷移行は**一切含めない**。

**Acceptance Criteria**:
- `FAST_TRANSITIONS` に `design→spec-review` 行が無く、`design success→implementer` 行が在る（test）。
- `conformance approved→pr-create` 行が在り、`conformance approved→adr-gen` 行・`adr-gen` 始点の行・`spec-review` / `spec-fixer` / `test-case-gen` 始点の行が無い（test）。
- `conformance needs-fix:implementer→implementer` / `needs-fix:code-fixer→code-fixer` / `needs-fix→implementer` 行が在り、`needs-fix:spec-fixer` 始点の行が無い（test）。
- reverification ガード 2 本（`conformanceApprovedLatest` 付き `passed→pr-create`、`codeChangedSinceLastVerification` 付き `approved→verification`）が在り、いずれも対応する無条件行の前に位置する（test / 順序確認）。
- `bun run typecheck` green。

## T-03: `FAST_DESCRIPTOR` を registry に追加し `PIPELINE_REGISTRY` に登録

- [ ] `src/core/pipeline/registry.ts` に `export const FAST_DESCRIPTOR: PipelineDescriptor` を定義する（既存 Step import を再利用、新規 Step なし）。
  - `id: PIPELINE_IDS.FAST`。
  - `steps`: design.md D1 の 9 entry を順序どおり — `[REQUEST_REVIEW, RequestReviewStep]`, `[DESIGN, DesignStep]`, `[IMPLEMENTER, ImplementerStep]`, `[VERIFICATION, VerificationStep]`, `[BUILD_FIXER, BuildFixerStep]`, `[CODE_REVIEW, CodeReviewStep]`, `[CODE_FIXER, CodeFixerStep]`, `[CONFORMANCE, ConformanceStep]`, `[PR_CREATE, PrCreateStep]`。
  - `transitions: FAST_TRANSITIONS`（types.js から import）。
  - `startStep: STEP_NAMES.REQUEST_REVIEW`。
  - `loopName: STEP_NAMES.CODE_REVIEW`、`loopNames: [VERIFICATION, CODE_REVIEW, CONFORMANCE]`、`summaryStep: STEP_NAMES.CODE_REVIEW`（design.md D7、cosmetic。`loopName ∈ loopNames`・`summaryStep ∈ steps` を満たすこと）。
  - `loopFixerPairs: { [CODE_REVIEW]: CODE_FIXER, [VERIFICATION]: BUILD_FIXER }`（spec-review→spec-fixer は除外）。
  - `roles`: design.md D1/D6 の表 — request-review: gate/spec, design: creator/spec, implementer: creator/impl, verification: gate/impl, build-fixer: fixer/impl, code-review: reviewer/impl, code-fixer: fixer/impl, conformance: gate/impl, pr-create: gate/impl。
  - `maxIterations` は**設定しない**（config から解決、standard と同じ）。
  - `permissionScope`: design.md D3 — `checkpoint: STEP_NAMES.CONFORMANCE`、`forbidden: [ { id: "public-types", paths: ["src/core/port/**"] }, { id: "persisted-format", paths: ["src/state/schema.ts"] }, { id: "state-transitions", paths: ["src/state/lifecycle.ts"] } ]`。
- [ ] `PIPELINE_REGISTRY` に `[PIPELINE_IDS.FAST]: FAST_DESCRIPTOR` を追加する。`STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` の定義・登録は無改変。
- [ ] `getPipelineDescriptor` は無改変（未知 id エラーメッセージは `Object.keys` 由来で自動的に `fast` を含むようになる）。

**Acceptance Criteria**:
- `getPipelineDescriptor("fast")` が `FAST_DESCRIPTOR`（id=`fast`）を返す（test）。
- `FAST_DESCRIPTOR.steps` の step 名集合が design.md D1 の 9 step と一致し、`spec-review` / `spec-fixer` / `test-case-gen` / `adr-gen` を含まない（test）。
- `FAST_DESCRIPTOR.permissionScope.checkpoint === "conformance"`、`forbidden` が `public-types` / `persisted-format` / `state-transitions` の 3 surface を持つ（test）。
- `STANDARD_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR` は無改変（diff / 既存 test green）。
- `bun run typecheck` green。

## T-04: fast descriptor の構造テスト（steps / checkpoint / surfaces / slim design）

- [ ] 新規テスト（例 `tests/unit/core/pipeline/fast-descriptor.test.ts`）を追加する。
- [ ] **steps**: `FAST_DESCRIPTOR.steps` の step 名集合が `spec-review` / `spec-fixer` / `test-case-gen` / `adr-gen` を含まず、D1 の 9 step を含むことを固定する。`startStep === "request-review"` を固定する。
- [ ] **checkpoint = judge step**: `FAST_DESCRIPTOR.permissionScope.checkpoint === "conformance"` を固定し、その step が judge/conformance step であること（`conformance` step の `reportTool` が `CONFORMANCE_REPORT_TOOL` であること、または steps に conformance が在り role が gate/impl であること）を固定する。
- [ ] **3 surfaces（glob）**: `permissionScope.forbidden` の `id` 集合が `["public-types", "persisted-format", "state-transitions"]`（順不同）であり、`matchGlob`（または `deriveScopeBreach`）で:
  - `public-types` の glob が `src/core/port/runtime-strategy.ts` 等 `src/core/port/` 配下にマッチし、`src/core/pipeline/types.ts` 等の配下外にはマッチしない。
  - `persisted-format` の glob が `src/state/schema.ts` にマッチし `src/state/pipeline-id.ts` にはマッチしない。
  - `state-transitions` の glob が `src/state/lifecycle.ts` にマッチする。
- [ ] **slim design（構造）**: fast steps に `spec-review` が無い（独立 spec-review 省略）。fast steps に `test-case-gen` が無く、`implementer`（impl-phase creator）が在る（test-case-gen の implementer 統合を構造で固定）。fast steps に `adr-gen` が無い。

**Acceptance Criteria**:
- 上記 steps / checkpoint / surfaces / slim 構造の各 assertion が green（test）。
- `bun run typecheck && bun run test` green。

## T-05: conformance checkpoint での 3 surfaces 評価（導出可能 runtime、executor 駆動）

- [ ] 新規テスト（例 `tests/unit/core/step/fast-scope-checkpoint.test.ts`、または `fast-descriptor.test.ts` 内）を追加する。`scope-escalation.test.ts` の executor 駆動パターン（`StepExecutor` に `FAST_DESCRIPTOR.permissionScope` を渡し、`ConformanceStep`（checkpoint=conformance）を `canDeriveChangedFiles()===true` の runtime fake で実行）に倣う。
- [ ] **breach**: `listChangedFiles` が 3 surfaces のいずれか（例 `src/core/port/runtime-strategy.ts`）を返すとき、conformance 実行後の toolResult に `origin: "scope"`・`resolution: "decision-needed"` の scope finding が 1 件合成され、verdict が `escalation` になることを固定する。
- [ ] **no breach**: `listChangedFiles` が 3 surfaces のいずれにもマッチしないパス（例 `src/core/pipeline/types.ts`）のみを返すとき、scope finding が合成されず verdict が scope によって変化しない（approved）ことを固定する。
- [ ] checkpoint が `conformance` であることに依存させる: 非 checkpoint step（例 code-review）を同 `permissionScope` で実行しても scope 合成が走らない（`listChangedFiles` 未呼び出し）ことを 1 ケース固定する（checkpoint の単一性の確認）。

**Acceptance Criteria**:
- 導出可能 runtime で breach → escalation ＋ scope finding、no breach → 影響なし（test）。
- checkpoint=conformance 以外の step では scope 合成が走らない（test）。
- `bun run typecheck && bun run test` green。

## T-06: gate 継承の固定（着手前 reject・bootstrapJob 未呼び出し・profile 名非依存）

- [ ] **純関数レベル**: `assertRuntimeSupportsScope(FAST_DESCRIPTOR, { canDeriveChangedFiles: () => false })` が `UnsupportedRuntimeCapabilityError` を throw し、`{ canDeriveChangedFiles: () => true }` および predicate 未実装（absent）では throw しないことを固定する（`runtime-capability-gate.test.ts` に追記、または新規）。
- [ ] **call-site レベル**: `pipeline-run-gate.test.ts` のパターンに倣い、`request.pipeline = "fast"`（fixture ではなく production registry の `fast`）＋ `canDeriveChangedFiles: () => false`・`bootstrapJob` を spy にした runtime で `PipelineRunCommand.prepare()`（または `execute()`）が `UnsupportedRuntimeCapabilityError` で reject し、**`bootstrapJob` spy が未呼び出し**（job state 未作成）であることを固定する。
- [ ] **profile 名非依存**: gate が `permissionScope` の有無から発火し `pipelineId === "fast"` のような分岐に依らないことを、`fast` 以外の id を持つ scope 宣言 fixture でも一様に throw する既存テスト（または本テストで複数 id を用意）で確認する。`src/` に `fast` 固有分岐を追加しないことを diff で確認する。

**Acceptance Criteria**:
- `assertRuntimeSupportsScope(FAST_DESCRIPTOR, false-fake)` → throw、`true` / absent → 通過（test）。
- `request.pipeline = "fast"` ＋ 導出不能 runtime で着手前に reject し `bootstrapJob` が呼ばれない（test）。
- `src/` に `pipelineId === "fast"` 等の profile 名分岐が無い（diff / 構造）。
- `bun run typecheck && bun run test` green。

## T-07: 既存 registry 不変テストの更新（inert 前提の flip）

- [ ] `tests/unit/core/pipeline/registry-invariants.test.ts` の T-06-3 を更新する（design.md D8）:
  - 「`PIPELINE_REGISTRY` がちょうど 2 本」を、`standard` / `design-only` / `fast` の **3 者を含む**（3 本）assertion に変更する。
  - 「`permissionScope` 宣言 profile が 0 件」を、**`fast` がちょうど 1 件 `permissionScope` を宣言し、`standard` / `design-only` は宣言しない**ことの assertion に変更する。
  - describe / docstring の「2 本のみ・scope 宣言 0 件（inert）」の文言を、`fast` が機構を起動した現状に合わせて更新する。
- [ ] T-06 内の他のケース（design-only 到達性、未知 id エラー、standard.permissionScope===undefined 等）は無改変で green であることを確認する。
- [ ] **更新してはならない**ものを確認する: `scope-escalation.test.ts` の T-01（STANDARD/DESIGN_ONLY が permissionScope 無し）・T-08（FindingResolution union）、`pipeline-run-gate.test.ts`（standard/design-only の存在チェックのみ）は無変更で green。

**Acceptance Criteria**:
- 更新後の `registry-invariants.test.ts` が green（3 本・`fast` のみ scope 宣言）。
- `scope-escalation.test.ts` / `pipeline-run-gate.test.ts` は無変更で green。

## T-08: 全体検証（既存挙動不変 ＋ arch 不変条件）

- [ ] `bun run typecheck` green。
- [ ] `bun run test` green（既存テストは T-07 の更新を除き無変更で green。`standard` / `design-only` / `pipeline` 未指定の既定経路・reviewer activation・`FindingResolution` union の不変を既存テストで確認）。
- [ ] `bun run lint`（`--max-warnings 0`）green（未使用引数は `^_` prefix で吸収）。
- [ ] arch 不変条件 B-1〜B-11 ＋ DSM closure が green: `FAST_DESCRIPTOR`（registry.ts、domain）・`FAST_TRANSITIONS`（types.ts、domain）の追加は既存の許可 edge（registry → step / types / kernel、types → reviewer-chain / reverification / step-names）にのみ乗り、新規逆 edge を作らない。`fast` 固有分岐を src に追加しない。
- [ ] `FindingResolution` union が `fixable | decision-needed` のままであることを既存 test（`VALID_RESOLUTIONS` 検証）で確認する（新 resolution 値なし）。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` green。
- arch 不変条件（B-1〜B-11 ＋ DSM closure）green。
- `standard` / `design-only` / 既定経路 / reviewer activation / `FindingResolution` union が無変更（既存テスト green、T-07 の意図的更新を除く）。
