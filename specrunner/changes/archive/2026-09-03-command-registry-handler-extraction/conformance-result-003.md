# Conformance Result — command-registry-handler-extraction (Iteration 3)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Summary

All normative requirements in request.md and spec.md are satisfied. No blocking findings. This iteration re-verifies the state that iteration 2 (approved) confirmed, following a post-fixer reverification cycle.

---

## 検証した項目

### Request 受け入れ条件（normative）

| 受け入れ条件 | 確認結果 | 根拠 |
|---|---|---|
| inline handler 0件 | ✅ | `grep -c "handler: async" src/cli/command-registry.ts` → **0** |
| registry = CLI metadata + named handler reference | ✅ | 30件の `handler: handleXxx` 参照、inline 実装ゼロ（handleInit〜handleUsage） |
| registry 内の業務 I/O 実装 0件 | ✅ | `import * as fs`・`* as path`・`resolveGitHubToken`・`createGitHubClient`・`loadConfigWithOverlay` 等のビジネスロジック import なし；`CREDENTIALS_SET_USAGE` は help.detail 用の CLI metadata string として適切 |
| registry の process.exit 0件 | ✅ | `grep -c "process\.exit" src/cli/command-registry.ts` → **0**；architecture ratchet Check 2（コメント除去後テキスト）も確認 |
| exit call の条件・順序・code を変更せず handler 側に保持 | ✅ | production process.exit 呼び出し数（コメント・文字列・テストコードを除く）: 70件（main）= 70件（current）、同一 |
| handler → registry value-import cycle 0件 | ✅ | `src/cli/*.ts`（`__tests__/` 除く）を検査；`command-registry` を参照する value import なし；architecture ratchet Check 3（AST ベース）確認 |
| CommandSpec が唯一の CLI 契約正本 | ✅ | `export const COMMANDS` は `command-registry.ts` のみ；architecture ratchet Check 4 確認 |
| CLI contract 構造比較が変更前後で一致 | ✅ | `src/cli/__tests__/__snapshots__/cli-contract-snapshot.test.ts.snap`（625行）コミット済み；全 top-level command を含む；snapshot テスト green |
| 既存契約テストが green | ✅ | 12,639 tests passed（verification result：build / typecheck / test / lint / changed-line-coverage すべて passed） |
| architecture ratchet がある | ✅ | `src/cli/__tests__/architecture-ratchet.test.ts`（287行）；4 チェック実装済み |
| SpecRunner verification が green | ✅ | Verdict: passed（verification-result.md 確認） |
| ユーザー向け observable behavior に差分なし | ✅ | CLI contract snapshot 一致；既存テスト全 green；exit code 保持確認 |

---

### Spec Requirements（normative）

**Requirement: CommandSpec ツリーは handler の named function reference のみを保持する**

- `grep -c "handler: async" src/cli/command-registry.ts` → 0
- `handler:` 行一覧: 30件すべてが `handler: handleXxx` 形式の named function reference（handleInit, handleLogin, handleCredentialsSet, handleRequestNew, handleRequestPrompt, handleRequestLs, handleRequestTemplate, handleRequestValidate, handleJobStart, handleJobLs, handleJobShow, handleJobWait, handleJobCancel, handleJobResume, handleJobReopen, handleJobAttach, handleJobArchive, handleJobPrune, handleJobStats, handleConfigEffective, handleInboxRun, handleRulesNew, handleReviewersNew, handleRuntimeSetup, handleRuntimeStatus, handleRuntimeReset, handleDoctor, handleDoctorRepair, handleGuide, handleUsage）
- architecture-ratchet Check 1a: runtime `spec.handler?.name === "handler"` walk → violations: []
- architecture-ratchet Check 1b: `@typescript-eslint/parser` AST 走査で `handler:` プロパティが関数式でないことを確認 → violations: []

**Requirement: command-registry.ts は process.exit を呼び出さない**

- `grep -c "process\.exit" src/cli/command-registry.ts` → 0
- architecture-ratchet Check 2（コメント除去後 source text scan）: `not.toContain("process.exit")` → pass
- Spec Scenario「--detach と --json 同時指定 → exit code 2」: `src/cli/resume.ts` に `process.exit(EXIT_CODE.ARG_ERROR)` → EXIT_CODE.ARG_ERROR = 2（抽出前と同一）✓

**Requirement: handler モジュールから command-registry.ts への value import が存在しない**

- `src/cli/*.ts`（registry 自身・`__tests__/` 除外）の全 handler モジュールを確認：`from.*command-registry` を含む import 文なし（コメント内の言及のみ）
- architecture-ratchet Check 3（AST ベース `@typescript-eslint/parser` ImportDeclaration 走査、type-only 除外）: violations: []
- `listCliTsFiles()` は `readdirSync(CLI_DIR)` で `src/cli/*.ts` のみを対象（非再帰、`__tests__/` ディレクトリは `.ts` でないため対象外）

