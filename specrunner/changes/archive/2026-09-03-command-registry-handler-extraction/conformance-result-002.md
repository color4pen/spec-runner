# Conformance Result — command-registry-handler-extraction (Iteration 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Summary

All normative requirements in request.md and spec.md are satisfied. No blocking findings.

Verification passed (build / typecheck / test / lint / changed-line-coverage, 836 test files, 12,639 tests passed / 1 skipped / 2 todo). The code-fixer applied after iter 1 conformance resolved the `ctx!.invokerCwd` plan divergence noted in conformance-result-001.md. One observation is noted regarding the raw `grep | wc -l` process.exit count metric (not a blocking finding; real production call count is unchanged).

---

## 検証した項目

### Request 受け入れ条件（normative）

| 受け入れ条件 | 確認結果 | 根拠 |
|---|---|---|
| inline handler 0件 | ✅ | `grep -c "handler: async" src/cli/command-registry.ts` → **0** |
| registry = CLI metadata + named handler reference | ✅ | 30件の `handler: handleXxx` 参照、inline 実装ゼロ |
| registry 内の業務 I/O 実装 0件 | ✅ | `import * as fs`・`* as path`・`resolveGitHubToken`・`createGitHubClient`・`loadConfigWithOverlay` 等のビジネスロジック import なし |
| registry の process.exit 0件 | ✅ | `grep -c "process\.exit" src/cli/command-registry.ts` → **0**；architecture ratchet Check 2（コメント除去後テキスト）も確認 |
| exit call の条件・順序・code を変更せず handler 側に保持 | ✅ | 実際の process.exit 呼び出し数（コメント・文字列・テストコードを除く）: main 70件、current 70件（同一） |
| handler → registry value-import cycle 0件 | ✅ | `src/cli/` 配下の全 `.ts` ファイル（`__tests__/` 除く）を検査済み；`command-registry` を参照する value import なし；architecture ratchet Check 3（AST ベース）も確認 |
| CommandSpec が唯一の CLI 契約正本 | ✅ | `export const COMMANDS` は `command-registry.ts` のみ；architecture ratchet Check 4 確認 |
| CLI contract 構造比較が変更前後で一致 | ✅ | `cli-contract-snapshot.test.ts.snap` 生成済み・コミット済み；全 top-level command（init / login / credentials / run / request / job / config / inbox / rules / reviewers / runtime / doctor / guide / usage）を含む；snapshot テスト green |
| 既存契約テストが green | ✅ | 12,639 tests passed（command-registry-resume, command-registry-reopen, archive-from-issue, resume-from-issue, detach-flag-cli, from-flag-no-enum, login 等含む） |
| architecture ratchet がある | ✅ | `src/cli/__tests__/architecture-ratchet.test.ts`（280行）；Check 1 runtime handler.name + AST ベース、Check 2 コメント除去テキスト、Check 3 `@typescript-eslint/parser` AST、Check 4 コメント除去テキスト |
| SpecRunner verification が green | ✅ | Verdict: passed（build / typecheck / test / lint / changed-line-coverage すべて passed） |
| ユーザー向け observable behavior に差分なし | ✅ | CLI contract snapshot 一致；既存テスト全 green；exit code 保持確認 |

---

### Spec Requirements（normative）

**Requirement: CommandSpec ツリーは handler の named function reference のみを保持する**

- `grep -c "handler: async" src/cli/command-registry.ts` → 0
- architecture-ratchet Check 1: runtime `spec.handler?.name === "handler"` walk で全 CommandSpec ノードを走査 → violations: []
- architecture-ratchet Check 1b: `@typescript-eslint/parser` による AST 走査で `command-registry.ts` の `handler:` プロパティが関数式でないことを確認 → violations: []
- 30件の `handler: handleXxx` named function reference が確認される（handleInit, handleLogin, handleCredentialsSet, handleRequestNew〜handleRequestValidate, handleJobStart, handleJobLs, handleJobShow, handleJobWait, handleJobCancel, handleJobResume, handleJobReopen, handleJobAttach, handleJobArchive, handleJobPrune, handleJobStats, handleConfigEffective, handleInboxRun, handleRulesNew, handleReviewersNew, handleRuntimeSetup, handleRuntimeStatus, handleRuntimeReset, handleDoctor, handleDoctorRepair, handleGuide, handleUsage）

**Requirement: command-registry.ts は process.exit を呼び出さない**

- `grep -c "process\.exit" src/cli/command-registry.ts` → 0
- architecture-ratchet Check 2（コメント除去後 source scan）: `not.toContain("process.exit")` → pass
- Spec Scenario「--detach と --json 同時指定 → exit code 2」: `src/cli/resume.ts:124-126` に `if (parsed.flags["detach"] && parsed.flags["json"]) { logError(...); process.exit(EXIT_CODE.ARG_ERROR); }` → EXIT_CODE.ARG_ERROR = 2 ✓

**Requirement: handler モジュールから command-registry.ts への value import が存在しない**

- `src/cli/` 配下の全 `.ts` ファイル（registry 自身・`__tests__/` 除外）を `@typescript-eslint/parser` で AST 解析 → `command-registry` を source とする ImportDeclaration（type-only でないもの）: 0件
- architecture-ratchet Check 3: violations: []
- テストファイル（`__tests__/` 配下）は対象外（test が registry を import するのは正常）

**Requirement: CommandSpec ツリーが CLI 契約の唯一の正本であり続ける**

- `grep -rn "^export const COMMANDS" src/cli/ --include="*.ts" | grep -v "__tests__"` → `command-registry.ts:548` のみ
- architecture-ratchet Check 4: violations: []

**Requirement: CLI 契約（command path・flags・aliases・guards）が変更前後で同一である**

