# Design: assurance profile を branch-borne immutable 属性として JobState に載せ、attach で digest 検証する（R1 背骨）

## Context

job の実行保証（budget / assurance）を宣言的な effective profile として、branch-borne・immutable-per-job に持たせ、attach/resume で検証する境界が定義されている。本変更はその **背骨（R1）** だけを実装する: profile という属性を `JobState` に載せ、job 生存中 immutable にし、attach がその自己整合性を検証する。profile の値に基づく工程分岐・bite・floor・fast は後続で扱い、本変更の射程外である。

R1 は既存の `pipelineId` パターンを鏡写しにする。現状コードの前提:

- **immutable 属性の先例**: `JobState.pipelineId?: string`（`src/state/schema/types.ts:288`）は「作成時に記録・以後 immutable・absent は legacy 互換で `standard` に解決」。解決は純粋関数 `getPipelineId(state) = state.pipelineId ?? STANDARD_PIPELINE_ID`（`src/state/pipeline-id.ts:19`）。canonical 定数は kernel 層（`src/kernel/pipeline-ids.ts`）に置かれ、記録側（store）・解決側（state）・参照側（core）が循環なく import する。
- **初期 state 生成の単一路**: 新規 job の初期 state は `buildInitialJobState`（`src/store/job-state-store.ts:46`）が唯一構築し、`pipelineId: params.pipelineId ?? STANDARD_PIPELINE_ID`（:80）で immutable 属性を焼き込む。`LocalRuntime` / `ManagedRuntime` の `bootstrapJob` は params を透過して本 factory に委譲する。
- **digest 手段**: `hashObject(obj)`（現状 `src/core/agent/hash.ts`）＝ canonical JSON（キー昇順・`undefined` 除去、`src/core/agent/hash.ts` の `canonicalJson`）の `sha256:` 付きハッシュ。依存は `node:crypto` のみの純関数。
- **attach 検証の seam**: `verifyCheckpoint`（`src/core/attach/verify-checkpoint.ts`）は `checkpointNotAttachableError(reason, detail)`（`src/errors.ts:385`, code `CHECKPOINT_NOT_ATTACHABLE`）を並べる typed-error チェーン。既に `getPipelineId` を import・使用（:160）し、検証不能・不整合は fail-closed で拒否する（`not-quiescent` / `pipeline-unresolvable` / `resume-reads-unevaluable` 等）。この関数は I/O 副作用を持たない純粋 predicate で、materialize（worktree / sidecar / job state 作成）より前に走る（`src/core/attach/orchestrator.ts`）。
- **on-read 正規化**: `verifyCheckpoint` は `composeSplitLayoutFromContent`（`src/store/job-state-projection.ts`）経由で `validateJobState`（`src/state/schema/operations.ts`）を通す。`validateJobState` は `pipelineId` を検証せず optional として放置する（`worktreePath` と同型）。

### 構造上の制約（layer 依存）

`architecture/model.md` §3 の closure model により、`src/state/`（shared-kernel 層）は `src/core/`（domain 層）を import できない（B-3: 上向き禁止）。一方 `hashObject` は現在 `src/core/agent/hash.ts`（domain）にある。したがって「`src/state/profile.ts` が digest を計算する」を素直に書くと shared-kernel→domain の divergence（`core-invariants.test.ts` が red）になる。この解消が本設計の中心的判断（D1）である。

## Goals / Non-Goals

**Goals**:

- `EffectiveProfile` 型と自己整合な単一の `STANDARD_PROFILE` を定義する。
- `JobState.profile?: EffectiveProfile` を branch-borne・optional 属性として追加し、`buildInitialJobState` が `STANDARD_PROFILE` を焼き込む。
- 欠落時の解決ヘルパ `getProfile(state)` と digest 計算 `computePolicyDigest(profile)` を単一の入口として提供する。
- profile を job 生存中 immutable に保つ（作成後どの経路でも変更されない）。
- attach 時に stored profile の **自己整合**（policyDigest 一致・schemaVersion 解釈可能）を fail-closed で検証する。
- standard の pipeline 実行・attach・publisher・resume の観測挙動を不変に保つ。