**Requirement: CommandSpec ツリーが CLI 契約の唯一の正本であり続ける**

- `grep -rn "^export const COMMANDS" src/cli/ --include="*.ts"` → `command-registry.ts` のみ
- architecture-ratchet Check 4: violations: []

**Requirement: CLI 契約（command path・flags・aliases・guards）が変更前後で同一である**

- `src/cli/__tests__/__snapshots__/cli-contract-snapshot.test.ts.snap`（625行）コミット済み
- snapshot に全 top-level command の path / flags キー一覧 / args 名一覧 / requiresRepo / worktreeGuard / aliasOf / visibility / hasHandler が含まれる
- `cli-contract-snapshot.test.ts` の `toMatchSnapshot()` テスト: green

**Requirement: 既存の CLI contract テストが green を維持する**

- 12,639 passed；テスト期待値の変更なし
- command-registry-resume.test.ts・command-registry-reopen.test.ts・archive-from-issue.test.ts・resume-from-issue.test.ts 等すべて green

**Requirement: USAGE 定数が引き続き command-registry から import 可能である**

- `LOGIN_USAGE`・`JOB_RESUME_USAGE`・`REOPEN_USAGE`・`USAGE` → `command-registry.ts` で直接定義・export ✓
- `ARCHIVE_USAGE` → `archive.ts` で定義し `export { ARCHIVE_USAGE } from "./archive.js"` で re-export ✓（`command-registry.ts:26`）
- `CREDENTIALS_SET_USAGE` → `credentials.ts` で定義・export；registry が `help.detail` 用に import ✓

**Requirement: repository 全体の process.exit 件数が変化しない**

- raw `grep -r "process.exit" src/ --include="*.ts" | wc -l`: main = 104、current = 120（+16）
- 内訳（production 実呼び出し）: main 70件 = current 70件（**同一**）
- +16 の内訳: `architecture-ratchet.test.ts`（新規、アサーション文字列等 6件）、`from-issue.test.ts`（test mock +6件）、`resume-from-issue.test.ts`（+1件）、コメント（+3件）
- MUST 要件の本質（process.exit の集約・削減・return contract 化を行わない）は満たされている

---

### Architecture ratchet（D4）

| Check | 実装方式 | 結果 |
|---|---|---|
| 1a — inline handler runtime check | COMMANDS ツリー全走査、`spec.handler?.name === "handler"` | ✅ violations: [] |
| 1b — inline handler AST check | `@typescript-eslint/parser`、`handler:` プロパティの FunctionExpression/ArrowFunctionExpression 検出 | ✅ violations: [] |
| 2 — registry process.exit = 0 | コメント除去後 source text scan | ✅ |
| 3 — handler → registry value import cycle = 0 | `@typescript-eslint/parser` ImportDeclaration AST 走査、type-only 除外 | ✅ violations: [] |
| 4 — single COMMANDS export | コメント除去後 `export\s+const\s+COMMANDS\b` scan | ✅ command-registry.ts のみ |

要件「AST等の構造検査を優先し、コメントや文字列で誤検知する単純grepだけに依存しないこと」: Check 1a は runtime reflection（V8 name 推論）、Check 1b と Check 3 は完全 AST 解析（`@typescript-eslint/parser`）、Check 2 と Check 4 はコメント除去後テキスト（生 grep でない）→ 要件充足。

---

### Handler モジュール配置（D1）

新規作成: `command-handler.ts`（型中立）・`request-handlers.ts`（5件）・`scaffold-handlers.ts`（2件）・`guide-handler.ts`（1件）・`usage-handler.ts`（1件）

既存モジュール拡張: `init.ts`・`login.ts`・`credentials.ts`・`run.ts`・`ps.ts`・`job-show.ts`・`job-wait.ts`・`cancel.ts`・`resume.ts`・`reopen.ts`・`attach.ts`・`archive.ts`・`prune.ts`・`managed.ts`・`doctor.ts`・`config-effective.ts`・`inbox.ts`

`command-registry.ts` 行数: 1,696（main）→ **1,083**（current）

### D6: bin/specrunner.ts duck-type guard

`isFlagParseError` / `isSpecRunnerError` duck-type guard 実装済み（`instanceof` を先に試し、失敗時に `e.name` / `"exitCode" in e` へ fallback）。production では挙動不変、module reset 境界を跨ぐ既存テストが正しく動作する。

---

## 検証できなかった項目

None。全 normative 項目を確認済み。

---

## Findings 詳細

None（typed findings なし）。

---

## Checked / Skipped / Unverified

- **Checked**: 12 normative items（全受け入れ条件 + 全 spec requirements）
- **Skipped**: 0
- **Unverified**: 0
