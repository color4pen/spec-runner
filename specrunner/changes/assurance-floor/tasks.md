# Tasks: assurance の構造化と archive 時 minimumAssurance floor の強制

## T-01: ProfileAssurance を index signature 保持で構造化する

- [ ] `src/state/schema/types.ts` の `ProfileAssurance`（現状 `Readonly<Record<string, unknown>>`, L275 付近）を interface へ置き換える。
- [ ] level 用の union 型を定義: `TestDerivationLevel = "coupled" | "frozen"`、`BiteEvidenceLevel = "optional" | "required"`、`SpecReviewLevel = "omitted" | "required"`。
- [ ] `ProfileAssurance` を次の形にする（全フィールド optional + 後方互換の index signature を残す）:
  - `readonly testDerivation?: TestDerivationLevel`
  - `readonly biteEvidence?: BiteEvidenceLevel`
  - `readonly specReview?: SpecReviewLevel`
  - `readonly [key: string]: unknown`
- [ ] doc コメントを「R1 opaque record からの widening。名前付き typed フィールドは floor 比較用、index signature は R1 記録値との後方互換用」に更新する。
- [ ] `EffectiveProfile.assurance` の参照（`src/state/profile.ts` の `computePolicyDigest` 引数型など）が新型で型付くことを確認する。

**Acceptance Criteria**:
- `ProfileAssurance` が `testDerivation` / `biteEvidence` / `specReview` の typed optional フィールドを持つ。
- `assurance: {}` と `assurance: { level: "high" }` の object literal が引き続き `ProfileAssurance` / `computePolicyDigest` 引数に代入可能（typecheck が通る）。
- `bun run typecheck` が green。

## T-02: STANDARD_PROFILE.assurance を最強値にし自己整合を保つ

- [ ] `src/state/profile.ts` の `_standardBody.assurance`（L45）を `{ testDerivation: "frozen", biteEvidence: "required", specReview: "required" }` にする。
- [ ] `STANDARD_PROFILE.policyDigest` は既存どおり `computePolicyDigest(_standardBody)` を module load 時に計算する経路を維持する（ハードコードしない）。
- [ ] 型注釈が `ProfileAssurance` の新型と整合することを確認する。

**Acceptance Criteria**:
- `STANDARD_PROFILE.assurance` が最強値 `{ testDerivation: "frozen", biteEvidence: "required", specReview: "required" }` と deep-equal。
- `STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`（自己整合）。
- 既存の `tests/unit/state/profile.test.ts`（TC-PROF-001〜004）が無変更で green。
- 既存の `tests/attach/verify-checkpoint.test.ts`（TC-VC-015〜018）が無変更で green。

## T-03: satisfiesFloor と AssuranceFloor を pure function として実装する

- [ ] `src/state/profile.ts` に `AssuranceFloor` 型を追加: `{ testDerivation?: TestDerivationLevel; biteEvidence?: BiteEvidenceLevel; specReview?: SpecReviewLevel }`（全フィールド optional、`src/state/schema` の level 型を再利用）。
- [ ] lattice rank マップを定義: `testDerivation: { coupled: 0, frozen: 1 }`、`biteEvidence: { optional: 0, required: 1 }`、`specReview: { omitted: 0, required: 1 }`。
- [ ] `satisfiesFloor(assurance: ProfileAssurance, floor: AssuranceFloor): boolean` を実装する。判定順:
  - floor が `undefined` のフィールドはスキップ。
  - floor が constrain するフィールドで、assurance 側の値が欠落 or rank マップに無い（未知値）→ `false`（fail-closed）。
  - assurance の rank < floor の rank → `false`。
  - 全て通過 → `true`。
- [ ] pure（no I/O）を維持し、既存の `computePolicyDigest` / `getProfile` と同じモジュール規律に従う。

**Acceptance Criteria**:
- floor が constrain する全フィールドが rank 以上のとき `true`、いずれかが下回るとき `false`。
- assurance にフィールドが欠落 / 未知値のとき、その制約フィールドについて `false`（fail-closed）。
- 空 floor `{}` は任意の assurance に対して `true`。
- `bun run typecheck` が green。