**Non-Goals**:

- profile の値（budget / assurance）に基づく工程分岐・省略・enforcement。R1 は値を opaque に記録し digest の対象にするのみ。
- `request.type` からの profile 導出、profile を選択する CLI / catalog / fast profile 定義。R1 は standard 固定。
- profile 欠落（strip）への anti-tamper。R1 は absent→standard の後方互換のみ扱う。
- ローカル config から同名 profile を再解決して比較すること。attach は stored object の自己整合のみ検証する。
- `validateJobState` での profile の厳格スキーマ検証。opaque optional として放置する（D6）。

## Decisions

### D1. 純粋 hash util を leaf（`src/util/hash.ts`）へ移設し、旧位置は re-export shim にする

`canonicalJson` + `hashObject` を `src/core/agent/hash.ts`（domain）から `src/util/hash.ts`（leaf）へ移設する。`src/core/agent/hash.ts` は `src/util/hash.ts` から re-export する薄い shim に置き換え、既存 import（`src/core/agent/registry.ts`）を無改修に保つ。`src/state/profile.ts` は `src/util/hash.ts` から `hashObject` を import する。

**Rationale**: `src/state/`（shared-kernel）は closure model 上 domain を import できない（B-3）。hash util は依存が `node:crypto` のみの純関数で、本来 leaf（`util/`）が正しい住処である（`src/util/atomic-write.ts` が既に `node:crypto` を使う先例）。leaf は全層から import 可能（shared-kernel→leaf は ✓、domain→leaf も ✓）なので、state からも core からも divergence なく参照できる。re-export shim により観測挙動と既存 import を完全に保つ。

**Alternatives considered**:

- `src/state/` に `canonicalJson`/`hashObject` を inline 複製する（`reconcile.ts` が `isProcessAlive` を inline した先例）: security 上重要な digest 関数の複製は silent drift（canonical 化規則が分岐すると digest が食い違う）を招く。single source of truth を保てない。却下。
- `src/state/profile.ts` から `src/core/agent/hash.ts` を直接 import する: shared-kernel→domain の B-3 違反。`core-invariants.test.ts` が red。却下。
- hash util を `src/kernel/` に置く: kernel は「import ゼロの共有型/語彙」の層であり、hash *関数* は util の性質。leaf の方が適切。ただし kernel でも closure 上は成立する（次善）。

### D2. `EffectiveProfile` 型は schema/types.ts、helper/定数は `src/state/profile.ts`（pipeline-id.ts を鏡写し）

`EffectiveProfile = { id: string; schemaVersion: number; policyDigest: string; budget: ProfileBudget; assurance: ProfileAssurance }` を `src/state/schema/types.ts` に宣言し、`JobState.profile?: EffectiveProfile` を追加する。`budget` / `assurance` は R1 では opaque な記録構造（`Readonly<Record<string, unknown>>` 相当）とする。`SUPPORTED_PROFILE_SCHEMA_VERSION` / `STANDARD_PROFILE` / `getProfile` / `computePolicyDigest` は `src/state/profile.ts` に置く（`src/state/pipeline-id.ts` を鏡写し）。

**Rationale**: 型は `JobState` と同居させると `schema/types.ts` が profile.ts を import せずに済み、循環を避けられる（profile.ts → schema/types.ts の一方向）。定数 `STANDARD_PROFILE` は `computePolicyDigest` と相互依存するため helper と同一ファイルに束ねるのが自然（pipeline-id は定数を kernel から import するだけだが、profile は digest 計算を伴うため定数を helper と同居させる差分がある）。`budget`/`assurance` を opaque に保つのは R1 が値の意味を実装しないため（Non-Goals）。

**Alternatives considered**:

- 型も定数も kernel に置く（pipeline-ids.ts と完全同型）: `STANDARD_PROFILE.policyDigest` を `hashObject` で導出する必要があり、kernel は domain/leaf 以外を import しない制約と両立させるには kernel→leaf import が要る。成立はするが、helper 群（`getProfile` 等）が state に散らばり凝集が落ちる。state に集約する方が読みやすい。
- `budget`/`assurance` を R1 で構造化して型付けする: enforcement の schema を前倒しで発明することになり R2–R6 の射程を侵食する。opaque 記録に留める。

