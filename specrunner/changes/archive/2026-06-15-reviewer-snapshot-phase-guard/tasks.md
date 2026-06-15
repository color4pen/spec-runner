# Tasks: reviewer 工程を持たない pipeline では reviewer を job state に snapshot しない（INV-8 cleanup）

> 既存挙動完全一致が最重要。`standard` / `fast`（CONFORMANCE 保持）と `reviewers.length === 0` の挙動は現行と完全一致すること。変わるのは `design-only`（reviewer 工程なし）＋ reviewer 定義ありで `jobState.reviewers` を**設定しなくなる**点のみ。変更面は `src/core/command/pipeline-run.ts` ＋ `src/core/pipeline/reviewer-capability.ts`（新規純ヘルパ）＋ test に限定し、forbidden 3 surfaces（`src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts`）と `composeReviewerDescriptor` を踏まない（無改変）。

## T-01: reviewer-stage capability の純ヘルパを新モジュールに追加（domain・pure・composer 無改変）

- [x] 新規 `src/core/pipeline/reviewer-capability.ts` を作成する（fs / child_process / env / SDK を import しない純モジュール）。
- [x] `PipelineDescriptor` 型を `./types.js` から、`STEP_NAMES` を `../step/step-names.js` から import する（いずれも `compose-reviewers.ts` に前例のある既存許可 edge）。
- [x] 純述語を export する:
  ```ts
  /**
   * 解決した descriptor が「reviewer 工程（custom reviewer chain の挿入アンカー）」を持つかを判定する。
   *
   * composeReviewerDescriptor は custom reviewer chain を CONFORMANCE step の手前に挿入し、
   * CONFORMANCE が無ければ末尾 append（到達不能 zombie）とする。よって
   * 「custom reviewer が実際に走る」⟺「descriptor.steps が CONFORMANCE を持つ」。
   * 述語アンカーは composer と同じ CONFORMANCE であり、id / profile 名で分岐しない。
   */
  export function descriptorHasReviewerInsertionPoint(descriptor: PipelineDescriptor): boolean {
    return descriptor.steps.some(([name]) => name === STEP_NAMES.CONFORMANCE);
  }
  ```
- [x] **`composeReviewerDescriptor`（`src/core/pipeline/compose-reviewers.ts`）は touch しない**（byte 単位で無改変）。
- [x] 述語は `descriptor.id` の値を一切参照しない（profile 名でハードコード分岐しない）。

**Acceptance Criteria**:
- `descriptorHasReviewerInsertionPoint(STANDARD_DESCRIPTOR) === true`、`...(FAST_DESCRIPTOR) === true`、`...(DESIGN_ONLY_DESCRIPTOR) === false`（T-03 で test）。
- 述語が `descriptor.steps` の `CONFORMANCE` の有無に基づき、`code-review` 等の別概念で判定しない（T-03 で構造 test）。
- 述語が `descriptor.id` の値に依存しない（T-03 で test）。
- 新モジュールが fs/child_process/env/SDK を import せず、`core/pipeline → step`・`core/pipeline → types` 以外の新規逆 edge を作らない（DSM 不変）。
- `compose-reviewers.ts` が無改変（diff 0 行）。
- `bun run typecheck` が green。

## T-02: pipeline-run.ts の reviewer snapshot を guard で gate する

- [x] `src/core/command/pipeline-run.ts` の冒頭 import に追加する:
  ```ts
  import { descriptorHasReviewerInsertionPoint } from "../pipeline/reviewer-capability.js";
  ```
  （`core/command → core/pipeline` は既存 edge。同ファイルが `../pipeline/registry.js` / `../pipeline/runtime-capability-gate.js` を既に import）
- [x] `prepare()` 内の snapshot 条件（現 `pipeline-run.ts:107`）を合成条件に変える:
  ```ts
  // Snapshot reviewer definitions into job state only when the resolved descriptor
  // has a reviewer stage. design-only (no CONFORMANCE anchor) never reaches the reviewer
  // chain, so snapshotting there would leave a never-executed reviewer in state (INV-8).
  if (reviewers.length > 0 && descriptorHasReviewerInsertionPoint(descriptor)) {
    jobState.reviewers = reviewers;
  }
  ```
  - `descriptor` は同 `prepare()` 内 `:89`（`getPipelineDescriptor(pipelineId)`）で解決済みであり、snapshot 時点で in-scope。新たな解決呼び出しは追加しない。
  - 条件の評価順は `reviewers.length > 0` を先に置き、reviewer 定義が無いときは述語を評価せず short-circuit する（`reviewers.length === 0` の挙動は descriptor に依らず未設定）。
- [x] `reviewers` フィールドの schema（`src/state/schema.ts`）・`composeReviewerDescriptor`・transitions・reviewer activation は無改変。

