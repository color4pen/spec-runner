# Test Cases: env-seam-hygiene

## Summary

- **Total**: 44 cases
- **Automated** (unit/integration): 44
- **Manual**: 0
- **Priority**: must: 32, should: 12, could: 0

---

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details
-->

---

## T-01: `runPreflight()` の env パラメータ化

### TC-001: preflight.ts に process.env 文字列が残存しない

**Category**: unit
**Priority**: must
**Source**: T-01, tasks.md AC, request.md AC-1

**GIVEN** `src/core/preflight.ts` の修正が完了している
**WHEN** `grep "process\.env" src/core/preflight.ts` を実行する
**THEN** マッチ行が 0 件である

---

### TC-002: runPreflight シグネチャが required env パラメータを持つ

**Category**: unit
**Priority**: must
**Source**: T-01, design.md D1

**GIVEN** `src/core/preflight.ts` の修正が完了している
**WHEN** 関数シグネチャ `runPreflight` を確認する
**THEN** 第3引数 `env: Record<string, string | undefined>` が required（デフォルト値なし）で宣言されている

---

### TC-003: cli/run.ts caller が process.env を第3引数で明示渡し

**Category**: unit
**Priority**: must
**Source**: T-01, design.md D1

**GIVEN** `src/cli/run.ts` の修正が完了している
**WHEN** `runPreflight` の呼び出し箇所を確認する
**THEN** `runPreflight(absolutePath, cwd, process.env as Record<string, string | undefined>)` の形式で呼ばれている

---

### TC-004: preflight.ts 内部の 3 箇所が env パラメータを参照する

**Category**: unit
**Priority**: must
**Source**: T-01, tasks.md（L105/L121/L135-136）

**GIVEN** `src/core/preflight.ts` の修正が完了している
**WHEN** 関数本体を確認する
**THEN** `resolveGitHubToken(env)`、`checkRuntimePrereqs(config, env)`、`resolveSpecRunnerApiKey(env, ...)` の形式になっている
**AND** いずれの行にも `process.env` 文字列が存在しない

---

### TC-005: preflight テストが第3引数 `{}` を全呼び出しに追加している

**Category**: unit
**Priority**: must
**Source**: T-01, tasks.md

**GIVEN** `tests/core/preflight.test.ts` の修正が完了している
**WHEN** `runPreflight` の全呼び出しを確認する
**THEN** 全呼び出しに第3引数（`{}` 等）が存在する
**AND** 2 引数のみの呼び出しが存在しない

---

### TC-006: preflight テストスイートが green

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** T-01 の全修正が完了している
**WHEN** `bun run test tests/core/preflight.test.ts` を実行する
**THEN** exit code が 0 である

---

### TC-007: typecheck が preflight 修正後も green

**Category**: unit
**Priority**: must
**Source**: T-01 AC

**GIVEN** T-01 の全修正が完了している
**WHEN** `bun run typecheck` を実行する
**THEN** `preflight.ts` / `run.ts` に関する型エラーが存在しない

---

### TC-008: runPreflight に env={} を渡しても credential resolver が env を受け取る

**Category**: integration
**Priority**: should
**Source**: request.md AC-4（挙動不変）

**GIVEN** credential resolver が `vi.mock` で差し替えられているテスト環境
**WHEN** `runPreflight(path, cwd, {})` を呼び出す
**THEN** mock resolver が `env` 引数を受け取って呼ばれる
**AND** 型チェックが通過する

---

## T-02: `logPipelineDiag()` の env 読み取りを seam 関数に抽出

### TC-009: diagnostic.ts に process.env 文字列が残存しない

**Category**: unit
**Priority**: must
**Source**: T-02, request.md AC-1

**GIVEN** `src/core/lifecycle/diagnostic.ts` の修正が完了している
**WHEN** `grep "process\.env" src/core/lifecycle/diagnostic.ts` を実行する
**THEN** マッチ行が 0 件である

---

### TC-010: env-filter.ts に getDebugSubsystems が追加されている

**Category**: unit
**Priority**: must
**Source**: T-02, design.md D2

**GIVEN** `src/util/env-filter.ts` の修正が完了している
**WHEN** ファイル内のエクスポートを確認する
**THEN** `export function getDebugSubsystems(): string` が存在する
**AND** 関数本体が `process.env["SPECRUNNER_DEBUG"] ?? ""` を返す

---

### TC-011: diagnostic.ts が getDebugSubsystems を import して使う

**Category**: unit
**Priority**: must
**Source**: T-02

**GIVEN** `src/core/lifecycle/diagnostic.ts` の修正が完了している
**WHEN** import 文と L15 付近を確認する
**THEN** `import { getDebugSubsystems } from "../../util/env-filter.js"` が存在する
**AND** `const debugEnv = getDebugSubsystems()` の形式で呼ばれている

