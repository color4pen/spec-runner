# Test Cases: detectPackageManager の lockfile 上位探索と lockfile root の PATH 反映

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 20
- **Manual**: 0
- **Priority**: must: 11, should: 7, could: 2

---

### TC-001: cwd に lockfile がある（後方互換）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する > Scenario: cwd に lockfile がある（後方互換）

---

### TC-002: cwd に lockfile が無く親ディレクトリにある

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する > Scenario: cwd に lockfile が無く親ディレクトリにある

---

### TC-003: git root を超えて探索しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する > Scenario: git root を超えて探索しない

---

### TC-004: git root 自身に lockfile がある

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する > Scenario: git root 自身に lockfile がある

---

### TC-005: git worktree の .git ファイルでも停止する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する > Scenario: git worktree の .git ファイルでも停止する

---

### TC-006: lockfile が一切無い（npm fallback）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する > Scenario: lockfile が一切無い（npm fallback）

---

### TC-007: 親ディレクトリの lockfile を見つけた場合の root

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detectPackageManager は { pm, root } を返す > Scenario: 親ディレクトリの lockfile を見つけた場合の root

---

### TC-008: lockfile 不在時の root は cwd

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detectPackageManager は { pm, root } を返す > Scenario: lockfile 不在時の root は cwd

---

### TC-009: root が cwd と異なる場合は両方を PATH に含める

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spawnCommand は lockfile root の node_modules/.bin を PATH に含める > Scenario: root が cwd と異なる場合は両方を PATH に含める

---

### TC-010: root 省略時は cwd のみ（後方互換）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spawnCommand は lockfile root の node_modules/.bin を PATH に含める > Scenario: root 省略時は cwd のみ（後方互換）

---

### TC-011: monorepo の verification command が root の .bin を解決できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: verification commands 経路は検出した lockfile root を PATH に渡す > Scenario: monorepo の verification command が root の .bin を解決できる

---

### TC-012: 単一パッケージプロジェクトの worktree install（後方互換）

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 既存呼び出し元は { pm } で PM を取得する（後方互換） > Scenario: 単一パッケージプロジェクトの worktree install（後方互換）

---

### TC-013: 単一パッケージプロジェクトの doctor（後方互換）

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 既存呼び出し元は { pm } で PM を取得する（後方互換） > Scenario: 単一パッケージプロジェクトの doctor（後方互換）

---

### TC-014: lockfile の固定優先順序が適用される

**Category**: unit
**Priority**: must
**Source**: design.md > D1

**GIVEN** `cwd` に `pnpm-lock.yaml` と `package-lock.json` が共存する
**WHEN** `detectPackageManager(cwd)` を呼ぶ
**THEN** `pm` は `"pnpm"` を返す（`pnpm-lock.yaml` が優先される）

---

### TC-015: filesystem root 到達で停止する

**Category**: unit
**Priority**: should
**Source**: design.md > D1

**GIVEN** `.git` が一切存在しないディレクトリ階層（filesystem root まで）で lockfile も無い
**WHEN** `detectPackageManager(cwd)` を呼ぶ
**THEN** 無限ループせず `{ pm: "npm", root: cwd }` を返す

---

### TC-016: root === cwd のとき PATH に重複付与しない

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** `spawnCommand(command, cwd, env, cwd)` を `root === cwd` で呼ぶ
**WHEN** コマンドを実行する
**THEN** 子プロセスの `PATH` に `cwd/node_modules/.bin` が重複せず 1 回だけ含まれる

---

### TC-017: packageManager フィールドは cwd の package.json のみ参照する

**Category**: unit
**Priority**: should
**Source**: design.md > D1, tasks.md > T-01

**GIVEN** cwd から git root までに lockfile が無く、git root の `package.json` に `packageManager: "yarn"` が含まれ、cwd の `package.json` には `packageManager` フィールドが無い
**WHEN** `detectPackageManager(cwd)` を呼ぶ
**THEN** `pm` は git root の `package.json` を参照せず `"npm"` fallback になる

---

### TC-018: PATH の結合順序が cwd/.bin → root/.bin → 元の PATH となる

**Category**: unit
**Priority**: must
**Source**: design.md > D3

**GIVEN** `env.PATH = "/usr/bin"` で `spawnCommand(command, cwd, env, root)` を `root !== cwd` で呼ぶ
**WHEN** コマンドを実行する
**THEN** 子プロセスの `PATH` が `${cwd}/node_modules/.bin:${root}/node_modules/.bin:/usr/bin` の順になる

---

### TC-019: verification runner phase 経路が { pm } 分解で run コマンドを導出する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `verification.phases` が設定された worktree cwd で、lockfile から pnpm が検出される
**WHEN** `runVerificationPhases` が各フェーズを実行する
**THEN** `runCommand("pnpm")` で導出されたコマンド（例: `pnpm run <script>`）で実行される

---

### TC-020: worktree manager DI 引数（PackageManager を返す stub）が無改修で通る

**Category**: unit
**Priority**: could
**Source**: design.md > D5, tasks.md > T-04

**GIVEN** `createWorktreeManager` に `detectPmFn: async () => "bun"` を DI する
**WHEN** `create()` が install を実行する
**THEN** `bun install --frozen-lockfile` が呼ばれ、型エラーが発生しない

---

## Result

```yaml
result: completed
total: 20
automated: 20
manual: 0
must: 11
should: 7
could: 2
blocked_reasons: []
```
