# Spec: 軽量 fast pipeline profile を追加する — permissionScope を宣言する最初の利用者

## Requirements

### Requirement: registry は `fast` profile を提供し、その steps から深さ・重複レビュー step を除く

`PIPELINE_REGISTRY` SHALL register a `fast` pipeline descriptor whose ordered steps include `request-review`, `design`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`, `conformance`, and `pr-create`, and whose steps MUST NOT include `spec-review`, `spec-fixer`, `test-case-gen`, or `adr-gen`.

`fast` は標準より工程を削った経路だが、削るのは「深さ・重複レビュー」（spec-review / spec-fixer / test-case-gen / adr-gen）であって安全網ではない。verification ループ・code-review ループの fixer（build-fixer / code-fixer）と conformance は残す。`fast` 追加後も `standard` / `design-only` の descriptor 内容・挙動は不変。

#### Scenario: fast が registry に登録され、削った step が steps に無い

**Given** 本 request 適用後の `PIPELINE_REGISTRY`
**When** `getPipelineDescriptor("fast")` で descriptor を解決し、その steps の step 名を列挙する
**Then** descriptor が解決され、step 名集合は `spec-review` / `spec-fixer` / `test-case-gen` / `adr-gen` を含まず、`request-review` / `design` / `implementer` / `verification` / `build-fixer` / `code-review` / `code-fixer` / `conformance` / `pr-create` を含む

#### Scenario: fast の startStep は request-review

**Given** `fast` descriptor
**When** `startStep` を読む
**Then** `request-review` である

### Requirement: fast は design 後に spec-review を介さず implementer へ進み、conformance approved で pr-create へ向かう

The `fast` pipeline SHALL route `design` success directly to `implementer` (bypassing spec-review and test-case-gen), and SHALL route a `conformance` approved verdict toward `pr-create` rather than `adr-gen`, while preserving the post-fixer reverification chokepoint.

fast は spec-review / spec-fixer / test-case-gen / adr-gen の遷移行を持たない。conformance / verification の reverification ガード（最後のコード変更が verification に覆われてから前進する）は標準と同じく保持する。

#### Scenario: design 完了は implementer へ直結する

**Given** `fast` の遷移テーブル
**When** `design` が `success` を返したときの遷移先を引く
**Then** 遷移先は `implementer` である（`spec-review` ではない）

#### Scenario: conformance approved は pr-create へ向かう

**Given** `fast` の遷移テーブルと、最後のコード変更が verification に覆われている state
**When** `conformance` が `approved` を返したときの遷移先を引く
**Then** 遷移先は `pr-create` である（`adr-gen` ではない）

#### Scenario: code-review の clean approved は conformance へ進む

**Given** `fast` の遷移テーブル（code-review ループは `buildReviewerChainTransitions(["code-review"])` で生成）
**When** `code-review` が fixable finding 無しで `approved` を返す
**Then** 遷移先は `conformance` である

### Requirement: fast は permissionScope を conformance checkpoint で 3 surfaces 宣言する

The `fast` descriptor SHALL declare a `permissionScope` whose `checkpoint` is `conformance` (a judge step), and whose `forbidden` enumerates exactly three surfaces — `public-types`, `persisted-format`, and `state-transitions` — each expressed as path globs.

checkpoint=`conformance` は fixer 後の最終 diff が出揃う最後の judge step。3 surfaces は公開型境界（`src/core/port/**`）・永続形式（`src/state/schema.ts`）・state-transition 表（`src/state/lifecycle.ts`）を glob denylist で表す。新規トップレベル module surface・magnitude は含めない。

#### Scenario: checkpoint は conformance（judge step）

**Given** `fast` descriptor の `permissionScope`
**When** `checkpoint` を読む
**Then** `"conformance"` であり、その step は judge/conformance step である

#### Scenario: forbidden は 3 surfaces を glob で表す

**Given** `fast` descriptor の `permissionScope.forbidden`
**When** surface の `id` 集合と各 `paths` を読む
**Then** `id` 集合は `public-types` / `persisted-format` / `state-transitions` のちょうど 3 つで、`public-types` は `src/core/port/` 配下のパスにマッチする glob を、`persisted-format` は `src/state/schema.ts` を、`state-transitions` は `src/state/lifecycle.ts` を表す

### Requirement: 導出可能 runtime では conformance で 3 surfaces を機械評価し、超過を escalation する

When the runtime can derive changed files (`canDeriveChangedFiles()===true`) and a job runs the `fast` pipeline, the system SHALL evaluate base...HEAD changed files against the three forbidden surfaces at the `conformance` checkpoint, MUST synthesize a `decision-needed` finding (`origin: "scope"`) and drive the verdict to `escalation` when any surface is breached, and MUST leave the verdict unaffected by scope when no surface is breached.

これは #689 の checkpoint 検出を `fast` の `permissionScope` で初めて起動するものであり、`fast` 固有の評価ロジックではない（executor が checkpoint step で `computeExtraScopeFindings` を呼ぶ既存経路に乗る）。

#### Scenario: forbidden surface に触れた変更は conformance で escalation になる

**Given** `canDeriveChangedFiles()===true` の runtime と、`src/core/port/` 配下のファイルを変更ファイルに含む state、`fast` の `permissionScope`
**When** `conformance` checkpoint step を実行する
**Then** `origin: "scope"`・`resolution: "decision-needed"` の scope finding が合成され、verdict が `escalation` になる

#### Scenario: forbidden に触れない変更は scope による影響を受けない

**Given** `canDeriveChangedFiles()===true` の runtime と、3 surfaces のいずれにもマッチしない変更ファイルのみを持つ state、`fast` の `permissionScope`
**When** `conformance` checkpoint step を実行する
**Then** scope finding は合成されず、verdict は scope によって変化しない

### Requirement: fast は導出不能 runtime を着手前 gate で reject する（gate を継承する）

When the `fast` pipeline is selected on a runtime that cannot derive changed files (`canDeriveChangedFiles()===false`), the system SHALL reject the run before `bootstrapJob` via the existing capability gate, and no job state MUST be created. The rejection MUST follow from `fast` declaring a `permissionScope`, NOT from any `fast`-specific branch.

着手前 reject は #693 の `assertRuntimeSupportsScope` が `descriptor.permissionScope !== undefined` から導出する。`fast` は scope を宣言することで自動的に gate を継承する。

#### Scenario: managed fake で fast を選ぶと着手前に reject し state を作らない

**Given** `request.pipeline = "fast"` と、`canDeriveChangedFiles()===false` を返す runtime（managed fake）
**When** run の準備（`bootstrapJob` の前）が進む
**Then** `UnsupportedRuntimeCapabilityError` が throw され、`bootstrapJob` は呼ばれず job state は一切作られない

#### Scenario: gate 判定は profile 名でなく permissionScope の有無に依る

**Given** `fast` descriptor（`permissionScope` を宣言）と `canDeriveChangedFiles()===false` の runtime
**When** capability gate を評価する
**Then** gate は `permissionScope !== undefined` を根拠に reject し、`pipelineId === "fast"` のような profile 名ハードコード分岐には依らない

### Requirement: 既存 profile・既定経路・finding resolution 体系は不変

Adding the `fast` profile SHALL NOT change the `standard` or `design-only` descriptors, the default path (`pipeline` 未指定 → `standard`), reviewer activation, or the `FindingResolution` union, which MUST remain exactly `fixable | decision-needed`.

`fast` 追加は additive で、既存挙動を一切変えない。`standard` / `design-only` は無改変、`pipeline` 未指定なら従来どおり `standard` に解決し、新しい finding resolution 値は追加しない。

#### Scenario: pipeline 未指定は standard に解決する

**Given** `pipeline` を指定しない request（既存挙動）
**When** job を生成する
**Then** pipelineId は `standard` に解決され、`standard` の挙動・遷移・reviewer activation が現行と完全一致する

#### Scenario: FindingResolution は 2 値のまま

**Given** finding の resolution 妥当値集合
**When** 妥当値を列挙する
**Then** `fixable` と `decision-needed` の 2 つだけである（新 resolution 値なし）