---

### TC-012: diagnostic テストが vi.mock で getDebugSubsystems を差し替える

**Category**: unit
**Priority**: must
**Source**: T-02, tasks.md

**GIVEN** `src/core/lifecycle/__tests__/diagnostic.test.ts` の修正が完了している
**WHEN** テストファイルを確認する
**THEN** `vi.mock("../../../util/env-filter.js", ...)` が存在し `getDebugSubsystems` がモック化されている
**AND** `process.env["SPECRUNNER_DEBUG"]` への直接代入が存在しない
**AND** beforeEach/afterEach での env 保存・復元ロジックが除去されている

---

### TC-013: diagnostic テストスイートが green

**Category**: unit
**Priority**: must
**Source**: T-02 AC

**GIVEN** T-02 の全修正が完了している
**WHEN** `bun run test src/core/lifecycle/__tests__/diagnostic.test.ts` を実行する
**THEN** exit code が 0 である

---

### TC-014: getDebugSubsystems が SPECRUNNER_DEBUG 未設定時に空文字を返す

**Category**: unit
**Priority**: should
**Source**: T-02, design.md D2

**GIVEN** `process.env["SPECRUNNER_DEBUG"]` が undefined である
**WHEN** `getDebugSubsystems()` を呼び出す
**THEN** 戻り値が `""` である

---

### TC-015: getDebugSubsystems が SPECRUNNER_DEBUG=pipeline 時に "pipeline" を含む文字列を返す

**Category**: unit
**Priority**: should
**Source**: T-02, 挙動不変

**GIVEN** `process.env["SPECRUNNER_DEBUG"]` が `"pipeline"` に設定されている
**WHEN** `getDebugSubsystems()` を呼び出す
**THEN** 戻り値が `"pipeline"` を含む

---

### TC-016: logPipelineDiag の pipeline フィルタ挙動が不変

**Category**: unit
**Priority**: should
**Source**: request.md AC-4

**GIVEN** `getDebugSubsystems` が `"pipeline"` を返すようモックされている
**AND** debug log level が有効である
**WHEN** `logPipelineDiag("test-point", "detail")` を呼び出す
**THEN** `stderrWrite` が `"[pipeline-diag ...]"` 形式の文字列で呼ばれる

---

### TC-017: logPipelineDiag が SPECRUNNER_DEBUG に "pipeline" が含まれない場合は出力しない

**Category**: unit
**Priority**: should
**Source**: request.md AC-4

**GIVEN** `getDebugSubsystems` が `""` を返すようモックされている
**AND** debug log level が有効である
**WHEN** `logPipelineDiag("test-point")` を呼び出す
**THEN** `stderrWrite` が呼ばれない

---

## T-03: `spawnCommand()` の env パラメータ化

### TC-018: commands.ts に process.env 文字列が残存しない

**Category**: unit
**Priority**: must
**Source**: T-03, request.md AC-1

**GIVEN** `src/core/verification/commands.ts` の修正が完了している
**WHEN** `grep "process\.env" src/core/verification/commands.ts` を実行する
**THEN** マッチ行が 0 件である

---

### TC-019: spawnCommand シグネチャが required env パラメータを持つ

**Category**: unit
**Priority**: must
**Source**: T-03, design.md D3

**GIVEN** `src/core/verification/commands.ts` の修正が完了している
**WHEN** 関数シグネチャ `spawnCommand` を確認する
**THEN** 第3引数 `env: Record<string, string | undefined>` が required（デフォルト値なし）で宣言されている

---

### TC-020: commands.ts 内部が env.PATH と stripSecrets(env) を使う

**Category**: unit
**Priority**: must
**Source**: T-03, tasks.md（L53/L60）

**GIVEN** `src/core/verification/commands.ts` の修正が完了している
**WHEN** 関数本体を確認する
**THEN** PATH 参照が `env.PATH`（または `env["PATH"]`）になっている
**AND** 子プロセスへの env 渡しが `stripSecrets(env)` 経由になっている
**AND** `process.env` 文字列が 1 件も存在しない

---

### TC-021: runner.ts の spawnCommand 呼び出しが stripSecrets 経由で env を渡す

**Category**: unit
**Priority**: must
**Source**: T-03, tasks.md（L299）

**GIVEN** `src/core/verification/runner.ts` の修正が完了している
**WHEN** `spawnCommand` の呼び出し箇所を確認する
**THEN** `spawnCommand(cmd.run, cwd, stripSecrets(process.env as Record<string, string | undefined>))` の形式になっている

---