### D3. `STANDARD_PROFILE` は digest を構築時に導出し、自己整合を構造保証する

`STANDARD_PROFILE` は「policyDigest を除く profile 本体」を先に定義し、その `policyDigest` を `computePolicyDigest(本体)` で計算して合成する。`computePolicyDigest(profile) = hashObject({ id, schemaVersion, budget, assurance })`（**`policyDigest` フィールドは hash 入力から除外する**）。`STANDARD_PROFILE` の `schemaVersion` は `SUPPORTED_PROFILE_SCHEMA_VERSION`（= 1）とする。

**Rationale**: policyDigest を hardcode 文字列で持つと定義変更時に drift する。構築時導出により `STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)` が定義上必ず成立する（受け入れ基準の自己整合を機構で担保）。digest 入力から policyDigest を除くのは自己参照を避けるためであり、attach 検証（D5）が同じ関数で再計算して一致を確かめられる根拠になる。

**Alternatives considered**:

- policyDigest を hardcode し test で照合する: 定義変更のたびに手動更新が必要で drift 源。構築時導出が優る。
- digest 入力に policyDigest を含める: 自己参照で計算不能。却下。

### D4. `buildInitialJobState` が `STANDARD_PROFILE` を焼き込み、profile は job 生存中 immutable

`buildInitialJobState` の params に optional な `profile?: EffectiveProfile` を追加し、初期 state に `profile: params.profile ?? STANDARD_PROFILE` を直接構築で書き込む（`pipelineId` の :80 と同型）。R1 は profile を選択する経路を持たないため、既存 caller（`bootstrapJob`）は無改修で全新規 job が `STANDARD_PROFILE` を得る。profile の変更（clobber・再解決）はどの経路でも行わない。`transitionJob` / `update` / `appendStepRun` / resume は full-state spread で profile を透過する（構造上保持される）。加えて、`TransitionContext.patch` と `JobStateStore.update` の patch 型の `Omit` に `"profile"` を追加し、patch 経由での profile 上書きをコンパイル時に禁止する（immutable の歯）。

**Rationale**: 初期記録を単一 factory に閉じるのは `pipelineId` の確立パターン。immutable-per-job を「spread で偶然保たれる」慣習に依存させず、patch 型から profile を除外して構造的に上書き不能にすることで、要件「どの経路でも変更されない／silent に再解決する経路を作らない」を歯として固定する。profile は R1–R6 を通じて作成後不変の設計であり、patch 除外は将来にわたって正しい。`buildInitialJobState` は直接構築で焼き込むため patch 除外の影響を受けない。

**Alternatives considered**:

- pipelineId と完全同型に「spread 保持＋慣習」のみで immutable を担保する: 受け入れ基準はテストでの固定を要求するが、コンパイル時の歯を加える方が emergent invariant（複数経路×実行順）に強い。低リスク・可逆（Omit の削除で戻せる）なので採用。
- `bootstrapJob` / `prepare` に profile 引数を通す: R1 は選択源を持たず dead plumbing。default 焼き込みで十分。R6 で選択源が生えたら引数を足す。

### D5. attach は stored profile の自己整合のみを fail-closed で検証する

`verifyCheckpoint` に、`state.profile` が **存在する場合** のみ次を検証する検証ブロックを、journal 整合性（(b)〜(b-new)）の直後・quiescence 判定の周辺に追加する:

- `computePolicyDigest(state.profile) !== state.profile.policyDigest` → `checkpointNotAttachableError("profile-inconsistent", …)`。
- `state.profile.schemaVersion > SUPPORTED_PROFILE_SCHEMA_VERSION` → `checkpointNotAttachableError("profile-uninterpretable", …)`。