## T-04: ArchiveConfig に minimumAssurance 型を足す

- [ ] `src/config/schema/types.ts` の `ArchiveConfig`（L308）に `minimumAssurance?: MinimumAssuranceConfig` を追加する。
- [ ] `MinimumAssuranceConfig` 型を定義: `{ protectedPaths: string[] } & AssuranceFloor`（`protectedPaths` は必須、level フィールドは optional）。`AssuranceFloor` は `src/state/profile.ts`（または state schema）から import する。
- [ ] doc コメントで「これらの path を touch する変更に要求する assurance 下限。既存 `protectedPaths` と同じ glob 意味論」を明示する。
- [ ] barrel（`src/config/schema.ts` は `./schema/types.js` を re-export 済み）から `MinimumAssuranceConfig` が公開されることを確認する。

**Acceptance Criteria**:
- `ArchiveConfig.minimumAssurance` が optional で型付く。
- `MinimumAssuranceConfig` が `protectedPaths: string[]` を必須、level 3 フィールドを optional に持つ。
- `bun run typecheck` が green。

## T-05: minimumAssurance の config validation を足す

- [ ] `src/config/schema/validation.ts` の `archive` object schema（L346-375）に `minimumAssurance` を optional object として追加する。
- [ ] `protectedPaths` は既存 `archive.protectedPaths` と同じ非空 string 配列 glob 検証（`array(string(...).check(minLength(1, ...)), ...)`）を再利用する。
- [ ] level フィールドは `union([literal(...), literal(...)])`（`zod/v4-mini`、同ファイルで import 済み）で検証: `testDerivation: optional(union([literal("coupled"), literal("frozen")]))`、`biteEvidence: optional(union([literal("optional"), literal("required")]))`、`specReview: optional(union([literal("omitted"), literal("required")]))`。
- [ ] エラーメッセージは既存 config 検証の語彙に合わせる。

**Acceptance Criteria**:
- well-formed な `minimumAssurance`（`protectedPaths` + 任意 level）が検証を通る。
- 不正な level 値（例: `biteEvidence: "sometimes"`）が拒否され、該当フィールドを示すエラーになる。
- `protectedPaths` が配列でない場合に拒否される。
- 既存 config 検証テストが無変更で green。

## T-06: archive merge gate に floor を Step 3.6 として足す

- [ ] `src/core/archive/merge-then-archive.ts` の `MergeThenArchiveInput` に `minimumAssurance?: MinimumAssuranceConfig` を追加する（`protectedPaths` と並列。型は `../../config/schema.js` から import）。
- [ ] Step 1（L153-186）で load した `state` から `getProfile(state).assurance` を outer スコープの `let jobAssurance: ProfileAssurance` に捕捉する（`getProfile` は `../../state/profile.js` から import）。
- [ ] Step 3.5（protected-paths, L262-321）は**一切変更しない**。
- [ ] Step 3.5 の直後に Step 3.6（minimumAssurance floor）を独立ブロックとして追加する:
  - `input.minimumAssurance` 不在 or `minimumAssurance.protectedPaths.length === 0` → 何もしない。
  - `githubClient.listPullRequestFiles(owner, repo, prNumber)` を呼ぶ。失敗は Step 3.5 と同型の fail-closed escalation（`formatEscalation` + `exitCode 1`、`failedStep: "merge gate (minimumAssurance floor — file list fetch)"`）。
  - `evaluateProtectedPaths({ changedFiles, truncated, patterns: minimumAssurance.protectedPaths })` を再利用する（`./protected-paths.js` から import 済み）。
    - `decision.reason === "truncated"` → fail-closed escalation（`failedStep: "merge gate (minimumAssurance floor — file list truncated)"`）。
    - `decision.blocked === false`（match 無し）→ floor 非該当、何もせず先へ。
    - `decision.reason === "match"` → `satisfiesFloor(jobAssurance, floor)` を評価（floor は `minimumAssurance` から level フィールドを取り出したもの）。
      - `true` → 何もせず先へ（merge 継続）。
      - `false` → fail-closed escalation（`failedStep: "merge gate (minimumAssurance floor)"`、`detectedState` に matched files と effective assurance / 要求 floor を記載、`recommendedAction` に手動レビュー手順、`resumeCommand: specrunner job archive --with-merge ${slug}`、`exitCode 1`）。
