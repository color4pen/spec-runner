# Test Cases: workspace セットアップの config 駆動化と言語非依存化

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 29
- **Manual**: 1
- **Priority**: must: 25, should: 5, could: 0

---

## Spec Scenario 由来

### TC-001: setup コマンドが worktree 作成後に実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: workspace setup コマンドは config で指定でき worktree 作成後に実行される > Scenario: setup コマンドが worktree 作成後に実行される

---

### TC-002: setup コマンドは配列順に fail-fast で実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: workspace setup コマンドは config で指定でき worktree 作成後に実行される > Scenario: setup コマンドは配列順に fail-fast で実行される

---

### TC-003: 非 JS / greenfield プロジェクトが無設定で通る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setup 未指定かつ JS 依存管理の痕跡が無いとき install をスキップして成功する > Scenario: 非 JS / greenfield プロジェクトが無設定で通る

---

### TC-004: JS + lockfile プロジェクトが従来どおり install する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setup 未指定かつ痕跡があるとき従来の install を実行する > Scenario: JS + lockfile プロジェクトが従来どおり install する

---

### TC-005: 空配列は明示的なスキップとして機能する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setup を空配列で明示すると install をスキップする > Scenario: 空配列は明示的なスキップとして機能する

---

### TC-006: setup コマンド失敗時に worktree が除去される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: setup / install の失敗時は worktree を後片づけして throw する > Scenario: setup コマンド失敗時に worktree が除去される

---

## hasJsDependencyTraces (T-02)

### TC-007: lockfile があるとき true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** repoRoot に `pnpm-lock.yaml` が存在する（`existsSync` stub 注入）
**WHEN** `hasJsDependencyTraces(repoRoot, stub)` を呼ぶ
**THEN** `true` を返す

---

### TC-008: lockfile は無く package.json のみ存在するとき true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** repoRoot に lockfile は無いが `package.json` が存在する（`existsSync` stub）
**WHEN** `hasJsDependencyTraces(repoRoot, stub)` を呼ぶ
**THEN** `true` を返す

---

### TC-009: lockfile も package.json も無いとき false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** repoRoot に lockfile も `package.json` も存在しない（`existsSync` stub）
**WHEN** `hasJsDependencyTraces(repoRoot, stub)` を呼ぶ
**THEN** `false` を返す

---

### TC-010: LOCKFILE_MAP の全 lockfile 種別を認識する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** repoRoot に `bun.lock` / `yarn.lock` / `package-lock.json` をそれぞれ配置したケースを個別に用意する（`existsSync` stub）
**WHEN** 各ケースで `hasJsDependencyTraces(repoRoot, stub)` を呼ぶ
**THEN** すべてのケースで `true` を返す

---

## resolveWorkspaceSetupPlan (T-03)

### TC-011: string コマンドが commands plan に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `setup = ["uv sync"]`、`hasJsTraces = false`
**WHEN** `resolveWorkspaceSetupPlan(setup, hasJsTraces)` を呼ぶ
**THEN** `{ kind: "commands", commands: [{ run: "uv sync" }] }` を返す（`name` は undefined）

---

### TC-012: 空配列が commands plan（コマンド 0 件）に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `setup = []`、`hasJsTraces = true`
**WHEN** `resolveWorkspaceSetupPlan(setup, hasJsTraces)` を呼ぶ
**THEN** `{ kind: "commands", commands: [] }` を返す（`detect-install` にならない）

---

### TC-013: undefined + 痕跡ありが detect-install に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `setup = undefined`、`hasJsTraces = true`
**WHEN** `resolveWorkspaceSetupPlan(setup, hasJsTraces)` を呼ぶ
**THEN** `{ kind: "detect-install" }` を返す

---

### TC-014: undefined + 痕跡なしが skip に解決される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `setup = undefined`、`hasJsTraces = false`
**WHEN** `resolveWorkspaceSetupPlan(setup, hasJsTraces)` を呼ぶ
**THEN** `{ kind: "skip" }` を返す

---

### TC-015: object コマンドが name / run を保持して normalize される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `setup = [{ name: "deps", run: "go mod download" }]`、`hasJsTraces = false`
**WHEN** `resolveWorkspaceSetupPlan(setup, hasJsTraces)` を呼ぶ
**THEN** `{ kind: "commands", commands: [{ name: "deps", run: "go mod download" }] }` を返す

---

## config schema (T-01)

### TC-016: workspace.setup に string コマンドを指定した config が validateConfig を通る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** config に `workspace.setup = ["uv sync"]` を含む
**WHEN** `validateConfig` を呼ぶ
**THEN** validation が成功し、`workspace.setup` が解析される

---

### TC-017: workspace.setup に object コマンドを指定した config が validateConfig を通る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** config に `workspace.setup = [{ name: "deps", run: "go mod download" }]` を含む
**WHEN** `validateConfig` を呼ぶ
**THEN** validation が成功する

---