`state.profile` が absent の checkpoint はこの検証をスキップし、`getProfile` により `standard` に解決して attach を継続する（後方互換）。ローカル config から同名 profile を再解決してはならない。検証は `verifyCheckpoint`（純粋 predicate）内で行うため、失敗時は job state / worktree / sidecar を一切作らない（materialize 前）。

**Rationale**: D6（境界定義）に従い、Machine 間で profile 定義が変わりうるため、attach は stored object の**自己整合**（改竄・切り詰め検出）のみを検証し、ローカル再解決による比較はしない。digest 一致は tamper 検出、schemaVersion ≤ 対応上限は「この runtime が解釈可能」の検出。両者とも「検証不能・不整合は拒否」という既存 fail-closed 方針（`resume-reads-unevaluable` 等）と同方向。`getProfile` は解決に使い、検証ゲートには raw `state.profile` の presence を使う（absent と present を混同しない）。

**Alternatives considered**:

- ローカル config の同名 profile を再解決して比較する: Machine 間で定義が異なりうるため false reject / false accept を生む（D6 で却下済み）。stored object の自己整合のみが正しい。
- absent profile を fail-closed で拒否する: legacy job の attach を壊す。absent は standard に解決（後方互換）。却下。
- 検証を `validateJobState` に置く: `composeSplitLayoutFromContent` 経由で `state-json-invalid` に化け、reason コード（`profile-inconsistent` / `profile-uninterpretable`）が失われる。attach 固有の検証は `verifyCheckpoint` に置く。

### D6. `validateJobState` は profile を厳格検証せず opaque optional として放置する

`validateJobState` は profile の欠落をエラーにせず、値の充填・書き換え・スキーマ検証も行わない（`pipelineId` / `worktreePath` と同型）。発見性のため backward-compat コメントのみ追加してよい。

**Rationale**: (a) 読み込みは state を書き換えない純粋検証であるべき、(b) `verifyCheckpoint` は `composeSplitLayoutFromContent`→`validateJobState` を通るため、ここで profile を throw させると attach の reason コードが `state-json-invalid` に化ける（D5 と矛盾）。opaque に通し、自己整合は attach 検証に委ねることで reason コードを保つ。既存の attach/publisher テストも無変更で green を保てる。

**Alternatives considered**:

- present 時に構造検証（policyDigest が string 等）を加える: reason コード衝突（上記）と、既存テストの回帰を招く可能性。R1 は attach 検証に一本化する。

## Risks / Trade-offs

- **[Risk] hash util 移設で既存 import が壊れる** → `src/core/agent/hash.ts` を re-export shim にして signature・観測挙動を保つ。`registry.ts` 等の consumer は無改修。移設対象は純関数のみで振る舞い不変。
- **[Risk] shared-kernel→domain の新規 divergence を誤って作り込む** → `src/state/profile.ts` は `src/util/hash.ts`（leaf）からのみ hash を import する。`core-invariants.test.ts` / `module-boundary.test.ts` で closure を検証。
- **[Trade-off] 全新規 job（テスト由来含む）が `profile: STANDARD_PROFILE` を持つ** → 望ましい挙動。ただし初期 state 全体を byte 単位で snapshot するテストがあれば期待値更新が要る。受け入れ基準が「無変更 green」を求める attach/publisher/worktree/pipeline/guard-halt スイートはフル初期 state を snapshot しないため影響しない。該当 snapshot の有無を T-07 で確認する。
- **[Trade-off] patch 型から `profile` を Omit する歯を足す** → profile を patch する既存 caller は無い（新規属性）ため typecheck は green。将来 profile を patch したくなる設計は immutable-per-job に反するので、この制約は正しく永続する。可逆（Omit 削除で戻る）。
- **[Risk] digest 入力に policyDigest を誤って含める** → 自己参照で self-consistency が壊れる。`computePolicyDigest` は `{ id, schemaVersion, budget, assurance }` のみを hash する実装に固定し、self-consistency テスト（`STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`）と tamper テスト（budget 改変で digest 変化・policyDigest 改変で computed digest 不変）で二重に固定する。

## Open Questions

- なし（architect 評価済みの設計判断で確定。profile の値に基づく enforcement は後続 request で扱う）。
