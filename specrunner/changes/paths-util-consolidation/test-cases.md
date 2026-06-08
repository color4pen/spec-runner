# Test Cases: CLI のパス直書きを util/paths.ts に統一する

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 7
- **Manual**: 4
- **Priority**: must: 9, should: 2, could: 0

---

### TC-001: init の drafts ディレクトリ構築

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init / archive のパス構築は util/paths.ts の関数経由で行う > Scenario: init の drafts ディレクトリ構築

---

### TC-002: init の changes ディレクトリ構築

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init / archive のパス構築は util/paths.ts の関数経由で行う > Scenario: init の changes ディレクトリ構築

---

### TC-003: archive ディレクトリの列挙パス構築

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init / archive のパス構築は util/paths.ts の関数経由で行う > Scenario: archive ディレクトリの列挙パス構築

---

### TC-004: archive 内 request.md のパス構築

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: init / archive のパス構築は util/paths.ts の関数経由で行う > Scenario: archive 内 request.md のパス構築

---

### TC-005: パスリテラル直書きが残らない

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: init / archive のパス構築は util/paths.ts の関数経由で行う > Scenario: パスリテラル直書きが残らない

---

### TC-006: path import が除去されないこと

**Category**: manual
**Priority**: must
**Source**: design.md > D3: import は最小追加・既存行へ集約する

**GIVEN** `src/cli/init.ts` と `src/cli/archive.ts` に `paths.ts` 関数の置換が適用された状態
**WHEN** 両ファイルの `import path from` 行を確認する
**THEN** どちらのファイルにも `import path from "node:path"` が残存しており、`path.join` が引き続き使われている

---

### TC-007: typecheck が pass する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03: 検証

**GIVEN** `src/cli/init.ts` と `src/cli/archive.ts` の置換が完了した状態
**WHEN** `bun run typecheck` を実行する
**THEN** エラーなしで終了する（exit code 0）

---

### TC-008: 既存テストが regression しない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03: 検証

**GIVEN** `src/cli/init.ts` と `src/cli/archive.ts` の置換が完了した状態
**WHEN** `bun run test` を実行する
**THEN** 全テストが pass する（特に `tests/init.test.ts` の drafts / changes ディレクトリ生成検証が green）

---

### TC-009: lint が pass する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03: 検証

**GIVEN** `src/cli/init.ts` と `src/cli/archive.ts` の置換が完了した状態
**WHEN** `bun run lint` を実行する（`--max-warnings 0`）
**THEN** warning / error なしで終了する（exit code 0）

---

### TC-010: runInit のシグネチャ・exit code・制御フロー不変

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01: Acceptance Criteria

**GIVEN** 置換前後の `src/cli/init.ts` を比較する
**WHEN** `runInit` の関数シグネチャ・git repo 判定スキップ挙動・`fs.mkdir` の `{ recursive: true }` オプション・exit code 分岐を確認する
**THEN** パス構築 4 行（import 追加含む）以外に差分がなく、制御フロー・インターフェースが完全一致している

---

### TC-011: runArchive の制御フロー・例外処理・exit code 不変

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-02: Acceptance Criteria

**GIVEN** 置換前後の `src/cli/archive.ts` を比較する
**WHEN** `runArchive` の `archivePaths.find(...)` 行・`parseRequestMd` 呼び出し・try/catch フォールバック構造・`baseBranch` 解決ロジック・exit code 分岐を確認する
**THEN** パス構築 2 行と import 行以外に差分がなく、制御フロー・例外処理・インターフェースが完全一致している

---

## Result

```yaml
result: completed
total: 11
automated: 7
manual: 4
must: 9
should: 2
could: 0
blocked_reasons: []
```
