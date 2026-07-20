# Test Cases: エラー処方の整合

## Summary

- **Total**: 21 cases
- **Automated** (unit/integration): 20
- **Manual**: 1
- **Priority**: must: 17, should: 4, could: 0

---

### TC-001: git repo 内で origin が未設定のとき hint が git remote add を示す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: origin 不在の停止処方は `git remote add` を示す > Scenario: git repo 内で origin が未設定

---

### TC-002: 真の非 git repo 経路は変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: origin 不在の停止処方は `git remote add` を示す > Scenario: 真の非 git repo 経路は変わらない

---

### TC-003: 全 hint の specrunner 参照がレジストリと一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が処方する全 hint は実在コマンドのみを案内する > Scenario: 全 hint の specrunner 参照がレジストリと一致する

---

### TC-004: 架空コマンドの混入を検出する（破壊確認）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が処方する全 hint は実在コマンドのみを案内する > Scenario: 架空コマンドの混入を検出する（破壊確認）

---

### TC-005: local-state-writable は廃止コマンドを処方しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が処方する全 hint は実在コマンドのみを案内する > Scenario: local-state-writable は廃止コマンドを処方しない

---

### TC-006: 必要ディレクトリ欠損時の hint が specrunner init を第一処方にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: workflow-structure の欠損は `specrunner init` を第一処方にする > Scenario: 必要ディレクトリ欠損

---

### TC-007: token 不在の hint が specrunner login を第一処方にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: token 系 hint は `specrunner login` に一本化する > Scenario: token 不在

---

### TC-008: 作成者相当の fail 集合に対し next steps が正順で出力される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor human 出力は fail 集合から導出した next steps を末尾に示す > Scenario: 作成者相当の fail 集合

---

### TC-009: 参加者相当の fail 集合に対し next steps が正順で出力される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor human 出力は fail 集合から導出した next steps を末尾に示す > Scenario: 参加者相当の fail 集合

---

### TC-010: fail ゼロのとき next steps が出力されず JSON 構造が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: doctor human 出力は fail 集合から導出した next steps を末尾に示す > Scenario: fail ゼロと JSON 不変

---

### TC-011: XDG 隔離下で config-file-exists が pass する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: config-file-exists は getConfigPath と同一の解決規則で config パスを求める > Scenario: XDG 隔離下で init 後に pass する

---

### TC-012: パス固定へ戻すと XDG テストが落ちる（破壊確認）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: config-file-exists は getConfigPath と同一の解決規則で config パスを求める > Scenario: パス固定へ戻すと落ちる（破壊確認）

---

### TC-013: doctor --help が usage と --json の記載を表示する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: doctor --help は usage を表示する > Scenario: doctor --help

---

### TC-014: 認証系 stderr で specrunner login を処方し元 stderr を保持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git fetch の認証失敗は login を処方し元 stderr を保持する > Scenario: 認証系 stderr

---

### TC-015: 非認証系 stderr で現行文字列と同一のメッセージを返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: git fetch の認証失敗は login を処方し元 stderr を保持する > Scenario: 非認証系 stderr（回帰防止）

---

### TC-016: README に既存プロジェクト参加者手順が存在する

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: README に既存プロジェクト参加者手順を記載する > Scenario: README 参加者手順

---

### TC-017: originNotConfiguredError の error code と exit code が現行と同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `originNotConfiguredError()` を呼び出す
**WHEN** 返される `SpecRunnerError` の code と exit code を検査する
**THEN** `code` が `NOT_GIT_REPO` であり、exit code が `2`（`ARG_ERROR`）であり、`notGitRepoError()` が返す code・exit code と一致する

---

### TC-018: github-token-present と github-token-valid が両方 fail しても next steps の specrunner login が 1 回のみ

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** fail 集合が `github-token-present` と `github-token-valid` の両方を含む `DoctorResult[]` を用意する
**WHEN** `deriveNextSteps(results)` を呼び出す
**THEN** 返される配列中に `specrunner login` を含む項目がちょうど 1 つだけ存在する

---

### TC-019: describeGitFetchFailure が各認証パターンを個別に認識する

**Category**: unit
**Priority**: should
**Source**: design.md > D5

**GIVEN** stderr が以下のパターンのいずれか 1 つを含む（大小文字無視）:
  - `"could not read Username"`
  - `"Authentication failed"`
  - `"terminal prompts disabled"`
  - `"Invalid username or password"`
**WHEN** `describeGitFetchFailure(exitCode, stderr)` を呼び出す
**THEN** 各パターンで返り値の第一文が `specrunner login` を含み、元の stderr テキストが詳細として含まれる

---

### TC-020: doctor --help が "No detailed help available." を表示しない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `specrunner doctor --help` を実行する
**WHEN** 標準出力を取得する
**THEN** 出力に `"No detailed help available."` が含まれない

---

### TC-021: XDG_CONFIG_HOME 設定下で doctor.ts 経由の config-file-exists が pass する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `XDG_CONFIG_HOME` を一時ディレクトリに設定し、`getConfigPath()` が返すパスに `config.json` を作成する
**WHEN** `src/cli/doctor.ts` の ctx 組み立てを経由して `config-file-exists` check を実行する
**THEN** check の status が `"pass"` である（`homeDir/.config/...` 固定では pass しない環境での end-to-end 検証）

---

## Result

```yaml
result: completed
total: 21
automated: 20
manual: 1
must: 17
should: 4
could: 0
blocked_reasons: []
```
