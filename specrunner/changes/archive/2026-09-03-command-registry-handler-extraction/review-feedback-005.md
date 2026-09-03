# Code Review Feedback — command-registry-handler-extraction — iter 5

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `src/cli/command-registry.ts`（1,083行、全 import 宣言・handler 参照一覧）
- `src/cli/__tests__/architecture-ratchet.test.ts`（288行、Check 1〜4 の実装全体）
- `src/cli/__tests__/cli-contract-snapshot.test.ts`（85行）
- `src/cli/command-handler.ts`（12行）
- `src/cli/request-handlers.ts`（55行）
- `src/cli/scaffold-handlers.ts`（22行）
- `src/cli/guide-handler.ts`（11行）
- `src/cli/usage-handler.ts`（21行）
- `src/cli/run.ts`（先頭80行＋handleJobStart周辺）
- `src/cli/resume.ts`（先頭60行）
- `src/cli/cancel.ts`（195行全体）
- `src/cli/doctor.ts`（先頭50行、handleDoctor/handleDoctorRepair部分）
- `src/cli/managed.ts`（356行全体）
- `src/cli/ps.ts`（190行全体）
- `bin/specrunner.ts`（先頭80行）
- `specrunner/changes/command-registry-handler-extraction/design.md`
- `specrunner/changes/command-registry-handler-extraction/test-cases.md`
- `specrunner/changes/command-registry-handler-extraction/conformance-result-002.md`
- `specrunner/changes/command-registry-handler-extraction/regression-gate-result-003.md`
- `specrunner/changes/command-registry-handler-extraction/review-feedback-004.md`
- `tests/unit/architecture/arch-allowlist.ts`（先頭50行）

### 確認したコード

**inline handler ゼロ**
- `grep -c "handler: async" src/cli/command-registry.ts` → 0
- `grep -n "handler:" src/cli/command-registry.ts` 出力全件確認 → 30件すべて named function reference（handleInit, handleLogin, handleCredentialsSet, handleRequestNew〜handleRequestValidate, handleJobStart, handleJobLs, handleJobShow, handleJobWait, handleJobCancel, handleJobResume, handleJobReopen, handleJobAttach, handleJobArchive, handleJobPrune, handleJobStats, handleConfigEffective, handleInboxRun, handleRulesNew, handleReviewersNew, handleRuntimeSetup, handleRuntimeStatus, handleRuntimeReset, handleDoctor, handleDoctorRepair, handleGuide, handleUsage）

**process.exit ゼロ in command-registry.ts**
- `grep -c "process\.exit" src/cli/command-registry.ts` → 0
- architecture-ratchet Check 2（コメント除去後テキスト scan）が green であることを verification-result.md で確認済み