**Acceptance Criteria**:
- `standard` / `fast`（CONFORMANCE 保持）＋ `reviewers.length > 0` で `jobState.reviewers` が設定される（現行と一致）（T-05 で test）。
- `design-only`（CONFORMANCE 無し）＋ `reviewers.length > 0` で `jobState.reviewers` が設定されない（T-05 で test）。
- `reviewers.length === 0` で descriptor に依らず未設定（T-05 で test）。
- `src/state/schema.ts` / `src/core/port/**` / `src/state/lifecycle.ts` / `compose-reviewers.ts` に変更が無い（diff）。
- `bun run typecheck` が green。

## T-03: 純述語の単体テスト（registry 3 本＋アンカー弁別＋id 非依存）

- [x] 新規テスト `tests/unit/core/pipeline/reviewer-capability.test.ts` を追加する（`tests/unit/core/pipeline/runtime-capability-gate.test.ts` と同階層）。
- [x] `descriptorHasReviewerInsertionPoint` を、`STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` / `DESIGN_ONLY_DESCRIPTOR`（`registry.js` から import）に対して評価し、`true / true / false` を固定する。
- [x] **アンカー弁別（CONFORMANCE であって code-review でない）**: 最小の合成 descriptor を 2 つ作る（`STANDARD_DESCRIPTOR` を spread し `steps` だけ差し替え）:
  - `steps` に `CONFORMANCE` を含むが `code-review` を含まない descriptor → 述語 `true`。
  - `steps` に `code-review` を含むが `CONFORMANCE` を含まない descriptor → 述語 `false`。
  これにより述語が CONFORMANCE アンカーに従い、`code-review` の有無では判定しないことを構造的に固定する。
- [x] **id 非依存**: `id: "design-only"` だが `steps` に `CONFORMANCE` を含む合成 descriptor → 述語 `true`（id で分岐しない証明）。`id: "standard"` だが `CONFORMANCE` を含まない合成 descriptor → 述語 `false`。
- [x] `STEP_NAMES.CONFORMANCE` / `STEP_NAMES.CODE_REVIEW` を `../../../../src/core/step/step-names.js` 等から参照し、文字列リテラルを直書きしない。

**Acceptance Criteria**:
- registry 3 本で `true / true / false`（test）。
- CONFORMANCE あり＋code-review 無し → `true`、code-review あり＋CONFORMANCE 無し → `false`（test／構造）。
- id を `design-only` にしても CONFORMANCE 保持なら `true`、`standard` にしても CONFORMANCE 無しなら `false`（test）。
- `bun run typecheck && bun run test` が green。

## T-04: alignment test（composer 実出力 ⟺ guard 述語、drift 検出、1 本）

- [x] テスト `tests/unit/core/pipeline/reviewer-capability.test.ts`（T-03 と同ファイルで可）に **alignment test を 1 本** 追加する。
- [x] `PIPELINE_REGISTRY`（`registry.js`）の各 descriptor `d` について:
  - fake reviewer snapshot を 1 つ作る（例 `{ name: "align-fake", maxIterations: 1, purpose: "p", criteria: "c", judgment: "j", freeText: "" }`、`ReviewerSnapshot` 型）。
  - `const composed = composeReviewerDescriptor(d, [fake]);`（composer の実出力）。
  - composed `steps` 名列で fake reviewer の index を取り、**その後ろに base descriptor 由来の step が 1 つ以上続くか** を `reachable` とする:
    ```ts
    const composedNames = composed.steps.map(([n]) => n);
    const fakeIdx = composedNames.indexOf("align-fake");
    const baseNames = new Set(d.steps.map(([n]) => n));
    const reachable = composedNames.slice(fakeIdx + 1).some((n) => baseNames.has(n));
    ```
  - `expect(reachable).toBe(descriptorHasReviewerInsertionPoint(d));` を assert する。
- [x] **アンカー（`conformanceIdx` 等）を test 内で再計算しない**。reachable は composer 実出力の配置（fake の後ろに base step が続くか）からのみ導く。CONFORMANCE token を観測側で参照しない（`X ⟺ X` トートロジー禁止）。
- [x] 期待結果としては `standard` / `fast` → `reachable === true`、`design-only` → `reachable === false` になり、いずれも guard 述語と一致する（明示 assert は registry ループで網羅）。

**Acceptance Criteria**:
- `PIPELINE_REGISTRY` の各 descriptor で「composer 実出力の reachable 判定 ⟺ `descriptorHasReviewerInsertionPoint(d)`」が一致する（test）。
- 観測がアンカー再計算ではなく composer 実出力に基づく（test 実装に `findIndex(CONFORMANCE)` 等のアンカー再計算が無い）。
- alignment test は 1 本（registry を網羅）。
- `bun run typecheck && bun run test` が green。

## T-05: call-site behavioral test（snapshot gating: design-only 未設定 / standard・fast 設定 / empty 未設定）

