# Spec: pipeline profile 権限スコープ宣言 + スコープ超過の機械導出 escalation 土台

## Requirements

### Requirement: PipelineDescriptor は任意の権限スコープ宣言を持ち、absent は無制限として扱う

The `PipelineDescriptor` SHALL expose an optional `permissionScope` declaration, and a descriptor without it MUST be treated as unrestricted (current behavior).

`PipelineDescriptor` は任意フィールド `permissionScope` を持つ。`permissionScope` は `checkpoint`（評価 step 名）と `forbidden`（禁止面の列挙）からなる構造体である。`permissionScope` が absent の profile は権限が **無制限**（現行挙動）として扱われ、スコープ超過は一切評価されない。`PIPELINE_REGISTRY` のどの profile（`standard` / `design-only`）も本 request では `permissionScope` を宣言しない。

#### Scenario: スコープ未宣言 profile は無制限

**Given** `permissionScope` を持たない `PipelineDescriptor`
**When** その profile で job を実行する
**Then** スコープ超過判定は一度も走らず、verdict 導出・遷移は現行と完全一致する

#### Scenario: registry profile はスコープ未宣言

**Given** `PIPELINE_REGISTRY` の `standard` / `design-only`
**When** 各 descriptor の `permissionScope` を参照する
**Then** いずれも absent である

### Requirement: スコープ超過の機械導出は純関数で、fs / child_process を import しない

The scope-breach derivation MUST be a pure function that takes `(scope, changed-files, state)` and returns whether the scope was exceeded plus the breached surfaces, and it SHALL NOT import fs or child_process.

`(scope, changed-files, state)` を入力に超過有無と抵触面（面の識別子集合）を返す純関数が `src/core/pipeline/` 配下に存在する。この関数は fs / child_process を import せず、副作用を持たない。changed-files は `RuntimeStrategy` seam 経由で呼び出し側が供給する。`scope` が absent または禁止面が空のとき、超過は無し（抵触面 空）を返す。

#### Scenario: スコープ未宣言は超過無し

**Given** `scope` が absent
**When** 純関数に任意の changed-files と state を渡す
**Then** `breached` は false、抵触面は空である

#### Scenario: 禁止面にマッチする changed-file があると超過

**Given** 禁止面 `paths` の glob にマッチする changed-file が存在する `scope`
**When** 純関数に当該 changed-files を渡す
**Then** `breached` は true、抵触面にその面の識別子が（決定的順序で）含まれる

#### Scenario: 純関数は fs / child_process を import しない（arch test で固定）

**Given** スコープ導出純関数を含む `src/core/pipeline/` 配下のモジュール
**When** アーキテクチャ不変条件テストを実行する
**Then** 当該配下に fs / child_process の I/O 呼び出し・import が無いことが検証され green になる

### Requirement: 機械源 breach は scope marker 付き decision-needed を CLI が決定的に合成する

When the checkpoint step detects a breach, the CLI SHALL deterministically synthesize a `decision-needed` finding marked with `origin: "scope"`, and that finding MUST carry at least two options.

`permissionScope` が宣言され、現在の step がその `checkpoint` のとき、CLI は最終 changed-files に対して歯を回す。超過があれば CLI は `origin: "scope"`・`resolution: "decision-needed"` の finding を **決定的** に合成する。合成 finding は `≥2` 個の options（重い経路でやり直す / scope 宣言を見直す / 却下）を持ち、抵触面を rationale に列挙し、worktree に存在する決定的 anchor を `file` に持つ。合成 finding は同一入力に対して決定的（同じ key を生む）である。

#### Scenario: 機械源 breach から decision-needed を合成し escalation に落ちる

**Given** `checkpoint` step で禁止面に抵触する changed-files がある
**When** その step の verdict を導出する
**Then** 合成された `decision-needed` finding により verdict は `escalation` となり、job は `awaiting-resume` に遷移する

#### Scenario: 合成 finding は options を伴い決定的

**Given** 同一の scope・changed-files・state
**When** 合成を 2 回行う
**Then** 生成される finding の `file` / `title` / `rationale` / `options`（≥2）は完全に一致する

