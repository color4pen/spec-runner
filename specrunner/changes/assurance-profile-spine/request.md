# assurance profile を branch-borne immutable 属性として JobState に載せ、attach で digest 検証する（R1 背骨）

## Meta

- **type**: spec-change
- **slug**: assurance-profile-spine
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260716（assurance profile と宣言的実行保証の境界）で ratify 済み。本 request はその D1 / D6 を実装する背骨（R1）。profile の enforcement（bite / floor / fast）は後続 R2–R6 で、本 request の射程外。新規 architecture ADR を要さない。 -->

## 背景

ADR-20260716 は job の実行保証を宣言的な effective profile として branch-borne・immutable-per-job に持たせ、attach/resume で検証する境界を定めた。本 request はその**背骨（R1）**だけを実装する:

- effective profile を `JobState` に載せ、job 生存中 immutable にする（D1）。
- `standard` を唯一の profile とし、**挙動は一切変えない**（standard の pipeline は現状と同一に走る）。
- attach 時に checkpoint の profile が**自己整合**（policyDigest が中身と一致）かつ **schemaVersion が解釈可能**であることを検証し、満たさなければ fail-closed（D6）。ローカルの同名 profile を再解決しない。

profile の値に基づく工程分岐・bite・floor・fast は本 request では**実装しない**。R1 は「profile という branch-borne immutable 属性が存在し、attach がその整合性を検証する」ところまで。

## 現状コードの前提

R1 は既存の `pipelineId` パターンを鏡写しにする。実装はこの前提に沿うこと。

- **immutable 属性の先例**: `JobState.pipelineId?: string`（`src/state/schema/types.ts:288`）は「作成時に記録・以後 immutable・absent は legacy 互換で `standard` に解決」。解決は `getPipelineId(state) = state.pipelineId ?? STANDARD_PIPELINE_ID`（`src/state/pipeline-id.ts:19`）。`buildInitialJobState` が `pipelineId: params.pipelineId ?? STANDARD_PIPELINE_ID` で設定（`src/store/job-state-store.ts`）。profile はこの構造をそのまま踏襲する。
- **digest 手段**: `hashObject(obj)`（`src/core/agent/hash.ts`）＝ canonical JSON（キー昇順・undefined 除去）の `sha256:` 付きハッシュ。`policyDigest` はこれで計算する。
- **attach 検証の seam**: `verifyCheckpoint`（`src/core/attach/verify-checkpoint.ts`）は `checkpointNotAttachableError(reason, detail)`（`src/errors.ts:385`, code `CHECKPOINT_NOT_ATTACHABLE`）を並べる typed-error チェーン。既に `getPipelineId` を import・使用（:160）。profile 検証はこのチェーンに1〜2件足す形。
- **fail-closed の先例**: `not-quiescent` / `pipeline-unresolvable` / `resume-reads-unevaluable` 等、検証不能・不整合は `checkpointNotAttachableError` で拒否する（同ファイル既存）。
- **backward compat**: `pipelineId` 等と同じく、legacy state に profile が absent でも valid。absent → `standard` に解決し、digest 検証は行わない（検証対象が無い）。

## 要件

1. **effective profile 型と standard 定義**: `EffectiveProfile = { id: string; schemaVersion: number; policyDigest: string; budget: <recorded>; assurance: <recorded> }` を定義する。`budget` / `assurance` は**記録される構造**であり、本 request はその値に基づく挙動を実装しない（opaque に扱い、digest の対象にのみする）。`STANDARD_PROFILE` を1つ定義し、その `policyDigest` は `hashObject({ id, schemaVersion, budget, assurance })` で決まる。

2. **JobState への branch-borne 記録と解決 helper**: `JobState.profile?: EffectiveProfile` を追加（backward-compat optional）。`src/state/profile.ts` に `getProfile(state)`（absent → `STANDARD_PROFILE`）と `computePolicyDigest(profile)` を置く（`pipeline-id.ts` を鏡写し）。`buildInitialJobState` が `profile` を `STANDARD_PROFILE`（`params.profile` があればそれ）で設定する。state.json は feature branch に commit されるため、これで branch-borne になる。