### TC-022: B-6 arch test が runner.ts の stripSecrets 経由参照を violation と見なさない

**Category**: unit
**Priority**: must
**Source**: T-03 AC, design.md D3（B-6 grep フィルタ safe）

**GIVEN** `src/core/verification/runner.ts` の修正が完了している
**WHEN** B-6 enforcement test（`core-invariants.test.ts`）を実行する
**THEN** runner.ts の `process.env` 参照が `stripSecrets` フィルタで除外され violations に含まれない

---

### TC-023: commands テストが第3引数に env を渡す

**Category**: unit
**Priority**: must
**Source**: T-03, tasks.md

**GIVEN** `tests/unit/verification/commands.test.ts` の修正が完了している
**WHEN** `spawnCommand` の全呼び出しを確認する
**THEN** 全呼び出しに第3引数が存在する
**AND** 2 引数のみの呼び出しが存在しない

---

### TC-024: commands テストスイートが green

**Category**: unit
**Priority**: must
**Source**: T-03 AC

**GIVEN** T-03 の全修正が完了している
**WHEN** `bun run test tests/unit/verification/commands.test.ts` を実行する
**THEN** exit code が 0 である

---

### TC-025: spawnCommand が PATH に cwd/node_modules/.bin を prepend する挙動が不変

**Category**: unit
**Priority**: should
**Source**: request.md AC-4

**GIVEN** `env` に `PATH` が設定されている
**WHEN** `spawnCommand(command, cwd, env)` を呼び出す
**THEN** 子プロセスの PATH が `<cwd>/node_modules/.bin:<元のPATH>` になっている

---

### TC-026: spawnCommand が PATH 未設定の env を渡された場合に localBin のみを PATH にする

**Category**: unit
**Priority**: should
**Source**: request.md AC-4（挙動不変）

**GIVEN** `env` に `PATH` が存在しない（undefined）
**WHEN** `spawnCommand(command, cwd, env)` を呼び出す
**THEN** 子プロセスの PATH が `<cwd>/node_modules/.bin` のみになっている

---

## T-04: arch-allowlist.ts の B-6 エントリ全件削除

### TC-027: ARCH_ALLOWLIST に B-6 エントリが 0 件

**Category**: unit
**Priority**: must
**Source**: T-04, request.md AC-2

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` の修正が完了している
**WHEN** `ARCH_ALLOWLIST` を確認する
**THEN** `invariant: "B-6"` のエントリが 1 件も存在しない

---

### TC-028: B-6 コメントブロックが削除されている

**Category**: unit
**Priority**: should
**Source**: T-04, tasks.md（コメントブロック削除指示）

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` の修正が完了している
**WHEN** ファイル内容を確認する
**THEN** `// ── B-6:` で始まるセクションコメントが存在しない

---

### TC-029: B-6 削除後も B-6 enforcement test が green

**Category**: unit
**Priority**: must
**Source**: T-04 AC, request.md AC-1

**GIVEN** T-01 / T-02 / T-03 のコード修正 AND T-04 の allowlist 削除が完了している
**WHEN** `bun run test tests/unit/architecture/core-invariants.test.ts` を実行する
**THEN** "B-6: core/ must not reference process.env directly" テストが green（violations = 0）

---

### TC-030: src/core/ に process.env 直参照が残存しない（grep 検証）

**Category**: unit
**Priority**: must
**Source**: request.md AC-1

**GIVEN** 全コード修正と allowlist 削除が完了している
**WHEN** `grep -rEn "process\.env" src/core/` を実行し stripSecrets 行とテストファイルを除外する
**THEN** マッチ行が 0 件である

---

### TC-031: B-1 / B-3 / B-8 等の他 invariant エントリが削除されていない