- [ ] 追加 import（`getProfile`, `satisfiesFloor`, `ProfileAssurance` 型, `MinimumAssuranceConfig` 型）を行う。

**Acceptance Criteria**:
- `minimumAssurance` が protected path を touch し、effective assurance が floor 未満のとき merge が `exitCode 1` で停止し、merge / cleanup が呼ばれない。
- standard profile（`makeJobState` に profile 未設定 → `getProfile` が `STANDARD_PROFILE` を返す）は protected path を touch しても floor を満たし merge が進む。
- protected path を touch しない変更は sub-floor でも merge が進む。
- `minimumAssurance` 不在の config では Step 3.6 が何もせず、既存 archive 挙動が保存される。
- truncated changed-file list で fail-closed escalation になる。
- Step 3.5 の既存 protected-paths テストが無変更で green。
- `bun run typecheck` が green。

## T-07: CLI で minimumAssurance を config から読み runMergeThenArchive に渡す

- [ ] `src/cli/archive.ts` の `--with-merge` 経路（L151-175）で `minimumAssurance = config.archive?.minimumAssurance` を読む（`protectedPaths` の既存パターンと並列）。
- [ ] `runMergeThenArchive(...)` の呼び出し（L210-227）に `minimumAssurance` を渡す。
- [ ] config 読込失敗時（catch 分岐）は `minimumAssurance` を渡さない（= undefined、gate 無効）ことで既存の後方互換を維持する。

**Acceptance Criteria**:
- `config.archive?.minimumAssurance` が `runMergeThenArchive` に伝播する。
- config 不在時は `minimumAssurance` が undefined として渡り gate が無効。
- `bun run typecheck` が green。

## T-08: テストを追加する（lattice / gate / config validation）

- [ ] `tests/unit/state/profile.test.ts`（または新規 `satisfiesFloor` 用テストファイル）に lattice テストを追加:
  - 各フィールドの rank 比較（満たす / 下回る）。
  - 欠落 / 未知値の fail-closed（`{}` や `{ testDerivation: "coupled" }` に対する `{ testDerivation: "frozen" }` floor など）。
  - 空 floor `{}` は常に `true`。
  - `STANDARD_PROFILE.assurance` が任意 floor を満たす。
  - `STANDARD_PROFILE.assurance` が最強値と deep-equal であることの assertion。
- [ ] `tests/unit/core/archive/merge-then-archive.test.ts` に floor gate テストを追加（既存 harness の `makeJobState` / `makeGitHubClient` / `makeActiveEntry` を再利用）:
  - sub-floor profile（`makeJobState(..., { profile: { id:"synthetic", schemaVersion:1, policyDigest:"sha256:...", budget:{}, assurance:{ testDerivation:"coupled", biteEvidence:"optional", specReview:"omitted" } } })`）＋ `listPullRequestFiles` が floor path にマッチ ＋ `minimumAssurance` 設定 → `exitCode 1`、`mergePullRequest` / cleanup が呼ばれない。
  - standard profile（profile 未設定）＋ floor path マッチ ＋ `minimumAssurance` 設定 → merge が進む（`mergePullRequest` 呼ばれる）。
  - sub-floor profile ＋ floor path に**マッチしない** changed files → merge が進む。
  - `minimumAssurance` 未設定 → 既存挙動どおり merge が進む。
  - truncated（`listPullRequestFiles` が `{ files: [...], truncated: true }`）→ `exitCode 1` fail-closed。
- [ ] `tests/unit/config/`（既存の config validation テスト配置に合わせる）に `minimumAssurance` の valid / invalid 検証テストを追加。
- [ ] synthetic sub-floor profile は本 change のテスト fixture 内でのみ使用する（実運用の profile 選択機構は R6、本 change の射程外）。

**Acceptance Criteria**:
- 上記 lattice / gate / config validation テストが green。
- 既存の protected-paths / archive / verify-checkpoint / profile テストが無変更で green。
- `bun run typecheck && bun run test` が green。