**TC-022: 業務 I/O value import が command-registry.ts から除去されている**
- `grep -n "^import" src/cli/command-registry.ts` 出力確認
- 残存 value import: `CREDENTIALS_SET_USAGE`（credentials.ts / help.detail 用）、`AGENT_STEP_NAMES`・`CLI_STEP_NAMES`（step-names.js / USAGE 文字列テンプレート用）、`GUIDE_TOPICS`（core/command/guide.js / help.summary 用）、handler 関数群（cli/* / dispatch 参照用）、`ARCHIVE_USAGE`（archive.js / help.detail 用）
- `fs`・`path`・`resolveGitHubToken`・`createGitHubClient`・`loadConfigWithOverlay`・`parseRequestMdRaw`・`SpecRunnerError`・`EXIT_CODE`・`logError`・`stderrWrite`・`resolveLogLevel` 等はすべて除去されている ✅

**handler module → command-registry の value import ゼロ**
- `grep -r "from.*command-registry" src/cli/ --include="*.ts" | grep -v "import type" | grep -v "command-registry.ts"` → `__tests__/` 配下のテストファイル（ratchet, snapshot, contract 系）のみ（テストが registry を import するのは正常）
- handler モジュール自体（init.ts, run.ts, resume.ts, cancel.ts, doctor.ts, ps.ts, managed.ts 等）は command-registry から import していない ✅

**architecture-ratchet Check 1〜4 の実装確認**

- **Check 1a（runtime handler.name）**: `collectSpecs` でツリー全ノードを列挙し `spec.handler?.name === "handler"` で anonymous arrow function を検出。
- **Check 1b（AST-based）**: `isFunctionNode`（FunctionExpression / ArrowFunctionExpression + TSAsExpression ラップ対応）を用いた `findInlineHandlerNodes` が `command-registry.ts` を `@typescript-eslint/parser` で parse し、`handler:` property の value が関数式ノードでないことを確認する。named inline function expression（`handler: async function myFn() {}`）も検出可能。regression guard テスト（line 165, 170）あり。
- **Check 2（process.exit）**: `stripComments` でブロックコメント・行コメントを除去した後、`not.toContain("process.exit")` を確認。
- **Check 3（import cycle）**: `findValueImportsFrom` が `@typescript-eslint/parser` で AST traverse し、`importKind !== "type"` かつ source が `"command-registry"` を含む ImportDeclaration を検出。multi-line import 対応確認（regression guard テスト line 249, 257 あり）。**parse error は re-throw される（silent catch なし）**。
- **Check 4（並行 CLI 契約正本）**: `export\s+const\s+COMMANDS\b` regex を stripped source で検索し、`command-registry.ts` 以外への一致を検出。

**TC-019: doctor.ts の dynamic import 維持確認**
- `grep -n "import(" src/cli/doctor.ts` → line 267: `await import("../core/occupancy/repair.js")` — static import に変換されていない ✅

**TC-021: GUIDE_TOPICS が command-registry.ts にのみ存在し guide-handler.ts に複製されない**
- `grep -rn "GUIDE_TOPICS" src/` → core/command/guide.ts で定義、command-registry.ts でのみ import（help.summary 用）。guide-handler.ts は GUIDE_TOPICS を参照していない ✅

**TC-015: resolveSlugForDetach が command-registry.ts から削除され run.ts に移動**
- `grep -n "resolveSlugForDetach" src/cli/command-registry.ts | wc -l` → 0 ✅
- `grep -n "resolveSlugForDetach" src/cli/run.ts` → line 138（run.ts に定義） ✅

**bin/specrunner.ts duck-type guard（D6）**
- `isFlagParseError` / `isSpecRunnerError` が実装済み（line 18, 27）。`instanceof` を先行させ fallback で `.name` / `"exitCode" in e` チェック。production 挙動不変 ✅

**ratchet のスコープ制約**
- `listCliTsFiles()` は `fs.readdirSync(CLI_DIR)` で `src/cli/` 直下の `.ts` ファイルのみを列挙（`__tests__/` サブディレクトリは除外される）。現時点では全 handler が `src/cli/` 直下に配置されており問題なし。

**前イテレーションの findings 対応確認**
- iter 4 Finding 1（named inline function expression 未検出）→ Check 1b（AST-based `findInlineHandlerNodes`）で解決済み
- iter 4 Finding 2（silent catch in findValueImportsFrom）→ try-catch 除去・parse errors re-throw で解決済み
- regression-gate-result-003.md で全 7 件 ledger finding が "FIXED — no regression" と確認済み

**verification 確認**
- `verification-result.md`: build / typecheck / test / lint / changed-line-coverage すべて passed
- test: 12,639 passed（conformance-result-002.md 記載）

---

## 検証できなかった項目

- TC-011（repository 全体の process.exit 件数が変化しない）: main ブランチとの数値比較は本 worktree 内では不可。conformance-result-002.md では「production call 数 70件、抽出前後同数」と記載されている。コメント・テスト・文字列を除いた実数は別途計測が必要だが、verification passおよびグリーンテスト群が変化なしの間接証拠となっている。

---

## Findings 詳細

指摘なし（None）。

iter 4 で指摘された 2 件の low-severity 理論的ギャップ（Check 1 の named inline function 未検出、Check 3 の silent catch）は iter 5 でいずれも修正済みである。

architecture-ratchet Check 3 の `listCliTsFiles()` が `src/cli/` サブディレクトリを対象外としている点は、現在の実装（全 handler が `src/cli/` 直下に配置）では問題ない。将来 `src/cli/handlers/` 等のサブディレクトリにハンドラが追加された場合はスコープ外となるが、当該変更が行われる際に ratchet も更新すべき旨は design.md に記録されている。ブロッキング要素ではない。
