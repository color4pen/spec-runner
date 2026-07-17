# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `src/core/runtime/__tests__/bite-evidence-scoped-exec.test.ts` | TC-013 (should-priority) は実装対象外のまま。`testFile.replace(/'/g, "'\\''")` によるシングルクォートエスケープは `local.ts:970-971` に存在するが、スペースや `'` を含むファイルパスを実際に渡すテストがない。spec-review でも LOW として記録済み。 | 追加する場合: `pass test.ts`（スペース入り）か `it's.test.ts`（クォート入り）のファイルを beforeAll で作成して `runTestsAtCommit` に渡し、`kind === "ran"` かつ `passed` が正しいことを assert する。優先度 should なので後続 request でも可。 | no |
| 2 | low | testing | `src/config/__tests__/verification-scoped-command.test.ts` TC-011 二件目 | `scopedTestCommand: "   "`（空白のみ）はスキーマバリデーションを通過するが、実装では `.trim()` で `""` → falsy になり bail または default path に落ちる。テストは `not.toThrow()` のみで「結果が unavailable になるか default path に落ちるか」を assert していない。動作ドキュメントとして有用だが、実装との対応が不完全。 | テストコメントの通り「実装が trim してバイル path へ」という挙動を assert する行（`expect(r.kind).toBe("unavailable")` 相当）を追加するか、schema に `.trim().min(1)` 相当のバリデーションを追加してスキーマ段階で弾く。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 8 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.55

## Summary

実装は要件・設計・受け入れ基準をすべて満たしている。以下の観点で確認した。

### 正当性

- **D1 (symlink)**: `fs.access(nodeModulesSrc)` で存在確認 → `fs.symlink` で `<tmpBase>/node_modules → <cwd>/node_modules` を生成。`node_modules` が無い場合は `unavailable`（fail-closed）。`finally` 内で `fs.rm(<tmpBase>/node_modules, { force: true })` によりシンボリックリンクのみ除去（target を辿らない）。
- **D3 (per-file scoped exec)**: `spawnScopedCommand(shellCmd, tmpBase, ...)` — `commands.ts` の `spawnCommand` alias 経由で `tmpBase/node_modules/.bin` を PATH 先頭に付ける。`bun run test → vitest` が正しく解決される。各ファイルを独立ループで実行し `exitCode === 0` で `passed` を決定。
- **D4 (cleanup/never-throw)**: `worktreeCreated`/`symlinkCreated` フラグで finally 内の順序制御（symlink 先 → worktree 後）。早期 `return` でも finally は走るため worktree リークなし。outer `catch` で予期しない例外を `unavailable` に変換。

### テストカバレッジ（must-priority 全 8 件）

| TC | テストファイル | 対応 |
|----|--------------|------|
| TC-001 dependency-requiring test passes | bite-evidence-scoped-exec.test.ts | ✓ + break-check |
| TC-002 missing node_modules fails closed | bite-evidence-scoped-exec.test.ts | ✓ |
| TC-003 scopedTestCommand validates | verification-scoped-command.test.ts | ✓ |
| TC-004 without scopedTestCommand validates | verification-scoped-command.test.ts | ✓ |
| TC-005 opt-in enables scoped execution | bite-evidence-isolated-exec.test.ts | ✓ |
| TC-006 custom commands without opt-in → unavailable | bite-evidence-isolated-exec.test.ts | ✓ |
| TC-007 partial pass per file | bite-evidence-scoped-exec.test.ts | ✓ |
| TC-010 base-red candidate-green achieved bite evidence | bite-evidence-e2e-gate.test.ts | ✓ (gate + floor) |

should-priority: TC-008/009/011/012/014/015 すべてカバー済み。TC-013 のみ未実装（finding #1）。

### 後方互換

- `src/core/port/runtime-strategy.ts`・`.specrunner/config.json` は diff に含まれない（TC-016 ✓）。
- `ManagedRuntime` は変更なし、managed→unavailable のままテスト通過。
- `MINIMAL_CONFIG`（custom commands なし・scopedTestCommand なし）の既存テスト群は緑。
- `scopedTestCommand` 未設定 + custom commands → `unavailable`（backward-compat 維持、TC-006）。

### 検証パスの確認

Verification result: build/typecheck/test/lint すべて passed（532 test files, 7286 tests）。changed-line-coverage も passed。

blocking issue なし。
