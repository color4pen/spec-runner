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
| 1 | low | testing | tests/unit/git/git-spawn-env.test.ts | TC-004（`getOriginInfo still distinguishes repo states`）の「git リポジトリだが origin 未設定」ケースに対応する専用テストが存在しない。`git-spawn-env.test.ts` は spawn env の検証のみで exit code 非 0 → `rev-parse` プローブ → `NOT_GIT_REPO` のパスを直接テストしていない。`git-remote.test.ts` TC-013 は非リポジトリの統合テストとして存在するが、"repo with no origin" の判別ロジックは未テスト。test-cases.md では TC-004 が `should` 分類であり、must AC は全て充足されているため blocking なし。 | `git-spawn-env.test.ts` または `git-remote.test.ts` に: spawn を成功させつつ `remote get-url` に exit 1 / `rev-parse` に exit 0 を返すモックを組み、`NOT_GIT_REPO` + detail "Origin remote not configured." がスローされることを assert するテストを追加する（次イテレーション推奨）。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.15

## Summary

全 must AC が充足されている。以下の点を個別に確認した。

**受け入れ基準の充足**

| AC | 確認結果 |
|----|--------|
| `src/git/` 全 subprocess が stripSecrets 済み env でテスト固定 | `git-spawn-env.test.ts` TC-GIT-ENV-01/02/03 がスポンサー spawn モックで各サイトの env を検証 ✓ |
| `doctor.ts` の execFile が strip 済み（または allowlist） | `buildExecFile` に `env: stripSecrets(env)` を注入。`doctor-execfile-env.test.ts` TC-DOC-ENV-01/02 で env・timeout・signal を確認 ✓ |
| env 省略 credential 継承 spawn を検出する guard が存在し pre-fix で red | B-12 tooth（`core-invariants.test.ts`）+ liveness assertion（candidates.length > 0）。T-09 の synthetic 注入で `src/git/new-helper.ts` が違反検出される ✓ |
| `node:child_process` 直接 import が seam 外禁止 | B-12 tooth が 5 ファイルのみ allowlist、grep 範囲は `src/` 全体 ✓ |
| B-6 claude allowlist が狭まり同ファイル内 cast 付き spawn を検出 | `resolveClaudeCodeOAuthTokenFn(` に絞り込み。T-09 の synthetic 注入で旧 generic-cast パターンが違反検出される ✓ |
| git push/fetch/log/diff/remote が env 変更後も機能 | transport-auth は extraheader 注入方式であり env トークン不要。既存テスト + verification green で確認 ✓ |
| `typecheck && test` green | verification-result: build/typecheck/test/lint 全 passed (5556 tests) ✓ |

**設計の妥当性**

- D2: `dynamic-context.ts` / `remote.ts` / `transport-auth.ts` はいずれも `timeout` / `AbortSignal` を必要としないため、`git-exec.ts` seam への完全移行が適切。
- D3 (`remote.ts` 誤り弁別): `runSubprocess` が non-zero exit で resolve する挙動と `rev-parse` プローブの組み合わせは設計通り実装されている。`SpecRunnerError` の再スローも `catch (err: unknown) { if (err instanceof SpecRunnerError) throw err; }` で正しく保全されている。
- D4 (`doctor.ts` allowlist): `execFile + timeout + AbortSignal` を現行 seam が提供しないことを確認。strip と allowlist を両立する実装は要件の "strip または理由付き allowlist" を上回る。
- D5 (B-6 narrowing): `agent-runner.ts` L270 の 1 行化により `resolveClaudeCodeOAuthTokenFn(` と `process.env` が同一行に収まり、MATCHING SEMANTICS（file + substring 同時一致）が正確に機能する。

**軽微な観察（non-blocking）**

- `remote.ts`: `stdout.trim()` → `remoteUrl` 代入後に `!remoteUrl || remoteUrl.length === 0` を再チェックするガード（L48-54）は防御的だが exit 0 で空 stdout が返ることは実際には発生しない。コードの意図は明確なので修正不要。
- TC-004 の "no origin" ケースは `should` 分類のため今回スコープ外だが、次イテレーションでの補完を推奨する（Finding #1 参照）。
