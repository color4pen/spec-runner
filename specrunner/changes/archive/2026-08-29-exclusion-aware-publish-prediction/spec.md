# Spec: exclusion-aware-publish-prediction

## Requirements

### Requirement: worktree 由来の除外 path は unpushable-path 判定でブロックされない

`stagingExcludePatterns` に一致する worktree dirty path は、Layer 1 / Layer 2 の unpushable-path 判定において publishable path 集合から除外される。その path を理由に `UNPUSHABLE_PATH_BLOCKED` を throw してはならない（SHALL NOT）。

unpushed commit 由来の同一 path は除外されず、従来どおり `UNPUSHABLE_PATH_BLOCKED` を引き起こす MUST がある。

#### Scenario: worktree dirty な除外 path が guarded step で UNPUSHABLE_PATH_BLOCKED を引き起こさない

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、`.github/workflows/ci.yml` が worktree dirty（untracked）な状態
**When** `commitAndPush` が guarded step（implementer）として実行される
**Then** `UNPUSHABLE_PATH_BLOCKED` が throw されない

#### Scenario: worktree dirty な除外 path が commitScopedPaths で UNPUSHABLE_PATH_BLOCKED を引き起こさない

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、`.github/workflows/ci.yml` が worktree dirty（untracked）な状態
**When** `commitScopedPaths` が呼び出される
**Then** `UNPUSHABLE_PATH_BLOCKED` が throw されない

#### Scenario: Layer 1 の follow-up 判定で除外 path が violation にならない

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、`.github/workflows/ci.yml` が worktree dirty な状態
**When** `validateStepOutputs` が `unpushable-path` 契約を評価する
**Then** violations が空であり、follow-up prompt が発行されない

#### Scenario: unpushed commit に含まれる除外 path は従来どおりブロックされる

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、`.github/workflows/ci.yml` が unpushed commit に含まれる（worktree は clean）
**When** `collectPublishablePaths` を呼び出す
**Then** `.github/workflows/ci.yml` が publishable path 集合に含まれ、`UNPUSHABLE_PATH_BLOCKED` が throw される

---

### Requirement: scoped step の residual check が除外 path を violation 扱いしない

`stagingExcludePatterns` に一致する worktree dirty path は、scoped step の residual check において violation・quarantine・restore の対象から除外される MUST がある。その path を理由に `WRITE_SCOPE_VIOLATION` を throw してはならない（SHALL NOT）。

#### Scenario: scoped step が除外 dirty path を残留違反として検出しない

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、guarded step が `.github/workflows/ci.yml` を未追跡ファイルとして生成した後、scoped step が実行される
**When** `commitAndPush` が scoped step として実行される
**Then** `WRITE_SCOPE_VIOLATION` が throw されない
**And** `.github/workflows/ci.yml` は worktree に保持される（`git clean -f` されない）

#### Scenario: 除外対象でない dirty path は従来どおり residual violation になる

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されており、`vendor/generated.js` が worktree dirty（`stagingExcludePatterns` に一致しない）
**When** scoped step の residual check が実行される
**Then** `vendor/generated.js` が `WRITE_SCOPE_VIOLATION` として検出される

#### Scenario: 除外パターンが protected canon path に一致しても write-scope 違反検査を迂回しない

**Given** `stagingExcludePatterns: ["specrunner/changes/**"]` が設定されており（保護 canon path と重複するパターン）
**When** scoped step 実行中に canon path が staged-modified な状態（`stagedOnly` に出現）
**Then** write-scope 違反として検出される（除外設定による迂回が発生しない）

---

### Requirement: 除外 path は worktree に保持されたまま後続 step へ進む

guarded step が `stagingExcludePatterns` に一致する未追跡ファイルを生成した場合、そのファイルは stage / commit / quarantine / `git clean` の対象とならない MUST がある。job が継続している限り worktree に保持される。

#### Scenario: E2E — guarded step が除外未追跡ファイルを生成し job が完了する

**Given** `stagingExcludePatterns: ["vendor/**"]` が設定されており、guarded step（implementer）が `vendor/generated.js` を生成する
**When** guarded commit → verification → scoped review → PR 作成まで進む
**Then** `vendor/generated.js` は commit されない
**And** `vendor/generated.js` は worktree 内に保持される
**And** unpushable-path violation にならない
**And** residual violation にならない
**And** job は halt せず完了する

---

### Requirement: design / review が除外 scope を delivery 判定に使う

`stagingExcludePatterns` が設定されている場合、design / code-review / conformance / custom-reviewer の初期メッセージには "Delivery exclusions" ブロックを含む MUST がある。これにより一致 path が commit に存在しないことを未実装・design 乖離として扱わない。

#### Scenario: design 初期メッセージに delivery exclusions block が注入される

**Given** `stagingExcludePatterns: [".github/workflows/**"]` が設定されている
**When** `DesignStep.buildMessage` が呼び出される
**Then** 返り値のメッセージに "## Delivery exclusions" セクションが含まれる
**And** セクション内に `- .github/workflows/**` がリスト形式で含まれる

#### Scenario: stagingExcludePatterns が未設定の場合 delivery exclusions block は含まれない

**Given** `stagingExcludePatterns` が未設定（または空配列）
**When** `DesignStep.buildMessage` / `CodeReviewStep.buildMessage` などが呼び出される
**Then** 返り値のメッセージに "## Delivery exclusions" セクションが含まれない

---

### Requirement: `collectPublishablePaths` は worktree 成分のみに除外を適用する

`collectPublishablePaths` は `worktreeExcludePatterns` が渡された場合、worktree 成分（git status 由来）のみにフィルタを適用し、unpushed-commit 成分（git rev-list 由来）には適用しない MUST がある。

#### Scenario: worktree 成分の除外 path がフィルタされる

**Given** `worktreeExcludePatterns: [".github/workflows/**"]` を指定し、`.github/workflows/ci.yml` が worktree dirty
**When** `collectPublishablePaths` を呼び出す
**Then** `.github/workflows/ci.yml` が戻り値に含まれない

#### Scenario: unpushed-commit 成分の path はフィルタされない

**Given** `worktreeExcludePatterns: [".github/workflows/**"]` を指定し、`.github/workflows/ci.yml` が unpushed commit に含まれる（worktree は clean）
**When** `collectPublishablePaths` を呼び出す
**Then** `.github/workflows/ci.yml` が戻り値に含まれる
