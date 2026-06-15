# Spec: reviewer 工程を持たない pipeline では reviewer を job state に snapshot しない（INV-8 cleanup）

## Requirements

### Requirement: reviewer 工程を持たない descriptor では reviewer を snapshot しない

When the resolved pipeline descriptor does NOT have a reviewer stage (no reviewer chain insertion point), the system SHALL NOT set `jobState.reviewers`, even if custom reviewer definitions exist and `reviewers.length > 0`.

job 開始時の snapshot（`pipeline-run.ts` の `prepare()`）は、`reviewers.length > 0` だけでなく「解決した descriptor が reviewer 工程を持つ」ことを満たすときにのみ `jobState.reviewers` を設定する。reviewer 工程を持たない `design-only` では、reviewer 定義が在っても snapshot を設定しない。これにより「実行されない reviewer が state に残る」記録上の不整合（INV-8）を解消する。

#### Scenario: design-only ＋ reviewer 定義ありでは reviewers が未設定

**Given** `request.pipeline` が `"design-only"` で、リポジトリに custom reviewer 定義が存在する（`reviewers.length > 0`）
**When** job state を bootstrap して reviewer を snapshot する段に進む
**Then** `jobState.reviewers` は設定されない（undefined のまま）

### Requirement: reviewer 工程を持つ descriptor は従来どおり reviewer を snapshot する

When the resolved descriptor HAS a reviewer stage and `reviewers.length > 0`, the system SHALL set `jobState.reviewers` exactly as before（挙動不変）.

`standard` / `fast` は CONFORMANCE（reviewer 挿入アンカー）を持つため、reviewer 定義が在れば従来どおり snapshot する。本 guard は「reviewer 工程を持つ descriptor」の挙動を一切変えない。

#### Scenario: standard ＋ reviewer 定義ありで reviewers が設定される

**Given** `request.pipeline` 未指定（= `standard`）で、custom reviewer 定義が存在する
**When** reviewer を snapshot する段に進む
**Then** `jobState.reviewers` に reviewer 定義の snapshot が設定される（現行と一致）

#### Scenario: fast ＋ reviewer 定義ありで reviewers が設定される

**Given** `request.pipeline` が `"fast"`（changed-files 導出可能な runtime）で、custom reviewer 定義が存在する
**When** reviewer を snapshot する段に進む
**Then** `jobState.reviewers` に reviewer 定義の snapshot が設定される（現行と一致）

### Requirement: reviewer 定義が無いときは従来どおり未設定

When `reviewers.length === 0`, the system MUST NOT set `jobState.reviewers`, regardless of the descriptor（現行挙動不変）.

reviewer 定義が無い場合は descriptor に依らず未設定。guard は `reviewers.length > 0` を先に評価して short-circuit する。

#### Scenario: reviewer 定義なしでは reviewers が未設定

**Given** リポジトリに custom reviewer 定義が無い（`reviewers.length === 0`）
**When** 任意の pipeline で job を生成する
**Then** `jobState.reviewers` は設定されない（現行と一致）

### Requirement: snapshot 判定は descriptor capability から導出し profile 名で分岐しない

The snapshot gating SHALL derive its decision from the resolved descriptor's capability, and MUST NOT branch on the pipeline id or profile name（例 `pipelineId === "design-only"`）.

判定は「reviewer 工程を持つことの性質」であり特定 profile に固有でない。将来 reviewer-less な descriptor が増えても登録だけで自動的に正しく扱える（`#693` capability gate と同じ筋）。

#### Scenario: 判定が descriptor id に依存しない

**Given** `CONFORMANCE` step を持つ descriptor を任意の id（`design-only` を含む任意名）で構成する
**When** snapshot gating の述語を評価する
**Then** id に依らず「reviewer 工程あり（true）」と判定する（profile 名のハードコード分岐が無い）

### Requirement: guard の述語は descriptor.steps の CONFORMANCE アンカーに基づく

The guard predicate SHALL determine "has reviewer stage" by the presence of the `CONFORMANCE` step in `descriptor.steps`, and MUST NOT use a different concept（例 `code-review` の有無）.

`composeReviewerDescriptor` は custom reviewer chain を CONFORMANCE step の手前に挿入し、CONFORMANCE が無ければ末尾 append＝到達不能とする。よって「custom reviewer が実際に走る」⟺「descriptor が CONFORMANCE を持つ」。guard は composer と同じアンカーを見ることで両者の「reviewer 工程」概念を一致させる。

