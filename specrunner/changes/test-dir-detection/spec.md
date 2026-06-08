# Spec: test-dir-detection

## Requirements

### Requirement: test-coverage は test ファイルをプロジェクト全体から命名規約で収集する

`src/core/verification/test-coverage.ts` の `runTestCoveragePhase(slug, cwd)` は、TC ID の grep 対象を
収集する際、`cwd`（プロジェクトルート）から再帰的に走査し、ファイル名が `.test.ts` または `.spec.ts` で
終わるファイルを収集 MUST する。収集を `tests/` ディレクトリ配下に限定 MUST NOT する。
収集対象に存在しない must TC ID は missing として報告する（既存挙動）。

#### Scenario: collocated test（tests/ 外）が収集される

**Given** `src/feature/foo.test.ts` に must TC の TC ID と assertion が記載されている（`tests/` ディレクトリは存在しない）
**When** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**Then** その TC ID は `foundTcIds` に含まれ、`status` は `"passed"`

#### Scenario: .spec.ts 拡張子が収集される

**Given** `src/feature/foo.spec.ts` に must TC の TC ID と assertion が記載されている
**When** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**Then** その TC ID は `foundTcIds` に含まれる

#### Scenario: tests/ 配下の配置が引き続き収集される（後方互換）

**Given** must TC の TC ID と assertion が `tests/unit/foo.test.ts` に記載されている
**When** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**Then** その TC ID は `foundTcIds` に含まれ、`status` は `"passed"`

### Requirement: test-coverage の走査は vendored / 生成ディレクトリを除外する

test ファイル収集の再帰走査は、ディレクトリ名が `node_modules` / `dist` / `.git` に一致するものを
SHALL 枝刈り（降りずに skip）する。これらの配下にある `.test.ts` / `.spec.ts` は収集対象に MUST NOT 含める。

#### Scenario: node_modules 配下の test ファイルは収集されない

**Given** must TC の TC ID が `node_modules/pkg/x.test.ts` にのみ出現し、プロジェクトの test ファイルには出現しない
**When** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**Then** その TC ID は `missingTcIds` に含まれ、`status` は `"failed"`

### Requirement: implementer プロンプトは test を固定 tests/ ディレクトリへ誘導しない

`src/prompts/implementer-system.ts` の `IMPLEMENTER_SYSTEM_PROMPT` は、test 配置についてプロジェクトの
既存 test 配置パターンに従う旨を SHALL 指示し、`tests/` 配下という固定パスで test を書くよう指示
MUST NOT する。verification step の説明はプロジェクト内の `*.test.ts` / `*.spec.ts` に対する grep として
記述する。

#### Scenario: implementer プロンプトに tests/ 固定 grep の記述がない

**Given** ビルド済みの `IMPLEMENTER_SYSTEM_PROMPT`
**When** その内容を検査する
**Then** 「`tests/` 配下に対する grep」という固定パス表現を含まず、既存 test 配置に従う旨のガイダンスを含む

### Requirement: test-case-gen プロンプトは固定 tests/ ディレクトリを参照しない

`src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_SYSTEM_PROMPT` の TC ID downstream 参照の記述は、
verification step がプロジェクトの test ファイルを grep する旨を SHALL 記述し、固定の `tests/` ディレクトリを
MUST NOT 名指しする。

#### Scenario: test-case-gen プロンプトに tests/ 固定 grep の記述がない

**Given** ビルド済みの `TEST_CASE_GEN_SYSTEM_PROMPT`
**When** その内容を検査する
**Then** `greps \`tests/\`` のような固定パス表現を含まない
