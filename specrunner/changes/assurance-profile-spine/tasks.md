# Tasks: assurance profile を branch-borne immutable 属性として JobState に載せ、attach で digest 検証する（R1 背骨）

## T-01: 純粋 hash util を leaf（`src/util/hash.ts`）へ移設し旧位置を shim 化する

- [x] `src/util/hash.ts` を新設し、`canonicalJson` と `hashObject` を `src/core/agent/hash.ts` から**そのまま**移設する（実装・signature・返り値の `sha256:` prefix 形式を変えない。依存は `node:crypto` のみ）。
- [x] `src/core/agent/hash.ts` を `src/util/hash.ts` から `canonicalJson` / `hashObject` を re-export する薄い shim に置き換える（既存 import 元 `src/core/agent/registry.ts` を無改修に保つ）。
- [x] layer 依存を確認する: `src/util/hash.ts` は src 内 module を import しない（leaf）。`src/state/` からは `src/util/hash.js` を import する（shared-kernel→leaf、closure 上 ✓）。

**Acceptance Criteria**:
- `hashObject` / `canonicalJson` が `src/util/hash.js` から import 可能で、同一入力に対し移設前と同一のハッシュ文字列を返す。
- `src/core/agent/hash.ts` 経由の既存 import が無改修で解決し、`bun run typecheck` が green。
- `tests/unit/architecture/core-invariants.test.ts` / `module-boundary.test.ts` が green（新規 divergence を作らない）。

## T-02: `EffectiveProfile` 型と `JobState.profile` フィールドを追加する

- [x] `src/state/schema/types.ts` に `EffectiveProfile` interface を宣言する: `{ id: string; schemaVersion: number; policyDigest: string; budget: <opaque 記録構造>; assurance: <opaque 記録構造> }`。`budget` / `assurance` は R1 では opaque な記録構造として型付けする（例: 名前付き型 alias `ProfileBudget` / `ProfileAssurance` = `Readonly<Record<string, unknown>>`）。値に基づく enforcement schema を発明しないこと。
- [x] `JobState` interface に `profile?: EffectiveProfile` を追加する。配置・JSDoc は既存の top-level optional 属性（`pipelineId` :288）に倣い、「作成時に記録・以後 immutable・legacy state では欠落・欠落時は `getProfile` が `STANDARD_PROFILE` に解決」旨を記す。

**Acceptance Criteria**:
- `profile` を持つ／持たない双方の object が `JobState` として型検査を通る。
- `bun run typecheck` が green。

## T-03: `src/state/profile.ts` に定数・解決・digest helper を置く

- [x] `src/state/profile.ts` を新設し、次を export する（`src/state/pipeline-id.ts` を鏡写し、純粋関数・I/O 無し）:
  - `SUPPORTED_PROFILE_SCHEMA_VERSION`（number、= 1）。本 runtime が解釈可能な profile schemaVersion の上限。
  - `computePolicyDigest(profile): string` = `hashObject({ id: profile.id, schemaVersion: profile.schemaVersion, budget: profile.budget, assurance: profile.assurance })`。**`policyDigest` フィールドを hash 入力に含めない**こと。`hashObject` は `src/util/hash.js`（T-01）から import する。
  - `STANDARD_PROFILE: EffectiveProfile`。policyDigest を除く本体（`id: "standard"`, `schemaVersion: SUPPORTED_PROFILE_SCHEMA_VERSION`, `budget`/`assurance` は opaque な最小記録構造 = 空 object `{}`）を先に定義し、`policyDigest: computePolicyDigest(本体)` を合成して自己整合を構築時に保証する。任意で `Object.freeze` で共有定数の偶発 mutation を防ぐ。
  - `getProfile(state: Pick<JobState, "profile">): EffectiveProfile` = `state.profile ?? STANDARD_PROFILE`。入力 state を書き換えない。
- [x] 既定値（`STANDARD_PROFILE`）を消費側に分散させず、`getProfile` を唯一の解決入口とする。

**Acceptance Criteria**:
- `STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`（自己整合）。
- `getProfile({})` が `STANDARD_PROFILE` を返し、入力を書き換えない。
- `getProfile({ profile: P })` が `P` を返す。
- `computePolicyDigest` は `policyDigest` フィールドの改変に不変で、`id`/`schemaVersion`/`budget`/`assurance` の改変で変化する。
- I/O・filesystem 依存を持たない純粋関数である。

## T-04: `buildInitialJobState` が STANDARD_PROFILE を焼き込む

- [x] `src/store/job-state-store.ts` の `buildInitialJobState` の params に optional な `profile?: EffectiveProfile` を追加し、初期 state 構築時に `profile: params.profile ?? STANDARD_PROFILE` を書き込む（`pipelineId` :80 と同型、直接構築で焼き込む）。`STANDARD_PROFILE` は `src/state/profile.js` から import する。
- [x] 既存 caller（`LocalRuntime.bootstrapJob` / `ManagedRuntime.bootstrapJob`）は無改修で全新規 job が `STANDARD_PROFILE` を得ること（R1 は profile 選択源を持たないため引数追加はしない）。

**Acceptance Criteria**:
- `buildInitialJobState` が `profile` 未指定でも `STANDARD_PROFILE` を含む初期 state を生成する。
- 生成された state を永続化した state.json に profile が含まれる（branch-borne）。
- `bun run typecheck` が green。

## T-05: profile を immutable-per-job にする（spread 保持 ＋ patch 除外の歯）