#### Scenario: CONFORMANCE を持つが code-review を持たない descriptor は true

**Given** `steps` に `CONFORMANCE` を含むが `code-review` を含まない descriptor
**When** 述語を評価する
**Then** 「reviewer 工程あり（true）」と判定する（CONFORMANCE アンカーに従う）

#### Scenario: code-review を持つが CONFORMANCE を持たない descriptor は false

**Given** `steps` に `code-review` を含むが `CONFORMANCE` を含まない descriptor
**When** 述語を評価する
**Then** 「reviewer 工程なし（false）」と判定する（`code-review` の有無では判定しない）

### Requirement: guard と composer の整合は composer の実出力を観測する alignment test で固定する

There SHALL be exactly one alignment test that, for each descriptor in `PIPELINE_REGISTRY`, calls `composeReviewerDescriptor(d, [fakeReviewer])` and observes the placement of the fake reviewer in the composed output, then asserts that the observed reachability matches the guard predicate. The test MUST NOT recompute the composer's insertion anchor (e.g. `conformanceIdx`) — it observes the actual composed output so that anchor drift in the composer changes placement and fails the test（`X ⟺ X` トートロジー禁止）.

reachable の観測は、composed `steps` 列で fake reviewer の後ろに base descriptor 由来の step が 1 つ以上続くか（reachable）／続かない（末尾 append の zombie）で導く。CONFORMANCE 等のアンカー token を観測側で再計算しない。

#### Scenario: 各 descriptor で composer 実出力の reachable 判定が guard 述語と一致する

**Given** `PIPELINE_REGISTRY` の各 descriptor `d`
**When** `composeReviewerDescriptor(d, [fakeReviewer])` を呼び、composed `steps` での fake reviewer の配置から reachable を観測する
**Then** その reachable 判定が `descriptorHasReviewerInsertionPoint(d)`（guard 述語）と一致する（standard / fast → reachable=true、design-only → reachable=false）

#### Scenario: composer の挿入アンカーが変われば alignment test が落ちる

**Given** alignment test が composer の実出力を観測している
**When** 将来 composer の挿入アンカー（reviewer chain の配置）が変わる
**Then** composed 出力での fake reviewer の配置が変わり、guard 述語との一致が崩れて test が失敗する（drift 検出）

### Requirement: composer・transitions・reviewer activation は無改変

This change SHALL NOT modify `composeReviewerDescriptor`, the pipeline transition tables, or reviewer activation logic; only whether `jobState.reviewers` is set changes.

`composeReviewerDescriptor` の zombie step 抑止（末尾 append 自体）は本 request の対象外（無害）。本 request は state への snapshot だけを正す。

#### Scenario: composer・transitions・activation の既存テストが green

**Given** 本 request 適用後のコードベース
**When** 既存の compose-reviewers / transitions / reviewer activation テストを実行する
**Then** いずれも無変更で green である（snapshot するか否か以外の挙動が不変）

### Requirement: forbidden surface 非接触で fast 適格を維持する

The change MUST NOT modify `src/core/port/**`, `src/state/schema.ts`, or `src/state/lifecycle.ts`; the `reviewers` field schema stays as-is（条件付きで set するだけ）.

変更は `src/core/command/pipeline-run.ts` ＋ `src/core/pipeline/` の純粋ヘルパ追加 ＋ alignment / behavioral test に限定する。これが fast の conformance scope checkpoint を素通りする条件であり、初回 dogfood の blast radius を最小化する。

#### Scenario: forbidden 3 surfaces に変更が無い

**Given** 本 request の diff（base...HEAD）
**When** 変更ファイルを列挙する
**Then** `src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` に変更が無い

### Requirement: FindingResolution の妥当値集合は不変

The `FindingResolution` union MUST remain exactly `fixable | decision-needed`; this change SHALL NOT add any new resolution value.

本 request は reviewer snapshot の gating のみを足し、finding の resolution 体系には触れない。

#### Scenario: resolution 妥当値は 2 値のまま

**Given** finding の resolution 妥当値集合
**When** 妥当値を列挙する
**Then** 値は `fixable` と `decision-needed` の 2 つだけである（新 resolution 値なし）
