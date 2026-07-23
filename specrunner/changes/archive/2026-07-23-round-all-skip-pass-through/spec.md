# Spec: custom reviewer round の全員 skip を構造的 skip として green で通す

## Requirements

### Requirement: 全員 skip の round は構造的 skip として green で成立する

The system SHALL treat a custom reviewer round in which every fanned-out member returned a
`skipped` verdict (a non-empty member set, all `skipped`) as a **structural skip** that does not
block the gate. The coordinator's aggregate verdict for this case MUST be `approved` (gate
pass-through). The system MUST NOT set a `ROUND_ALL_MEMBERS_SKIPPED` round error, and the pipeline
MUST proceed to the subsequent steps (regression-gate → conformance → … → pr-create) and reach
`awaiting-archive` without stopping at `awaiting-resume`.

Per-member verdict vocabulary is unchanged: each skipped member's own verdict remains `skipped`
(distinct from `approved`). Only the aggregation of an all-skip member set changes.

#### Scenario: 全 member が担当外 skip → job は awaiting-archive まで到達する

**Given** custom reviewer が 1 名以上構成され、全 member が活性化条件不一致で `skipped` を返す round
**When** coordinator が fan-out を集約する
**Then** aggregate verdict が `approved` になり、roundError は設定されず、pipeline は regression-gate → conformance を経て `awaiting-archive` に到達する

#### Scenario: 単一 reviewer の全 skip も構造的 skip として通る

**Given** custom reviewer が 1 名だけ構成され、その member が活性化条件不一致で `skipped` を返す
**When** coordinator が round を集約する
**Then** aggregate verdict が `approved` になり、job は停止しない

#### Scenario: 集約関数の全 skip は approved

**Given** member verdict 配列が `["skipped", "skipped"]`
**When** `aggregateVerdict` が集約する
**Then** 戻り値は `"approved"` である（空配列・混在 approved と同じ gate 通過値）

### Requirement: per-member の skip 証跡を journal に残す

The system SHALL record, for each skipped member, the skip fact and its reason (which activation
condition did not match the current diff) into the event journal (`events.jsonl`) so that a third
party can mechanically determine, after the run, which reviewer did not run and why. This evidence
MUST be preserved for the structural-skip (all-skip) case — the round MUST still be executed and its
member skip records MUST still be persisted; the round is not bypassed.

#### Scenario: skip した member の理由が journal step-attempt record に残る

**Given** reviewer `security` が `paths: ["src/auth/**"]` を持ち、変更ファイルが一致せず skip された round
**When** round が commit され state が persist される
**Then** `events.jsonl` を fold すると `security` の step-attempt record が `verdict: "skipped"` かつ `skipReason`（`src/auth/**` に一致しなかった旨）付きで存在し、`security skipped: <reason>` の transition record が現れる

#### Scenario: 全 skip round でも member 証跡が消えない

**Given** 全 member が skip した構造的 skip の round
**When** round が集約・commit される
**Then** 各 member の skip record（verdict `skipped` + skipReason）が state と journal の双方に残り、round が実行された痕跡が第三者に確認できる

### Requirement: error と skip の区別を維持する

The system SHALL keep member session error / halt as a non-green outcome, distinct from `skipped`.
A round in which skip and error coexist (e.g. 1 member `skipped` + 1 member halt/error) MUST NOT be
treated as a structural skip and MUST stop the pipeline (coordinator escalation → `awaiting-resume`),
as before this change.

#### Scenario: skip と error の混在は停止する

**Given** round の member が 1 名 `skipped`、1 名 halt（session error）を返す
**When** coordinator が集約する
**Then** aggregate verdict は `escalation` になり、pipeline は後続の構造的 skip 経路に載らず `awaiting-resume` で停止する

#### Scenario: 集約関数は error 混在で escalation を返す

**Given** member verdict 配列が `["skipped", "escalation"]`
**When** `aggregateVerdict` が集約する
**Then** 戻り値は `"escalation"` である（error は skip に紛れない）

### Requirement: diff 導出不能時の fail-closed を維持する

The system SHALL NOT change the activation-gate behavior in the executor: when the runtime declares
it cannot derive changed files, a `paths`-conditioned reviewer MUST be activated (fail-closed), not
skipped. This change touches only the round-level aggregation of an already-produced set of member
verdicts, never the per-reviewer activation decision.

#### Scenario: diff 導出不能で paths 条件付き reviewer が活性化する（既存挙動）

**Given** runtime が変更ファイルを導出できない（`canDeriveChangedFiles()` が false）
**When** executor が `paths` 条件付き reviewer の活性化ゲートを評価する
**Then** reviewer は活性化され（skip されず）agent が起動する（この request では変更しない）

### Requirement: skip が恒久 free-pass にならない

The system SHALL ensure a member skipped for activation mismatch is NOT permanently excluded from
future rounds: in the structural-skip case the member's persisted status MUST remain `pending`
(NOT finalized to `skipped`), so that any subsequent round (e.g. after a fixer changes the diff)
re-evaluates its activation condition against the new diff via the fan-out.

#### Scenario: 全 skip round 後も member status は pending のまま

**Given** 全 member が skip した構造的 skip の round
**When** round が commit され reviewerStatuses が persist される
**Then** 各 member の status は `pending` のまま（`skipped` に確定していない）で、次 round の fan-out で再評価される

### Requirement: 後方回復経路 — 旧エラーで停止した job が完走する

The system SHALL allow an existing job that was stopped at `awaiting-resume` carrying
`state.error.code === "ROUND_ALL_MEMBERS_SKIPPED"` to resume and reach `awaiting-archive` under the
new semantics: when the coordinator round re-runs, it re-evaluates activation, produces the
structural-skip `approved` aggregate, and the round commit clears the sticky error
(`state.error = null`), so the terminal seam routes to `awaiting-archive`.

#### Scenario: 旧 ROUND_ALL_MEMBERS_SKIPPED 状態からの resume が完走する

**Given** `state.error.code === "ROUND_ALL_MEMBERS_SKIPPED"` を持ち reviewerStatuses の member が `pending` の awaiting-resume 状態
**When** coordinator round が新仕様で再評価される（全 member 再 skip）
**Then** round commit で `state.error` が `null` にクリアされ、pipeline は `awaiting-archive` に到達する