**Category**: unit
**Priority**: must
**Source**: request.md スコープ外（他 invariant は触らない）

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` の修正が完了している
**WHEN** `ARCH_ALLOWLIST` を確認する
**THEN** B-1 エントリ（3件）/ B-3 エントリ（4件）/ B-8 エントリ（4件）が削除前と同数存在する

---

## T-05: T-04 suppression-demo の B3-logger repoint

### TC-032: suppression-demo テスト名が B-3 を示す

**Category**: unit
**Priority**: must
**Source**: T-05, design.md D4

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の修正が完了している
**WHEN** T-04 suppression-demo テストの `it()` 文字列を確認する
**THEN** テスト名が `"B-3 allowlist suppression"` を含む
**AND** `"B-6 allowlist suppression"` を含む文字列が存在しない

---

### TC-033: suppression-demo の synthetic data が pipeline-logger.ts を指す

**Category**: unit
**Priority**: must
**Source**: T-05, tasks.md

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の修正が完了している
**WHEN** suppression-demo テストの synthetic match data を確認する
**THEN** `file` が `"src/logger/pipeline-logger.ts"` である
**AND** `content` が `core/event/event-bus.js` を含む文字列である

---

### TC-034: suppression-demo フィルタが B-3 entries を参照している

**Category**: unit
**Priority**: must
**Source**: T-05

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の修正が完了している
**WHEN** フィルタ式を確認する
**THEN** `ARCH_ALLOWLIST.filter((e) => e.invariant === "B-3")` の形式である
**AND** `"B-6"` フィルタが suppression-demo 内に存在しない

---

### TC-035: suppression-demo が violations 0 件を assert する

**Category**: unit
**Priority**: must
**Source**: T-05, request.md AC-3

**GIVEN** `B3-logger` エントリが `ARCH_ALLOWLIST` に存在している
**AND** suppression-demo が `B3-logger` を synthetic data として使用している
**WHEN** `bun run test tests/unit/architecture/core-invariants.test.ts` を実行する
**THEN** suppression-demo テストが pass し `violations.length === 0` が成立する

---

### TC-036: B3-logger エントリが allowlist から消えると suppression-demo が fail する（guard 生存確認）

**Category**: unit
**Priority**: should
**Source**: T-05, design.md D4（regression guard 維持の目的）

**GIVEN** `B3-logger` エントリを `ARCH_ALLOWLIST` から仮削除した状態
**WHEN** suppression-demo テストを実行する
**THEN** `violations.length > 0` となり suppression-demo が fail する
**（これにより regression guard が有効であることが確認できる）**

---

### TC-037: core-invariants.test.ts 全体が green

**Category**: unit
**Priority**: must
**Source**: T-05 AC

**GIVEN** T-04 / T-05 の全修正が完了している
**WHEN** `bun run test tests/unit/architecture/core-invariants.test.ts` を実行する
**THEN** 全テストケースが pass する

---

## T-06: 全体検証

### TC-038: bun run build が green

**Category**: integration
**Priority**: must
**Source**: T-06, request.md AC-5

**GIVEN** 全タスク（T-01 〜 T-05）の修正が完了している
**WHEN** `bun run build` を実行する
**THEN** exit code が 0 である

---

### TC-039: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: T-06, request.md AC-5

**GIVEN** 全タスクの修正が完了している
**WHEN** `bun run typecheck` を実行する
**THEN** exit code が 0 である（型エラー 0 件）

---

### TC-040: bun run lint が green

**Category**: integration
**Priority**: must
**Source**: T-06, request.md AC-5

**GIVEN** 全タスクの修正が完了している
**WHEN** `bun run lint` を実行する
**THEN** exit code が 0 である

---

### TC-041: bun run test が green

**Category**: integration
**Priority**: must
**Source**: T-06, request.md AC-5

**GIVEN** 全タスクの修正が完了している
**WHEN** `bun run test` を実行する
**THEN** exit code が 0 である（全テスト pass）

---

### TC-042: 振る舞い不変 — preflight の認証フローが変わらない

**Category**: integration
**Priority**: should
**Source**: request.md AC-4

**GIVEN** 修正後の `runPreflight` が `process.env` を caller から受け取る構造になっている
**WHEN** 実際の CLI フロー（`run.ts` 経由）で `runPreflight` が呼ばれる
**THEN** GitHub token 解決・runtime prereq 確認・Anthropic API key 解決の順序と結果が修正前と同一である

---

### TC-043: 振る舞い不変 — spawnCommand が SECRET_DENYLIST の変数を子プロセスに渡さない

**Category**: integration
**Priority**: should
**Source**: request.md AC-4, design.md（B-2 と対の値封じ込め）

**GIVEN** 修正後の `runner.ts` が `stripSecrets(process.env)` を `spawnCommand` に渡す
**WHEN** verification コマンドが実行される
**THEN** `GITHUB_TOKEN`・`SPECRUNNER_API_KEY`・`ANTHROPIC_API_KEY` 等が子プロセスの env に含まれない
**AND** PATH に `node_modules/.bin` が prepend されている

---

### TC-044: B-6 arch test が src/core/ 全体に対して green

**Category**: integration
**Priority**: must
**Source**: request.md AC-1

**GIVEN** 全タスクの修正が完了している
**WHEN** B-6 enforcement test（`core-invariants.test.ts`）を実行する
**THEN** "grep finds no raw process.env references in src/core/ beyond the allowlist" が pass する
**AND** violations 配列が空である

---

## Result

```yaml
result: completed
total: 44
automated: 44
manual: 0
must: 32
should: 12
could: 0
blocked_reasons: []
```