3. **immutable-per-job**: profile は作成後どの経路でも変更されない。`transitionJob` / resume / step persist が profile を保持する（`pipelineId` と同様、clobber しない）ことを保証する。profile を runtime から silent に導出・再解決する経路を作らない。

4. **attach での自己整合検証（fail-closed）**: `verifyCheckpoint` に、checkpoint の state に profile が**存在する場合**、次を検証して満たさなければ `checkpointNotAttachableError` で拒否する:
   - `computePolicyDigest(profile)` が `profile.policyDigest` と一致すること（不一致 → reason `profile-inconsistent`）。
   - `profile.schemaVersion` が本 runtime の対応上限以下であること（超過/未知 → reason `profile-uninterpretable`）。
   ローカル config から同名 profile を再解決してはならない（stored object の自己整合のみを検証）。profile が absent の checkpoint は `standard` に解決し、この検証をスキップする（backward compat）。

5. **挙動不変**: standard の pipeline 実行・attach・publisher・resume の観測挙動は現状と同一。profile の値に基づく分岐を一切追加しない。

## スコープ外

- profile の値に基づく工程分岐・省略（fast の topology、slim-design、implement-and-test の composite 化）— R3 / R6。
- `assurance` の enforcement（`testDerivation` の freeze、`BiteEvidence` 生成、bite strategy）— R3 / R4。
- `minimumAssurance` floor / protected paths / out-of-loop 評価 — R2。
- `request.type` からの profile 導出（D2 で禁止。R1 は standard 固定）。
- profile を選択する CLI / profile カタログ / fast profile 定義 — R6。
- provenance の PR 添付 / offline verify — R5。
- profile 欠落（strip）に対する anti-tamper（non-standard profile が存在してから意味を持つ。R1 は absent→standard の互換のみ）。

## 受け入れ基準

- [ ] `EffectiveProfile` 型と `STANDARD_PROFILE` が定義され、`STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`（自己整合）。
- [ ] `buildInitialJobState` が新規 job に `STANDARD_PROFILE` を設定し、state.json に永続化される（branch-borne）。
- [ ] `getProfile(state)` が absent の legacy state に対して `STANDARD_PROFILE` を返す（backward compat、state を書き換えない）。
- [ ] profile が `transitionJob`（running / awaiting-resume / awaiting-archive 等）と resume を跨いで**不変**であることをテストで固定する。
- [ ] **fail-closed**: `policyDigest` が中身と不一致の checkpoint の attach が `CHECKPOINT_NOT_ATTACHABLE`（reason `profile-inconsistent`）で拒否し、job state / worktree / sidecar を一切作らない。
- [ ] **fail-closed**: `schemaVersion` が対応上限超過の checkpoint の attach が `CHECKPOINT_NOT_ATTACHABLE`（reason `profile-uninterpretable`）で拒否する。
- [ ] profile が absent の checkpoint は `standard` に解決して attach が成功する（backward compat、既存 attach 保存）。
- [ ] 既存の attach / publisher / worktree / pipeline / guard-halt テストが**無変更で green**（挙動不変）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **profile は pipelineId を鏡写しにした branch-borne immutable 属性**。→ 却下: 新しい永続化機構や runtime 導出を発明する。
- **attach は stored profile の自己整合（digest 一致・schemaVersion 解釈可能）のみ検証**。→ 却下: ローカル config から同名 profile を再解決して比較する（Machine 間で定義が変わりうる、D6）。
- **absent profile は standard に解決し検証しない**。→ 却下: absent を fail-closed にして legacy job の attach を壊す。
- **R1 は profile の値に基づく挙動を一切実装しない**。→ 却下: bite / floor / fast / assurance enforcement を前倒しで入れる（R2–R6 の射程を侵食）。
