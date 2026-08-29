# Tasks: exclusion-aware-publish-prediction

## T-01: `collectPublishablePaths` に worktree 除外フィルタを追加する

**対象ファイル**: `src/git/push-capability.ts`

- [ ] `collectPublishablePaths` の第 3 引数に `worktreeExcludePatterns?: string[]` を追加する（省略可能、backward-compatible）
- [ ] worktree 成分（section (a): git status 由来の paths Set）を確定した後、`worktreeExcludePatterns` が非空の場合のみ `matchesGlob` を使ってインラインフィルタを適用する: `paths.delete(p)` for each p that matches any pattern
- [ ] unpushed-commit 成分（section (b): git rev-list + diff-tree 由来）にはフィルタを適用しない
- [ ] 関数の JSDoc を更新する: `worktreeExcludePatterns` の説明（「worktree 成分のみに適用。commit 成分は除外しない」）を追記する
- [ ] `matchesGlob` は既にインポート済みであること、および `staging-containment.ts` へのインポートを追加しないこと（DSM 制約）を確認する

**Acceptance Criteria**:
- `worktreeExcludePatterns` を指定すると、worktree 成分のうち一致 path が戻り値に含まれない
- `worktreeExcludePatterns` を指定しても、unpushed-commit 成分の同一 path は戻り値に残る
- 引数を省略した場合（既存呼び出し形式）の動作が変わらない

---

## T-02: Layer 2 backstop — `commitAndPush` guarded 分岐に除外を適用する

**対象ファイル**: `src/core/step/commit-push.ts`

- [ ] `commitAndPush` 関数内の Layer 2 backstop（L519-533 付近）で、`collectPublishablePaths` の呼び出し前に `resolveStagingExcludePatterns(deps.config)` を呼び出して `excludePatterns` を取得する
- [ ] `collectPublishablePaths(gitPublishSpawn, cwd, excludePatterns)` のように第 3 引数として渡す
- [ ] `resolveStagingExcludePatterns` と `applyStagingExclusions` は既に `staging-containment.ts` からインポート済みであることを確認する（新規インポート不要）

**Acceptance Criteria**:
- `stagingExcludePatterns: [".github/workflows/**"]` 設定下で、`.github/workflows/x.yml` が worktree dirty であっても `commitAndPush`（guarded 分岐）が `UNPUSHABLE_PATH_BLOCKED` を throw しない
- worktree dirty であっても `pushCapability.patterns` に一致しない path は従来どおり通過する（非退行）

---

## T-03: Layer 2 backstop — `commitScopedPaths` に除外パラメータを追加する

**対象ファイル**: `src/core/step/commit-push.ts`

- [ ] `commitScopedPaths` 関数シグネチャに 8 番目の省略可能引数 `worktreeExcludePatterns?: string[]` を追加する
- [ ] 関数内の Layer 2 backstop（L1004-1023 付近）で `collectPublishablePaths(gitPublishSpawn, cwd, worktreeExcludePatterns)` のように渡す
- [ ] `commitAndPush` の scoped 分岐（`commitScopedPaths` を呼び出す箇所）を特定し、`resolveStagingExcludePatterns(deps.config)` を渡すよう変更する

**Acceptance Criteria**:
- `stagingExcludePatterns: [".github/workflows/**"]` 設定下で、`.github/workflows/x.yml` が worktree dirty であっても `commitScopedPaths` が `UNPUSHABLE_PATH_BLOCKED` を throw しない
- 引数を省略した場合（既存呼び出し形式）の動作が変わらない

---

## T-04: `commitRoundArtifacts` / `parallel-review-round.ts` 経由で除外パラメータを渡す

**対象ファイル**: `src/core/pipeline/parallel-review-round.ts`、`src/core/runtime/local.ts`

- [ ] `parallel-review-round.ts` で `deps.runtimeStrategy.commitRoundArtifacts?.(...)` を呼び出す箇所（L431 付近）の `egressParams` オブジェクトに `excludeWorktreePatterns: resolveStagingExcludePatterns(deps.config)` を追加する
- [ ] `resolveStagingExcludePatterns` を `staging-containment.ts` からインポートする（`parallel-review-round.ts` に未インポートの場合）
- [ ] `local.ts:commitRoundArtifacts` 内で `egressParams` から `excludeWorktreePatterns` を取り出し、`commitScopedPaths` の第 8 引数に渡す
  - 型注釈: `egressParams` を cast する箇所（L933 付近）に `excludeWorktreePatterns?: string[]` を追加する

