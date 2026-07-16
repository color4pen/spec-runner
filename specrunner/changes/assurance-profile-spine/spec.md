# Spec: assurance profile を branch-borne immutable 属性として JobState に載せ、attach で digest 検証する（R1 背骨）

## Requirements

### Requirement: JobState は effective profile を optional な branch-borne 属性として保持する

`JobState` は、そのジョブの実行保証を表す optional な `profile` フィールド（型 `EffectiveProfile`）を保持できる SHALL。`profile` を欠落する state も有効な state として扱われ MUST。`profile` を持つ state を永続化・再読込しても値は保たれ MUST。

`EffectiveProfile` は `{ id: string; schemaVersion: number; policyDigest: string; budget; assurance }` を持つ。`budget` / `assurance` は R1 では opaque な記録構造であり、値に基づく挙動は導入され MUST NOT。

#### Scenario: profile を持つ state を round-trip しても値が保たれる

**Given** `profile: STANDARD_PROFILE` を持つ新規 `JobState`
**When** その state を永続化し、再度読み込む
**Then** 読み込まれた state の `profile` は `STANDARD_PROFILE` と等価である

#### Scenario: profile を持たない legacy state も有効として読める

**Given** `profile` フィールドを含まない既存 state ファイル（legacy）
**When** `validateJobState` でその state を検証・読み込みする
**Then** エラーにならず、検証は成功する
**And** state の他フィールド（`jobId` / `status` / `steps` 等）は従来通り保持される

### Requirement: standard profile は自己整合な単一定義として存在する

system は唯一の `STANDARD_PROFILE` を定義する SHALL。その `policyDigest` は `computePolicyDigest(STANDARD_PROFILE)` と一致し MUST（自己整合）。`computePolicyDigest(profile)` は profile の `policyDigest` を **除く** フィールド（`id` / `schemaVersion` / `budget` / `assurance`）の canonical hash を返し MUST。

#### Scenario: STANDARD_PROFILE は自己整合である

**Given** 定義済みの `STANDARD_PROFILE`
**When** `computePolicyDigest(STANDARD_PROFILE)` を計算する
**Then** その戻り値は `STANDARD_PROFILE.policyDigest` と一致する

#### Scenario: computePolicyDigest は policyDigest フィールドを hash 入力に含めない

**Given** ある profile
**When** その `policyDigest` フィールドのみを任意の値に書き換えて `computePolicyDigest` を計算する
**Then** 戻り値は書き換え前と同一である（policyDigest は入力に寄与しない）

#### Scenario: computePolicyDigest は本体フィールドの変化を反映する

**Given** ある profile
**When** その `budget` / `assurance` / `id` / `schemaVersion` のいずれかを変更して `computePolicyDigest` を計算する
**Then** 戻り値は変更前と異なる

### Requirement: 新規ジョブ起動時に standard profile を branch-borne に記録する

新規ジョブの初期 state 構築時、system は `STANDARD_PROFILE`（呼び出し側が profile を指定した場合はその値）を `profile` に記録する SHALL。記録された profile は state.json に永続化され、feature branch に載る（branch-borne）MUST。

#### Scenario: 新規ジョブの state に STANDARD_PROFILE が記録される

**Given** 新しいジョブを起動する
**When** `buildInitialJobState` が初期 state を構築する
**Then** 構築された state の `profile` は `STANDARD_PROFILE` と等価である
**And** その state を永続化した state.json に profile が含まれる

### Requirement: profile 欠落時は standard に解決し、state を書き換えない

system は、`profile` が欠落した state に対する解決値を `STANDARD_PROFILE` として一意に定義する SHALL。解決は単一のヘルパ `getProfile(state)` 経由で行われ MUST。`getProfile` は state を書き換え MUST NOT（純粋関数）。

#### Scenario: profile を持たない state は STANDARD_PROFILE に解決される

**Given** `profile` を持たない state
**When** `getProfile(state)` を呼ぶ
**Then** 戻り値は `STANDARD_PROFILE` と等価である
**And** 入力 state は書き換えられない

#### Scenario: profile を持つ state はその値に解決される