- [x] `transitionJob`（`src/state/lifecycle.ts`）・`JobStateStore.update` / `appendStepRun`（`src/store/job-state-store.ts`）・resume 経路が full-state spread により profile を透過（clobber しない）ことを確認する。挙動変更のためのコードは不要（構造上保持される）。
- [x] immutable の歯を追加する: `TransitionContext.patch`（`src/state/lifecycle.ts`）と `JobStateStore.update` の patch 型の `Omit<JobState, …>` に `"profile"` を加え、patch 経由での profile 上書きをコンパイル時に禁止する。`buildInitialJobState` の直接構築は patch を経由しないため影響を受けない。
- [x] profile を runtime から silent に導出・再解決する経路（load 時に config から profile を差し込む等）を作らないこと。

**Acceptance Criteria**:
- `profile` を patch に渡すコードがコンパイルエラーになる（patch 型から除外されている）。
- profile を patch する既存 caller が無く、`bun run typecheck` が green。

## T-06: attach で stored profile の自己整合を fail-closed 検証する

- [x] `src/core/attach/verify-checkpoint.ts` に profile 自己整合検証ブロックを追加する。journal 整合性チェック（(b)〜(b-new) counter-reversal）の直後・quiescence 判定の周辺に置き、`state.profile` が **存在する場合のみ** 次を検証する:
  - `computePolicyDigest(state.profile) !== state.profile.policyDigest` → `checkpointNotAttachableError("profile-inconsistent", <detail>)`。
  - `state.profile.schemaVersion > SUPPORTED_PROFILE_SCHEMA_VERSION` → `checkpointNotAttachableError("profile-uninterpretable", <detail>)`。
- [x] `computePolicyDigest` / `SUPPORTED_PROFILE_SCHEMA_VERSION` は `src/state/profile.js` から import する（`getPipelineId` の import :19 と同型、domain→shared-kernel ✓）。
- [x] 検証ゲートには raw `state.profile` の presence（`!== undefined`）を使い、absent の場合は検証をスキップする（`getProfile` で解決に落とすのは検証後の通常経路。absent と present を混同しない）。
- [x] ローカル config から同名 profile を再解決して比較しないこと（stored object の自己整合のみ）。
- [x] `validateJobState`（`src/state/schema/operations.ts`）で profile を throw させないこと（欠落・present とも通す。self-consistency は attach 検証に一本化し、reason コードが `state-json-invalid` に化けるのを防ぐ）。発見性のため backward-compat コメントのみ追加してよい。

**Acceptance Criteria**:
- `profile.policyDigest` 不一致の checkpoint の attach 検証が `CHECKPOINT_NOT_ATTACHABLE`（reason `profile-inconsistent`）で拒否する。
- `profile.schemaVersion > SUPPORTED_PROFILE_SCHEMA_VERSION` の checkpoint が `CHECKPOINT_NOT_ATTACHABLE`（reason `profile-uninterpretable`）で拒否する。
- 自己整合な profile を持つ、他が有効な checkpoint は VerifiedCheckpoint を返す。
- profile を持たない checkpoint は検証をスキップして成功する（後方互換）。
- `verifyCheckpoint` は純粋 predicate のままで、失敗時に job state / worktree / sidecar を作らない（materialize 前）。

## T-07: テストを追加し、挙動不変を回帰検証する

- [x] `tests/unit/state/profile.test.ts`（新規、`tests/unit/state/pipeline-id.test.ts` に倣う）:
  - `STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`（自己整合）。
  - `getProfile({})` → `STANDARD_PROFILE`、入力非破壊。`getProfile({ profile: P })` → `P`。
  - `computePolicyDigest` が `policyDigest` 改変に不変・本体フィールド改変で変化。
- [x] state-store round-trip テスト（`buildInitialJobState` 起点）: 新規 state に `profile: STANDARD_PROFILE` が入り、persist→load で保たれる。profile 欠落の legacy state JSON が `validateJobState` / load で throw せず他フィールドを保つ。
- [x] immutability テスト: `profile` を持つ state を `transitionJob` で `awaiting-resume`→`running`→`awaiting-archive` と遷移させ、各段で profile が不変。resume（load→再永続化）を跨いで不変。
- [x] `tests/attach/verify-checkpoint.test.ts` に **新規 TC を追加**（既存 TC は無改修）:
  - profile present ＋ digest 不一致 → `profile-inconsistent` で reject（hint に reason 文字列を含む）。
  - profile present ＋ schemaVersion 超過 → `profile-uninterpretable` で reject。
  - profile present ＋ 自己整合 → VerifiedCheckpoint。
  - profile absent（既存 `makeValidStateJson` は profile なし）→ 成功（後方互換、既存 TC-VC-008 が該当することを確認）。
- [x] 挙動不変の回帰検証: 既存の attach / publisher / worktree / pipeline / guard-halt テストが**無変更で green**。初期 state 全体を byte 単位で snapshot するテストが存在する場合のみ、profile 追加に伴う期待値更新の要否を確認し、受け入れ基準の「無変更 green」対象スイート（上記）に該当しないものだけ更新する。

**Acceptance Criteria**:
- 上記すべての新規テストが pass する。
- 既存の attach / publisher / worktree / pipeline / guard-halt テストが無変更で green。

## T-08: spec の振る舞いを満たし全検証を green にする

- [x] `spec.md` の全 Requirement / Scenario が実装・テストで満たされていることを確認する。
- [x] `tasks.md` の各 checkbox を完了に更新する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 新規 job の state に `STANDARD_PROFILE` が記録され branch-borne に永続化される。
- profile 欠落の legacy state / checkpoint が従来通り読め、attach でき、欠落時は `standard` に解決される。
- attach が stored profile の digest 不一致（`profile-inconsistent`）・schemaVersion 超過（`profile-uninterpretable`）を fail-closed で拒否する。
- standard の pipeline 実行・attach・publisher・resume の観測挙動が不変（profile の値に基づく分岐を追加しない）。
