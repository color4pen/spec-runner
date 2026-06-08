# Tasks: test-dir-detection

## T-01: test-coverage の test ファイル収集をプロジェクト全体スキャンに変更する

- [x] `src/core/verification/test-coverage.ts` の `getTestFiles(dir)` を、プロジェクトルートから
      test ファイルを収集する collector に作り替える（例: `collectProjectTestFiles(rootDir)`）。
  - 走査は既存同様 `node:fs/promises` の `readdir({ withFileTypes: true })` 再帰で行う
      （`bun:*` / `Bun.*` は使用しない）。
  - ファイル名が `.test.ts` または `.spec.ts` で終わるファイルのみ収集する（全 `.ts` を集めない）。
  - 走査中、ディレクトリ名が `node_modules` / `dist` / `.git` のものは降りずに skip（枝刈り）する。
      枝刈りは完全一致のみ（`dist-tests` 等は対象外）。
  - 走査対象ディレクトリが存在しない / 読めない場合は空配列を返す（既存の resilience を維持）。
- [x] `runTestCoveragePhase` の Step 3 を `const testsDir = path.join(cwd, "tests")` から
      `cwd`（プロジェクトルート）を起点とした収集に変更する。`tests/` ハードコードを除去する。
- [x] ファイル先頭の doc comment（「checks if each TC ID appears in at least one tests/*.ts file」）と
      `runTestCoveragePhase` の JSDoc（「Collect all .ts files under tests/」）を新挙動に合わせて更新する。
- [x] assertion 存在ゲート（`ASSERTION_RE`）と must TC 抽出（`extractMustTcIds`）のロジックは変更しない。
      収集対象ファイル集合のみが変わる。

**Acceptance Criteria**:
- `test-coverage.ts` に `path.join(cwd, "tests")` 固定の参照が残っていない。
- `runTestCoveragePhase` が `cwd` 全体から `*.test.ts` / `*.spec.ts` を収集して TC ID を grep する。
- `node_modules` / `dist` / `.git` 配下のファイルは収集されない。
- `tests/` 配下に test を置く構成では従来通り TC ID が検出される（後方互換）。

## T-02: implementer プロンプトから tests/ 固定パスを除去する

- [x] `src/prompts/implementer-system.ts` の verification step 説明（現 line 52 付近）
      「後続の verification step が `tests/` 配下に対する grep で TC ID の存在を機械的に検証する」を、
      固定パスを含まない表現（例: プロジェクト内の `*.test.ts` / `*.spec.ts` に対する grep で検証する）へ変更する。
- [x] test 配置に関するガイダンスを追記する: test の配置先はプロジェクトの既存 test の配置パターンに従う
      （具体ディレクトリは指定しない。既存 test の import パス・ディレクトリ構造を見て判断する）。
      既存の「テストフレームワークやモック方法はプロジェクトの既存テストに合わせる」と整合させる。

**Acceptance Criteria**:
- `IMPLEMENTER_SYSTEM_PROMPT` に「`tests/` 配下に対する grep」という固定パス表現が含まれない。
- `IMPLEMENTER_SYSTEM_PROMPT` に既存 test 配置パターンに従う旨のガイダンスが含まれる。

## T-03: test-case-gen プロンプトから tests/ 固定パスを除去する

- [x] `src/prompts/test-case-gen-system.ts` の TC ID downstream 参照記述（現 line 132 付近）
      「the verification step (which greps `tests/` for each must TC ID)」を、固定の `tests/` を名指ししない
      表現（例: which greps the project's test files (`*.test.ts` / `*.spec.ts`) for each must TC ID）へ変更する。
- [x] TC ID が一意かつ安定的に grep 可能であること、フラット `TC-{NNN}` 形式を正規形とする既存の記述は維持する。

**Acceptance Criteria**:
- `TEST_CASE_GEN_SYSTEM_PROMPT` に `greps \`tests/\`` のような固定パス表現が含まれない。
- TC ID の一意性・grep 可能性に関する既存ガイダンスは維持されている。

## T-04: 新挙動の unit test を追加する

- [x] `src/core/verification/test-coverage.ts` の挙動変更に対応する test を、プロジェクトの既存 test 配置
      パターンに従って追加する（spec-runner では既存 `test-coverage.test.ts` の拡張が自然）。
- [x] 追加するテストケース（test 関数名 / コメントに TC ID を必ず記載する）:
  - collocated test（`src/...feature.test.ts` を tempDir に配置、`tests/` ディレクトリ無し）の TC ID が found になる。
  - `.spec.ts` 拡張子の test ファイルの TC ID が found になる。
  - `tests/` 配下配置の TC ID が引き続き found になる（後方互換）。
  - `node_modules/` 配下にのみ TC ID がある場合は missing（除外確認）。`dist/` / `.git/` も同様に除外される。
- [x] 既存の TC-001〜TC-027 系および faithfulness gate テストが無改変で green を維持することを確認する
      （`tests/...` に `*.test.ts` fixture を書く既存テストは superset 走査で引き続き合致する）。

**Acceptance Criteria**:
- collocated / `.spec.ts` / 後方互換 / 除外（node_modules・dist・.git）の各シナリオを検証する test が存在する。
- 追加 test の関数名またはコメントに対応する TC ID が記載されている。

## T-05: 検証ゲートを green にする

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（既存 + 追加テスト）。
- [x] `bun run lint` が green。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- `bun run lint` が green。