**Given** `profile: P` を持つ state
**When** `getProfile(state)` を呼ぶ
**Then** 戻り値は `P`（記録された値）である

### Requirement: profile は job 生存中 immutable である

profile はジョブ作成後、どの経路でも変更され MUST NOT。`transitionJob`・状態更新・step 永続化・resume は profile を保持し MUST。runtime から profile を silent に導出・再解決する経路を作ら MUST NOT。

#### Scenario: 状態遷移を跨いで profile が不変

**Given** `profile: STANDARD_PROFILE` を持つ running な state
**When** その state を `awaiting-resume` → `running` → `awaiting-archive` と順に遷移させる
**Then** 各遷移後の state の `profile` は `STANDARD_PROFILE` と等価のまま変わらない

#### Scenario: resume を跨いで profile が不変

**Given** `profile: STANDARD_PROFILE` を持つ awaiting-resume な state を永続化した checkpoint
**When** そのジョブを resume（load→再構築→再永続化）する
**Then** 再永続化された state の `profile` は `STANDARD_PROFILE` と等価のまま変わらない

### Requirement: attach は stored profile の自己整合を fail-closed で検証する

attach 時、checkpoint の state に `profile` が **存在する場合**、system は次を検証し、満たさなければ `CHECKPOINT_NOT_ATTACHABLE` で拒否し MUST。拒否時は job state / worktree / sidecar を一切作ら MUST NOT。

- `computePolicyDigest(profile)` が `profile.policyDigest` と一致すること（不一致 → reason `profile-inconsistent`）。
- `profile.schemaVersion` が本 runtime の対応上限（`SUPPORTED_PROFILE_SCHEMA_VERSION`）以下であること（超過 → reason `profile-uninterpretable`）。

profile が absent の checkpoint はこの検証をスキップし、`standard` に解決して attach を継続する SHALL（後方互換）。system はローカル config から同名 profile を再解決して比較し MUST NOT（stored object の自己整合のみを検証する）。

#### Scenario: policyDigest 不一致の checkpoint は拒否される

**Given** `profile.policyDigest` が中身（`computePolicyDigest` の結果）と一致しない checkpoint
**When** その checkpoint を attach 検証する
**Then** `CHECKPOINT_NOT_ATTACHABLE`（reason `profile-inconsistent`）で拒否される
**And** job state / worktree / sidecar は作られない

#### Scenario: schemaVersion が対応上限超過の checkpoint は拒否される

**Given** `profile.schemaVersion` が `SUPPORTED_PROFILE_SCHEMA_VERSION` を超過する checkpoint
**When** その checkpoint を attach 検証する
**Then** `CHECKPOINT_NOT_ATTACHABLE`（reason `profile-uninterpretable`）で拒否される

#### Scenario: 自己整合な profile を持つ checkpoint は attach できる

**Given** `profile: STANDARD_PROFILE`（digest 一致・schemaVersion 対応内）を持つ、他が有効な checkpoint
**When** その checkpoint を attach 検証する
**Then** 検証は成功し、VerifiedCheckpoint が返る

#### Scenario: profile を持たない checkpoint は後方互換で attach できる

**Given** `profile` を含まない、他が有効な legacy checkpoint
**When** その checkpoint を attach 検証する
**Then** profile 検証はスキップされ、検証は成功する（`standard` に解決）

### Requirement: profile の導入は standard の観測挙動を変えない

`profile` の追加・記録・解決・検証は、standard の pipeline 実行・attach・publisher・resume の観測挙動を変更し MUST NOT。system は profile の **値** に基づく分岐を追加し MUST NOT（R1 は属性の存在と自己整合検証まで）。

#### Scenario: 既存の挙動系テストが無変更で green

**Given** 本変更前に green な attach / publisher / worktree / pipeline / guard-halt のテスト群
**When** 本変更を適用してそれらを実行する
**Then** テストを変更せずに green である

#### Scenario: profile の値に基づく分岐が存在しない

**Given** standard profile を持つジョブ
**When** pipeline 実行・attach・resume を行う
**Then** 工程の選択・省略・budget/assurance の enforcement は profile の値に基づいて分岐しない