**Acceptance Criteria**:
- parallel-review-round から呼ばれる `commitRoundArtifacts` が、`stagingExcludePatterns` 設定された除外 path を含む worktree で `UNPUSHABLE_PATH_BLOCKED` を throw しない
- `egressParams` への追加は `egress?.pushCapability` と同様に optional として実装されており、既存テストが壊れない

---

## T-05: Layer 1 — `validateStepOutputs` インターフェースと実装に除外パラメータを追加する

**対象ファイル**: `src/core/port/runtime-strategy.ts`、`src/core/runtime/local.ts`

- [ ] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy.validateStepOutputs` シグネチャに省略可能な第 4 引数 `excludeWorktreePatterns?: string[]` を追加する
- [ ] `src/core/runtime/local.ts` の `LocalRuntime.validateStepOutputs` 実装の `unpushable-path` 処理分岐（L1609-1624 付近）で、`collectPublishablePaths(this.spawnFn, cwd, excludeWorktreePatterns)` のように渡す
  - `collectPublishablePaths` は `push-capability.ts` から既にインポートされていることを確認する
- [ ] managed runtime がある場合は、その `validateStepOutputs` 実装も第 4 引数を受け取るシグネチャに更新する（実装は引数を無視してよい）

**Acceptance Criteria**:
- `validateStepOutputs` を呼び出す際に第 4 引数を省略した場合（既存テスト・executor.ts）の動作が変わらない
- 第 4 引数を渡した場合、unpushable-path 契約の判定で除外 path が violation にならない

---

## T-06: `step-context-builder.ts` で Layer 1 に除外パラメータを注入する

**対象ファイル**: `src/core/step/step-context-builder.ts`

- [ ] `resolveStagingExcludePatterns` を `staging-containment.ts` からインポートする（未インポートの場合）
- [ ] OutputVerificationPolicy の `detect` クロージャ（L141 付近）を修正し、`strategy.validateStepOutputs(followUpContracts, cwd, branch, excludeWorktreePatterns)` のように渡す
  - `excludeWorktreePatterns` は `resolveStagingExcludePatterns(deps.config)` で解決する
  - クロージャの外で一度だけ解決してキャプチャする（クロージャ内で毎回解決しない）

**Acceptance Criteria**:
- `stagingExcludePatterns: [".github/workflows/**"]` 設定下で、Layer 1 の follow-up contract 検査（`validateStepOutputs` 経由）が除外 path を violation と報告しない
- `stagingExcludePatterns` が未設定の場合（空配列）は従来どおりの動作

---

## T-07: scoped residual check で除外 path を事前フィルタする

**対象ファイル**: `src/core/step/commit-push.ts`

- [ ] `commitAndPush` の scoped 分岐の residual check（L568-591 付近）の前に `resolveStagingExcludePatterns(deps.config)` を呼び出して `excludePatterns` を取得する
- [ ] `const residualPaths = applyStagingExclusions(postStatus.paths, excludePatterns)` のようにフィルタを適用し、フィルタ済み `residualPaths` を `findScopedCommitViolations` に渡す（`postStatus.paths` を直接渡さない）
- [ ] `findScopedCommitViolations` の呼び出しシグネチャを確認し、第 2 引数を `residualPaths` に変更する（関数本体は変更しない）
- [ ] `findWriteScopeViolations(step.name, slug, postStatus.stagedOnly, ...)` の呼び出しは変更しない（保護 canon 検査は除外を迂回させない）

**Acceptance Criteria**:
- `stagingExcludePatterns: [".github/workflows/**"]` 設定下で、`.github/workflows/x.yml` が scoped step 実行後に worktree dirty（untracked）でも `WRITE_SCOPE_VIOLATION` が throw されない
- 除外 path を untracked として持つ worktree で `restoreViolatedPaths` が呼ばれない（`git clean -f` されない）
- 除外対象でない dirty path は従来どおり residual violation になる（非退行）
- 保護 canon path（`specrunner/changes/<slug>/` 配下等）の `stagedOnly` 検査は除外設定に関係なく行われる（非退行）

---

## T-08: `buildDeliveryExclusionsBlock` ユーティリティを追加し、design/review メッセージに注入する

**対象ファイル**: `src/core/step/staging-containment.ts`、`src/prompts/design-system.ts`、`src/core/step/design.ts`、`src/core/step/code-review.ts`、`src/core/step/conformance.ts`、`src/core/step/custom-reviewer.ts`

### staging-containment.ts

- [ ] `buildDeliveryExclusionsBlock(patterns: string[]): string` 関数を追加・export する
  - `patterns` が空の場合は空文字列を返す
  - 非空の場合、次の形式の markdown 文字列を返す:
    ```
    ## Delivery exclusions

    The following paths are outside spec-runner's delivery scope and must not be required in the synthesized commits:

    - <pattern1>
    - <pattern2>
    ```

### design-system.ts / design.ts

- [ ] `buildInitialMessage` のシグネチャに省略可能な引数 `deliveryExclusionsBlock?: string` を追加する
- [ ] `deliveryExclusionsBlock` が非空の場合、factCheckDirective の注入後（または constraint block の後）かつ Repository Context の前に挿入する
- [ ] `design.ts:buildMessage` で `resolveStagingExcludePatterns(deps.config)` を解決し `buildDeliveryExclusionsBlock` でブロックを生成して `buildInitialMessage` に渡す

### code-review.ts

- [ ] `buildCodeReviewInitialMessage` の `opts` に省略可能フィールド `deliveryExclusionsBlock?: string` を追加する
- [ ] メッセージ内（constraintsSection の後）に `deliveryExclusionsBlock` を挿入する
- [ ] `CodeReviewStep.buildMessage` で `resolveStagingExcludePatterns(deps.config)` を解決してブロックを生成・渡す

### conformance.ts

- [ ] `ConformanceStep.buildMessage` で `resolveStagingExcludePatterns(deps.config)` を解決する
- [ ] 非空の場合、メッセージ本文（Original request: セクションの前）に `buildDeliveryExclusionsBlock` の結果を挿入する

### custom-reviewer.ts

- [ ] `buildCustomReviewerMessage` の `opts` に省略可能フィールド `deliveryExclusionsBlock?: string` を追加する
- [ ] メッセージ内（constraintsSection の後）に挿入する
- [ ] `createCustomReviewerStep` / `buildMessage` で `resolveStagingExcludePatterns(deps.config)` を解決してブロックを生成・渡す

**Acceptance Criteria**:
- `stagingExcludePatterns: [".github/workflows/**"]` 設定下で、design / code-review / conformance / custom-reviewer の初期メッセージに "## Delivery exclusions" ブロックが含まれる
- `stagingExcludePatterns` が未設定（空配列）の場合、ブロックが挿入されない
- ブロック内にパターン文字列がリスト形式で含まれる（例: `- .github/workflows/**`）

---

## T-09: `renderPushCapabilityNotice` に worktree 除外フィルタを追加する

**対象ファイル**: `src/git/push-capability.ts`

- [ ] `renderPushCapabilityNotice` の第 3 引数に `worktreeExcludePatterns?: string[]` を追加する（省略可能）
- [ ] `predictedTouchedFiles` が渡されている場合（length > 0）、`matchUnpushablePaths` に渡す前に `matchesGlob` インラインフィルタで除外 path を除去する
- [ ] 関数 JSDoc に `worktreeExcludePatterns` の説明を追加する

**Acceptance Criteria**:
- `worktreeExcludePatterns` を指定した場合、一致する `predictedTouchedFiles` が advance warning から除かれる
- 引数を省略した場合（既存 caller）の動作が変わらない

---

## T-10: ユニットテスト — unpushable-path 判定の除外

**対象ファイル**: `src/git/__tests__/push-capability.test.ts`（新規）または既存テストファイルへの追加

- [ ] `collectPublishablePaths` のテスト:
  - GIVEN: worktree に `.github/workflows/x.yml` が dirty、`worktreeExcludePatterns: [".github/workflows/**"]`
  - WHEN: `collectPublishablePaths` を呼び出す
  - THEN: `.github/workflows/x.yml` が戻り値に含まれない

- [ ] commit 成分フィルタ非適用のテスト:
  - GIVEN: `.github/workflows/x.yml` が unpushed commit に含まれる、`worktreeExcludePatterns: [".github/workflows/**"]`
  - WHEN: `collectPublishablePaths` を呼び出す
  - THEN: `.github/workflows/x.yml` が戻り値に含まれる（commit 成分は除外されない）

- [ ] mixed reset した agent self-commit のテスト（worktree 成分に戻る → 除外対象）:
  - GIVEN: `.github/workflows/x.yml` が worktree dirty（git status に出現）かつ `worktreeExcludePatterns: [".github/workflows/**"]`
  - THEN: 戻り値に含まれない（mixed reset 後の worktree 成分は除外される）

**Acceptance Criteria**:
- 3 つのシナリオがすべて unit test で固定される
- `worktreeExcludePatterns` 省略時（既存挙動）のテストが壊れない

---

## T-11: ユニットテスト — `commitAndPush` / `commitScopedPaths` の除外

**対象ファイル**: `src/core/step/__tests__/commit-push-guarded-staging.test.ts` への追加、または新規テストファイル

- [ ] `commitAndPush` guarded 分岐のテスト:
  - GIVEN: `stagingExcludePatterns: [".github/workflows/**"]`、`.github/workflows/x.yml` が worktree dirty（`?? ` として git status に出現）
  - WHEN: `commitAndPush` を guarded step（implementer）として呼び出す
  - THEN: `UNPUSHABLE_PATH_BLOCKED` が throw されない

- [ ] `commitScopedPaths` のテスト:
  - 同条件で `commitScopedPaths` を呼び出しても `UNPUSHABLE_PATH_BLOCKED` が throw されない

- [ ] scoped 分岐 residual check のテスト:
  - GIVEN: `stagingExcludePatterns: [".github/workflows/**"]`、`.github/workflows/x.yml` が worktree dirty（untracked）
  - WHEN: `commitAndPush` を scoped step（design 等）として呼び出す
  - THEN: `WRITE_SCOPE_VIOLATION` が throw されない
  - AND: `restoreViolatedPaths` が呼ばれない（`git clean -f` されない）

- [ ] 非退行テスト — 非除外 dirty path は従来どおり violation になる:
  - GIVEN: `stagingExcludePatterns: [".github/workflows/**"]`、`vendor/x.js` が worktree dirty（除外対象外）
  - THEN: `WRITE_SCOPE_VIOLATION` が throw される

- [ ] 非退行テスト — 除外パターンが protected canon path に一致しても write-scope 違反検査は迂回されない

**Acceptance Criteria**:
- 5 つのシナリオがすべて unit test で固定される（受け入れ基準の指定シナリオを含む）

---

## T-12: ユニットテスト — Layer 1 と delivery exclusions block

**対象ファイル**: 新規テストファイル（e.g. `src/core/step/__tests__/exclusion-aware-validation.test.ts`）

- [ ] Layer 1 `validateStepOutputs` のテスト:
  - GIVEN: `excludeWorktreePatterns: [".github/workflows/**"]`、worktree に `.github/workflows/x.yml` が dirty
  - WHEN: `unpushable-path` 契約で `validateStepOutputs` を呼び出す
  - THEN: violations が空（violation を報告しない）

- [ ] `buildDeliveryExclusionsBlock` のテスト:
  - `patterns: []` → 空文字列を返す
  - `patterns: [".github/workflows/**"]` → "## Delivery exclusions" ブロックを含む文字列を返す
  - ブロックにパターンがリスト形式で含まれる

- [ ] design / code-review / conformance の初期メッセージに exclusions block が注入されることのテスト:
  - `resolveStagingExcludePatterns` が返すパターンを使って各 `buildMessage` / ビルダー関数を呼び出すと、"## Delivery exclusions" が含まれる
  - `stagingExcludePatterns` が空の場合、ブロックが含まれない

**Acceptance Criteria**:
- 各シナリオが unit test で固定される
- typecheck (`bun run typecheck`) が通る

---

## T-13: `docs/configuration.md` の更新

**対象ファイル**: `docs/configuration.md`

- [ ] 「Guarded staging containment」セクション（L412-443 付近）の説明を更新する
  - `pipeline.stagingExcludePatterns` の説明文を次の 2 層構造に整理する:
    - **Staging behavior（guarded steps のみ）**: 一致 path が guarded step の stage set から除去される（現行説明を維持）
    - **Delivery scope enforcement（pipeline 全体）**: Layer 1/2 unpushable-path 判定・scoped residual check・design/review の delivery context でも一致 path が除外される（新規追加）
  - 「All three settings affect GUARDED steps only」という記述を削除または修正する（`maxStagedFiles`・`maxStagedBytes` は guarded 専用のまま、`stagingExcludePatterns` の効力は pipeline 全体であることを明記）
- [ ] `pipeline.stagingExcludePatterns` のテーブル行の説明（L437 付近）を更新する
  - 現行: 「Guarded steps only.」
  - 更新後: 「Guarded steps のみに staging 適用。ただし unpushable-path 判定・scoped residual check・design/review の delivery scope は pipeline 全体に適用。」

**Acceptance Criteria**:
- `docs/configuration.md` の `stagingExcludePatterns` 記述が新契約（staging 適用 = guarded / 効力 = pipeline 全体）に更新されている
- `maxStagedFiles`・`maxStagedBytes` のテーブル行は「Guarded steps only」のまま変更されていない（非退行）

---

## T-14: typecheck / lint / test の green 確認

- [ ] `bun run typecheck` が error なしで通る
- [ ] `bun run test` が green（新規テストを含む）
- [ ] 既存テストへの非退行確認（`commit-push-guarded-staging.test.ts`、`staging-containment.test.ts` 等）
- [ ] architecture tests（存在する場合）が green

**Acceptance Criteria**:
- `bun run typecheck` exit 0
- `bun run test` exit 0（全テスト pass）

---

## T-15: integration test — reconcile が除外 path を破壊しない（TC-024 対応）

**対象ファイル**: `src/core/resume/__tests__/reconcile-worktree-exclusion.test.ts`（新規）または既存テストファイルへの追加

### 背景・実装根拠

`reconcileWorktreeArtifacts` は内部で `isReconcilableArtifact` を使い、**change-folder（`specrunner/changes/<slug>/`）配下のパスのみ**を reconcile 対象とする。`.github/workflows/**` や `vendor/**` 等の change-folder 外パスは `isReconcilableArtifact` の条件 1（`path.startsWith(folder + "/")` を満たさない）により自然に除外される。この充足は `stagingExcludePatterns` 設定に依存せず、かつ追加の実装変更を必要としない。

ただし、この充足が**仕様書・テストで明示的に保証されていない**ため、将来の `isReconcilableArtifact` 改修時に誤って壊される恐れがある。TC-024 の integration test を追加し、reconcile が除外 path を削除しないことを回帰テストとして固定する。

### タスク内容

- [ ] `isReconcilableArtifact(".github/workflows/ci.yml", "some-slug")` が `false` を返すことを unit test で確認する
  - GIVEN: `.github/workflows/ci.yml`（change-folder 外パス）、slug `"some-slug"`
  - THEN: `isReconcilableArtifact` が `false` を返す（reconcile 対象外）

- [ ] integration シナリオとして以下のテストを追加する（TC-024）:
  - GIVEN: `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、guarded step が `.github/workflows/ci.yml` を未追跡ファイルとして生成して worktree に保持している状態で job が halt する
  - WHEN: resume 時に `reconcileWorktreeArtifacts` が実行される
  - THEN: `.github/workflows/ci.yml` が `reconciled` リストに含まれない（削除されない）
  - AND: worktree に `.github/workflows/ci.yml` が引き続き存在する

- [ ] テストでは `quarantineAndRemoveMatching` への入力（`git status` の mock 出力）に除外 path が含まれることを確認した上で、`reconcileWorktreeArtifacts` の戻り値 `reconciled` が空であることをアサートする

**実装注記**:
- `isReconcilableArtifact` の修正は不要（既存実装が要件を充足している）
- テストは `isReconcilableArtifact` の分類ロジックを白箱テストとして固定するもの
- `reconcileWorktreeArtifacts` 全体の E2E test を書く場合は、`SpawnFn` を mock して `git status` 出力を制御すること

**Acceptance Criteria**:
- `isReconcilableArtifact(".github/workflows/ci.yml", "<slug>")` → `false` が unit test で確認されている
- `reconcileWorktreeArtifacts` が除外 path（change-folder 外）を `reconciled` に含めないことが test で固定されている
- `bun run typecheck` exit 0、`bun run test` exit 0（T-15 テストを含む）