- [x] 新規テスト `tests/unit/core/command/pipeline-run-reviewer-snapshot.test.ts` を追加する（`pipeline-run-gate.test.ts` のハーネスに倣う）。
- [x] mock を設定する:
  - `vi.mock(".../src/core/reviewers/load.js", ...)` で `loadReviewerDefinitions` を制御する（テストごとに 1 件以上の `ReviewerDefinition`（`filename` を含む）か `[]` を返す）。
  - `vi.mock(".../src/core/reviewers/validate.js", ...)` で `validateReviewerDefinitions` を no-op にする（snapshot gating の検証に隔離。fake 定義が validation で落ちないようにする）。
- [x] fake runtime（`bootstrapJob` を `buildInitialJobState(...)` で返す spy、`canDeriveChangedFiles: () => true`）と `TestablePipelineRunCommand`（`prepare()` を公開する薄いサブクラス）を `pipeline-run-gate.test.ts` から踏襲する。`bootstrapJob` の返す初期 state は `reviewers` 未設定であること（`buildInitialJobState` は reviewers を param 経由でしか設定しない）を前提にする。
- [x] ケースを固定する（いずれも `prepare()` の戻り `PrepareResult.jobState.reviewers` を観測）:
  - **design-only ＋ reviewer 定義あり** → `request.pipeline = "design-only"`、load が 1 件以上を返す → `jobState.reviewers` が **undefined**（未設定）。
  - **standard ＋ reviewer 定義あり** → `request.pipeline` 未指定（= standard）、load が 1 件以上を返す → `jobState.reviewers` が設定され、件数・`name` が定義と一致。
  - **fast ＋ reviewer 定義あり** → `request.pipeline = "fast"`（`canDeriveChangedFiles: () => true` で `#693` gate を通過）、load が 1 件以上を返す → `jobState.reviewers` が設定される。
  - **reviewers.length === 0** → load が `[]` を返す → 任意 pipeline（例 standard と design-only）で `jobState.reviewers` が未設定。
- [x] `design-only` は `permissionScope` を持たないため gate は発火しない（`canDeriveChangedFiles` の値に依らず通過）ことを前提に、design-only ケースで `UnsupportedRuntimeCapabilityError` が起きないことを確認する。

**Acceptance Criteria**:
- design-only ＋ reviewer 定義ありで `jobState.reviewers` が未設定（test）。
- standard / fast ＋ reviewer 定義ありで `jobState.reviewers` が設定される（test、挙動不変）。
- `reviewers.length === 0` で未設定（test）。
- `bun run typecheck && bun run test` が green。

## T-06: 無改変・不変条件の検証（composer / transitions / activation / forbidden surface / FindingResolution）

- [x] `composeReviewerDescriptor`・transition tables（`STANDARD_TRANSITIONS` / `FAST_TRANSITIONS` / design-only transitions）・reviewer activation が無改変であり、既存テスト（compose-reviewers / transitions / activation / e2e）が無変更で green であることを確認する。
- [x] 本 request の diff（base...HEAD）に `src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` の変更が無いことを確認する（fast の conformance scope checkpoint を素通りする条件）。
- [x] `src/core/pipeline/compose-reviewers.ts` が無改変（diff 0 行）であることを確認する。
- [x] `FindingResolution`（`src/kernel/report-result.ts`）の union が `fixable | decision-needed` のまま、`VALID_RESOLUTIONS`（`src/core/port/report-result.ts`）が 2 値のままであることを既存 test で確認する（新 resolution 値を足さない）。

**Acceptance Criteria**:
- composer / transitions / activation の既存テストが無変更で green。
- diff に forbidden 3 surfaces ＋ `compose-reviewers.ts` の変更が無い。
- `FindingResolution` union が `fixable | decision-needed` のまま。

## T-07: 全体検証（既定挙動一致と arch 不変条件の最終確認）

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（既存テストは無変更、または additive 拡張のみで green）。
- [x] `bun run lint`（`--max-warnings 0`）が green（未使用引数は `^_` prefix で吸収）。
- [x] arch 不変条件 B-1〜B-11 ＋ DSM closure が green: 新モジュール `reviewer-capability.ts` は domain（`core/pipeline`）の純関数で、`core/pipeline → step` / `core/pipeline → types`（既存許可 edge）以外の逆 edge を作らない。`pipeline-run.ts`（`core/command → core/pipeline`）も既存 edge。
- [x] 既定挙動一致を最終確認する: `standard` / `fast`（reviewer 工程あり）と `reviewers.length === 0` の snapshot 挙動が現行と一致し、変わるのは `design-only` ＋ reviewer 定義ありのみ。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- `bun run lint` が green。
- arch 不変条件（B-1〜B-11 ＋ DSM closure）が green。
- 既定挙動一致（standard / fast / empty 不変、design-only のみ変化）が test で担保されている。