- `src/cli/__tests__/__snapshots__/cli-contract-snapshot.test.ts.snap`（625行）コミット済み
- `cli-contract-snapshot.test.ts` の `toMatchSnapshot()` テスト: green
- snapshot に全 top-level command の path / flags キー一覧 / args 名一覧 / requiresRepo / worktreeGuard / aliasOf / visibility / hasHandler が含まれる

**Requirement: 既存の CLI contract テストが green を維持する**

- verification result: 12,639 passed, テスト期待値の変更なし
- `command-registry-resume.test.ts`・`command-registry-reopen.test.ts`・`archive-from-issue.test.ts`・`resume-from-issue.test.ts`・`detach-flag-cli.test.ts`・`from-flag-no-enum.test.ts`・`login.test.ts` 等すべて green

**Requirement: USAGE 定数が引き続き command-registry から import 可能である**

- `LOGIN_USAGE`・`JOB_RESUME_USAGE`・`REOPEN_USAGE`・`USAGE` → `command-registry.ts` で直接定義・export ✓
- `ARCHIVE_USAGE` → `archive.ts` で定義し `export { ARCHIVE_USAGE } from "./archive.js"` で re-export ✓
- `CREDENTIALS_SET_USAGE` → `credentials.ts` で定義・export；registry が `help.detail` 用に import ✓
- `archive-from-issue.test.ts` の `import { COMMANDS, ARCHIVE_USAGE } from "../command-registry.js"` → 解決可能

**Requirement: repository 全体の process.exit 件数が変化しない**

- `grep -r "process.exit" src/ --include="*.ts" | wc -l`: main = 104、current = 120（+16）
- **内訳分析**:
  - 実際の production process.exit 呼び出し（コメント・文字列・テストコードを除く）: main 70件 = current 70件（**同一**）
  - +16 の内訳:
    - `architecture-ratchet.test.ts`（新規）: 6件（コメント・文字列リテラル内での "process.exit" 言及；Check 2 のアサーション文字列等）
    - `from-issue.test.ts`: +6件（テスト mock 内の `process.exit(code)` 呼び出しとエラーメッセージ文字列）
    - `resume-from-issue.test.ts`: +1件（テストアサーション文字列）
    - 既存 handler ファイルのコメント変更: +3件（`* Caller (X) is responsible for process.exit()` 等のドキュメントコメント）
  - R3a 要件の本質（exit call の条件・順序・exit code を変えず handler 側に保持）は満たされている
- **観察**: raw grep カウントは +16 だが、これは architecture ratchet テスト（"process.exit" をテキストとして検索するアサーション）の追加と、更新されたテスト mock によるもの。R3b スコープの変更なし。process.exit の意味的な削減・増加・集約は行われていない。

---

### Architecture ratchet（D4）

| Check | 実装方式 | 結果 |
|---|---|---|
| 1a — inline handler runtime check | COMMANDS ツリー全走査、`spec.handler?.name === "handler"` | ✅ violations: [] |
| 1b — inline handler AST check | `@typescript-eslint/parser`、`handler:` プロパティの関数式検出 | ✅ violations: [] |
| 2 — registry process.exit = 0 | コメント除去後 source text scan | ✅ |
| 3 — handler → registry value import cycle = 0 | `@typescript-eslint/parser` ImportDeclaration AST 走査、type-only 除外 | ✅ violations: [] |
| 4 — single COMMANDS export | コメント除去後 `export\s+const\s+COMMANDS\b` scan | ✅ command-registry.ts のみ |

要件「AST等の構造検査を優先し、コメントや文字列で誤検知する単純grepだけに依存しないこと」: Check 1a は runtime reflection（V8 name 推論）、Check 1b と Check 3 は完全 AST 解析、Check 2 と Check 4 はコメント除去後テキスト（生 grep でない）→ 要件充足。

---

### Handler モジュール配置（D1）

新規作成: `command-handler.ts`（型中立）・`request-handlers.ts`（5件）・`scaffold-handlers.ts`（2件）・`guide-handler.ts`（1件）・`usage-handler.ts`（1件）

既存モジュール拡張: `init.ts`・`login.ts`・`credentials.ts`・`run.ts`・`ps.ts`・`job-show.ts`・`job-wait.ts`・`cancel.ts`・`resume.ts`・`reopen.ts`・`attach.ts`・`archive.ts`・`prune.ts`・`managed.ts`・`doctor.ts`・`config-effective.ts`・`inbox.ts`

`command-registry.ts` 行数: 1,696（main）→ **1,083**（current）

### D6: bin/specrunner.ts duck-type guard

`isFlagParseError` / `isSpecRunnerError` duck-type guard が実装されている（`instanceof` を先に試し、失敗時に `e.name` / `"exitCode" in e` へ fallback）。production では挙動不変、module reset 境界を跨ぐ既存テストが正しく動作する。

### plan divergence（iter 1 → iter 2 で解消）

- iter 1 で記録した「scaffold-handlers.ts・usage-handler.ts が `process.cwd()` を使用」（tasks T-14・T-15 が `ctx!.invokerCwd` を指定）は、code-fixer によって `ctx!.invokerCwd` に修正済み。現在の実装は tasks の仕様に準拠。

---

## 検証できなかった項目

None。全 normative 項目を確認済み。

---

## Findings 詳細

None（typed findings なし）。

process.exit raw grep カウントの +16 は production 動作の変化ではなく、architecture ratchet テスト追加・テスト mock 更新・コメント変更によるものと確認した。実際の process.exit 呼び出し数は main・current ともに 70件で同一。

---

## Checked / Skipped / Unverified

- **Checked**: 12 normative items（全受け入れ条件 + 全 spec requirements）
- **Skipped**: 0
- **Unverified**: 0