### Requirement: scope finding は既存の decision-needed → escalation 経路と issue 描画を再利用する

Both machine-source and semantic-source scope findings MUST flow through the existing `decision-needed → escalation` derivation and escalation-comment rendering, and the system SHALL NOT introduce a parallel escalation mechanism.

機械源（合成）・意味源（agent emit）いずれの scope finding も、既存の `deriveJudgeVerdict` の `decision-needed → escalation` 導出と escalation コメント描画（`getOpenDecisionFindings` 経由）を通る。超過理由は既存の escalation コメントに描画される。新しい escalation 機構・並行 escalation 経路は新設しない。

#### Scenario: 超過理由が escalation コメントに描画される

**Given** `checkpoint` で scope breach により `awaiting-resume` に遷移した job
**When** escalation コメントを生成する
**Then** 合成 scope finding の title・rationale（抵触面）・options が「Decisions needed」として描画される

#### Scenario: 越えない時は現行と挙動完全一致

**Given** `permissionScope` が宣言されているが禁止面に抵触する changed-file が無い
**When** `checkpoint` step の verdict を導出する
**Then** scope finding は合成されず、verdict・遷移・永続 findings は scope 機構が無い場合と完全一致する

### Requirement: Finding は任意の scope discriminator を持ち、absent は現行と完全一致

The `Finding` type SHALL gain an optional `origin` discriminator (value `"scope"`), an absent `origin` MUST behave identically to current behavior, and no migration is required.

`Finding` は任意フィールド `origin`（値 `"scope"`）を持つ。`origin` absent は in-scope（現行）として扱われ、migration を要しない。`parseFindings` は `origin` が present かつ妥当なときに捕捉し、absent のときの挙動は現行と完全一致する。agent-facing の finding schema は `origin` を任意フィールドとして受け付ける。

#### Scenario: origin absent は現行と同一

**Given** `origin` を持たない finding 入力
**When** `parseFindings` で解析する
**Then** 解析結果は本 request 適用前と完全一致する

#### Scenario: origin present を捕捉する

**Given** `origin: "scope"` を持つ妥当な decision-needed finding 入力
**When** `parseFindings` で解析する
**Then** 解析結果は `origin: "scope"` を保持する

### Requirement: FindingResolution の union は fixable / decision-needed のまま

The `FindingResolution` union MUST remain exactly `fixable` / `decision-needed`; no new resolution value SHALL be added for scope provenance, which is instead carried by `Finding.origin`.

`FindingResolution` の union は `fixable` / `decision-needed` の 2 値のままであり、scope 由来を表す新 resolution 値は追加しない。scope 由来か否かは `Finding.origin`（出自の別軸）で表す。

#### Scenario: 新 resolution 値が存在しない

**Given** finding の resolution 妥当値集合
**When** 妥当値を列挙する
**Then** 値は `fixable` と `decision-needed` の 2 つだけである

### Requirement: 解決済みの scope breach は decision-ledger で再 escalate しない

Every scope finding MUST be keyed into the decision-ledger via `computeFindingKey`, and once a human resolves it the same-key scope finding SHALL be excluded from subsequent verdict derivation so it does not re-escalate.

機械源・意味源いずれの scope finding も decision-ledger（`computeFindingKey` による key）に乗る。人間が `/resume` で当該 finding を解決すると、同一 key の scope finding は `filterUndecidedFindings` により以降の verdict 導出から除外され、再 escalate しない。

#### Scenario: 解決済み scope breach は再 escalate しない

**Given** ある scope finding と一致する key の decision record が state に存在する
**When** 同一の breach から再び同じ scope finding が合成（または emit）される
**Then** その finding は未決 finding から除外され、verdict は `escalation` にならない

#### Scenario: 並行 escalation 機構を新設していない

**Given** 既存の `judge-verdict` / decision-ledger のテスト
**When** 本 request 適用後にそれらを実行する
**Then** 無変更で green である（または additive 拡張のみで green）