### TC-018: run フィールド欠落の workspace.setup で CONFIG_INVALID が返る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** config に `workspace.setup = [{ name: "only-name" }]`（`run` フィールドなし）を含む
**WHEN** `validateConfig` を呼ぶ
**THEN** `CONFIG_INVALID` エラーが返り、エラーパスに `workspace.setup[0]` が含まれる

---

### TC-019: workspace フィールド未指定の既存 config が後方互換で通る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `workspace` フィールドを含まない既存の config
**WHEN** `validateConfig` を呼ぶ
**THEN** validation が成功し、既存の挙動が変わらない

---

### TC-020: VerificationCommand が ShellCommand の alias として既存テストを壊さない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 / design.md > D1

**GIVEN** `VerificationCommand` が `ShellCommand` の alias に変更されている
**WHEN** `bun run typecheck` を実行する
**THEN** 既存の `verification.commands` スキーマのバリデーション挙動が不変で、型チェックが pass する

---

## manager.create() (T-04)

### TC-021: plan 省略時は detect-install（後方互換）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D2

**GIVEN** `create(repoRoot, slug, jobId, baseRef)` と plan 引数を渡さない呼び出し（既存テストパターン）
**WHEN** `git worktree add` が成功する
**THEN** `detectPm` + `installCommand` が従来どおり呼ばれ、既存テストが無改修で green になる

---

### TC-022: { kind: "commands" } で sh -c が worktreePath cwd で実行される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D5

**GIVEN** `plan = { kind: "commands", commands: [{ run: "go mod download" }] }`
**WHEN** `git worktree add` が成功する
**THEN** `spawn("sh", ["-c", "go mod download"], { cwd: worktreePath })` が呼ばれ、`detectPm` ベース install は呼ばれない

---

### TC-023: commands 経路のコマンド失敗時に cleanup とラベル付きエラーが発生する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D5

**GIVEN** `plan = { kind: "commands", commands: [{ name: "setup", run: "false" }] }` でコマンドが exit 1 を返す
**WHEN** コマンドが失敗する
**THEN** `git worktree remove --force` + `rm` が呼ばれ、ラベル `"setup"` と exit code `1` を含むエラーが throw される

---

### TC-024: { kind: "skip" } で install も commands も実行されず worktreePath が返る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 / design.md > D2

**GIVEN** `plan = { kind: "skip" }`
**WHEN** `git worktree add` が成功する
**THEN** `spawn` が install / setup で一切呼ばれず、`worktreePath` が返される

---

## LocalRuntime (T-05)

### TC-025: workspaceSetup 注入時に commands plan が manager.create の末尾引数として渡る

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D6

**GIVEN** `LocalRuntime` に `workspaceSetup = ["uv sync"]` を渡す。repoRoot に lockfile が存在する
**WHEN** run 経路で `setupWorkspace()` を呼ぶ
**THEN** `manager.create` の末尾引数が `{ kind: "commands", commands: [{ run: "uv sync" }] }` になる

---

### TC-026: workspaceSetup 未注入かつ痕跡ありで detect-install plan が渡る

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 / design.md > D6

**GIVEN** `LocalRuntime` に `workspaceSetup` を渡さない。repoRoot に `bun.lock` が存在する
**WHEN** run 経路で `setupWorkspace()` を呼ぶ
**THEN** `manager.create` の末尾引数が `{ kind: "detect-install" }` になる

---

### TC-027: mock manager を持つ既存 LocalRuntime テストが plan 引数追加後も green

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `create` が plan 引数なしで stub されている既存の `LocalRuntime` テスト群
**WHEN** `bun run test` を実行する
**THEN** 既存テストが無改修で pass する（optional 末尾引数が型・挙動を壊さない）

---

## factory (T-06)

### TC-028: config.workspace.setup が LocalRuntime に配線される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06 / design.md > D6

**GIVEN** config に `workspace.setup = ["uv sync"]` を含む、local runtime 経路
**WHEN** `createRuntime(config, ...)` を呼ぶ
**THEN** 生成された `LocalRuntime` の `workspaceSetup` が `["uv sync"]` に設定される。managed runtime 経路は変更なし

---

## 型パリティ (T-07)

### TC-029: WorkspaceConfig / ShellCommand の型アサーションが typecheck を通る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 / design.md > D1

**GIVEN** `schema-type-parity.test-d.ts` に `WorkspaceConfig` / `ShellCommand` の型アサーションが追加されている
**WHEN** `bun run typecheck` を実行する
**THEN** すべての型アサーションが pass し、schema と interface の `workspace` 形状が構造的に一致することが型レベルで固定される

---

## 自己ホスト smoke (manual)

### TC-030: spec-runner 自身が変更後も worktree セットアップで依存 install できる

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準 / tasks.md > T-08

**GIVEN** spec-runner 自身のリポジトリ（`bun.lock` あり、`workspace.setup` 未指定）で job を実行する
**WHEN** local runtime が worktree セットアップを実行する
**THEN** `bun install --frozen-lockfile`（または相当コマンド）が実行され、verification が `node_modules` 欠如で落ちない

---

## Result

```yaml
result: completed
total: 30
automated: 29
manual: 1
must: 25
should: 5
could: 0
blocked_reasons: []
```
