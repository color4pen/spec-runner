# Test Cases: test-dir-detection

## Summary

- **Total**: 15 cases
- **Automated** (unit/integration): 13
- **Manual**: 2
- **Priority**: must: 11, should: 3, could: 1

---

### TC-001: collocated test（tests/ 外）が収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は test ファイルをプロジェクト全体から命名規約で収集する > Scenario: collocated test（tests/ 外）が収集される

---

### TC-002: .spec.ts 拡張子が収集される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は test ファイルをプロジェクト全体から命名規約で収集する > Scenario: .spec.ts 拡張子が収集される

---

### TC-003: tests/ 配下の配置が引き続き収集される（後方互換）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage は test ファイルをプロジェクト全体から命名規約で収集する > Scenario: tests/ 配下の配置が引き続き収集される（後方互換）

---

### TC-004: node_modules 配下の test ファイルは収集されない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-coverage の走査は vendored / 生成ディレクトリを除外する > Scenario: node_modules 配下の test ファイルは収集されない

---

### TC-005: implementer プロンプトに tests/ 固定 grep の記述がない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer プロンプトは test を固定 tests/ ディレクトリへ誘導しない > Scenario: implementer プロンプトに tests/ 固定 grep の記述がない

---

### TC-006: test-case-gen プロンプトに tests/ 固定 grep の記述がない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-case-gen プロンプトは固定 tests/ ディレクトリを参照しない > Scenario: test-case-gen プロンプトに tests/ 固定 grep の記述がない

---

### TC-007: dist/ 配下の test ファイルは収集されない

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-04

**GIVEN** must TC の TC ID が `dist/foo.test.ts` にのみ出現し、プロジェクトの test ファイルには出現しない
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** その TC ID は `missingTcIds` に含まれ、`status` は `"failed"`

---

### TC-008: .git/ 配下の test ファイルは収集されない

**Category**: unit
**Priority**: should
**Source**: design.md > D3 / tasks.md > T-04

**GIVEN** must TC の TC ID が `.git/blob.test.ts` にのみ出現し、プロジェクトの test ファイルには出現しない
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** その TC ID は `missingTcIds` に含まれ、`status` は `"failed"`

---

### TC-009: 枝刈り名に部分一致するだけのディレクトリ（dist-tests 等）は走査される

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** must TC の TC ID が `dist-tests/foo.test.ts` に記載されている
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** その TC ID は `foundTcIds` に含まれ、`status` は `"passed"`

---

### TC-010: 走査対象ルートが存在しない場合は空配列を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `rootDir` に存在しないディレクトリパスを与えて `collectProjectTestFiles` を呼ぶ
**WHEN** 関数が実行される
**THEN** 例外を投げず空配列 `[]` を返す

---

### TC-011: IMPLEMENTER_SYSTEM_PROMPT に既存 test 配置パターンに従う旨のガイダンスが含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** ビルド済みの `IMPLEMENTER_SYSTEM_PROMPT`
**WHEN** その内容を検査する
**THEN** プロジェクトの既存 test の配置パターンに従う旨（具体ディレクトリを指定せず agent が判断する）のガイダンスが含まれる

---

### TC-012: test-coverage.ts に path.join(cwd, "tests") の固定参照が残っていない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** 変更後の `src/core/verification/test-coverage.ts`
**WHEN** ソースを静的検査する
**THEN** `path.join(cwd, "tests")` / `path.join(rootDir, "tests")` 等の `tests/` 固定パス参照が存在しない

---

### TC-013: source ファイル（.ts 非テスト）にのみ TC ID が含まれる場合は missing になる

**Category**: unit
**Priority**: could
**Source**: design.md > D2

**GIVEN** must TC の TC ID が `src/feature/foo.ts`（非テストファイル）のコメントにのみ出現し、`*.test.ts` / `*.spec.ts` には出現しない
**WHEN** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**THEN** その TC ID は `missingTcIds` に含まれ、`status` は `"failed"`

---

### TC-014: bun run typecheck && bun run test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 変更が実装されたリポジトリ
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** エラーなく完了する

---

### TC-015: bun run lint が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** 変更が実装されたリポジトリ
**WHEN** `bun run lint` を実行する
**THEN** エラーなく完了する

---

## Result

```yaml
result: completed
total: 15
automated: 13
manual: 2
must: 11
should: 3
could: 1
blocked_reasons: []
```
