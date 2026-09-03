# Code Review Feedback — iteration 006

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. command-registry.ts の inline handler 排除

- `grep -c "handler: async" src/cli/command-registry.ts` → **0** ✅
- COMMANDS ツリーを目視確認（行 549〜1078）: 全 30 件の handler プロパティが `handleXxx` 形式の named function reference ✅
- architecture-ratchet.test.ts Check 1（runtime + AST 二重確認）がグリーン（verification-result.md 確認）✅

### 2. command-registry.ts の process.exit 排除

- `grep -c "process\.exit" src/cli/command-registry.ts` → **0** ✅
- architecture-ratchet.test.ts Check 2（コメント除去後 source scan）がグリーン ✅

### 3. handler → registry value import 循環の排除

- `src/cli/*.ts`（`__tests__/` 除外）の全ファイルを確認: `from.*command-registry` を含む value import なし ✅
- architecture-ratchet.test.ts Check 3（`@typescript-eslint/parser` AST 走査、type-only import 除外）がグリーン ✅

### 4. COMMANDS の唯一の export

- `export const COMMANDS` は `command-registry.ts:549` のみ ✅
- architecture-ratchet.test.ts Check 4 がグリーン ✅

### 5. src/cli/ 内 value-import 循環の排除（T-19）

- architecture-ratchet.test.ts Check 5（Tarjan SCC、size≥2 の閉路 → 0 件）がグリーン ✅
- `run.ts` は `from-issue.js` を import しない（TC-026 ✅）
- `resume.ts` は `resume-from-issue.js` を import しない ✅
- 新規 handler module（`job-start-handler.ts` / `job-resume-handler.ts` / `job-archive-handler.ts`）が静的 import で各 `*-from-issue.ts` を参照し、`run.ts` / `resume.ts` / `archive.ts` からの相互依存を解消 ✅

### 6. src/cli/ 内 `./` dynamic import の排除（T-19）

- 全 `src/cli/*.ts` の dynamic import を確認:
  - `doctor.ts`: `import("../core/occupancy/repair.js")` → `../core/` prefix、Check 6 対象外（意図的な lazy import）✅
  - `job-start-handler.ts`: `import("../core/issue-target/start.js")` → `../core/` prefix ✅
  - `prune.ts`: `import("../core/prune/runner.js")`・`import("../core/prune/sidecar-runner.js")` → `../core/` prefix ✅
  - `ps.ts`: `import("../util/repo-root.js")` → `../util/` prefix ✅
  - `./` で始まる dynamic import は 0 件 ✅
- architecture-ratchet.test.ts Check 6 がグリーン ✅

### 7. architecture ratchet の 6 チェック実装確認

`src/cli/__tests__/architecture-ratchet.test.ts`（522 行、15 テスト）:
- Check 1a: runtime `spec.handler?.name === "handler"` walk
- Check 1b: `@typescript-eslint/parser` AST で `handler:` プロパティの FunctionExpression/ArrowFunctionExpression を検出
- Check 2: コメント除去後 source text で `process.exit` ゼロ検証
- Check 3: handler module から `command-registry` への value import を AST で検出
- Check 4: `export\s+const\s+COMMANDS\b` を持つファイルが `command-registry.ts` のみ
- Check 5: Tarjan's SCC で value-import 循環を検出（size≥2 → violations）
- Check 6: specifier が `./` で始まる `ImportExpression` を検出

全 15 テスト green（verification-result.md 確認）✅

要件「AST 等の構造検査を優先、コメントや文字列で誤検知する単純 grep のみに依存しないこと」: Check 1b と Check 3 は完全 AST 解析、Check 2 と Check 4 はコメント除去後テキスト → 要件充足 ✅

### 8. CLI contract snapshot

- `src/cli/__tests__/fixtures/cli-contract.base.json`（913 行）が commit 済み ✅
- `src/cli/__tests__/cli-contract-normalize.ts` が full field coverage の normalizer を実装 ✅
- `cli-contract-snapshot.test.ts` が `toEqual(baseFixture)` でグリーン（vitest snapshot ではなく versioned JSON 比較）✅
- TC-028 手順（base commit `483c75f7` から再生成）を追跡可能 ✅

### 9. TC-019: handleDoctorRepair の dynamic import 維持

- `doctor.ts:267`: `import("../core/occupancy/repair.js")` — dynamic import 維持（static import に変換されていない）✅
- slug null チェックと `stderrWrite` ガードが dynamic import の前に存在 ✅

### 10. TC-020 / TC-021 / TC-022 / TC-023 / TC-024 の個別確認

- TC-020: `VALID_JOB_ID_CHARS` が `cancel.ts:39` に定義され `command-registry.ts` から削除 ✅
- TC-021: `GUIDE_TOPICS` は `command-registry.ts` のみ（`guide-handler.ts` は参照しない）✅
- TC-022: `command-registry.ts` の import 一覧に `fs`・`path`・`resolveGitHubToken`・`createGitHubClient`・`loadConfigWithOverlay` 等の value import なし ✅
  - `CREDENTIALS_SET_USAGE`: `help.detail` 用の usage string（CLI metadata）として適切
  - `AGENT_STEP_NAMES`・`CLI_STEP_NAMES`: `JOB_RESUME_USAGE` の usage text 生成用
  - `GUIDE_TOPICS`: `guide.help.summary` の文字列テンプレート用
- TC-023: `scaffold-handlers.ts` に `handleRulesNew`・`handleReviewersNew` が named export ✅
- TC-024: `managed.ts` に `handleRuntimeSetup`・`handleRuntimeStatus`・`handleRuntimeReset` が named export ✅

### 11. TC-027 テスト実装の確認（mock 方針）

- `from-issue.test.ts`: `vi.mock("../run.js")` で `runRun`・`runRunCore` のみ mock → 実 `handleJobStart`（`COMMANDS["job"].children["start"].handler`）を使用 ✅
- `command-registry-resume.test.ts`: `vi.mock("../resume.js")` で `runResume` のみ mock → 実 `handleJobResume` を使用 ✅
- handler 本体（guard・routing・`process.exit` の写し）が mock factory に存在しない ✅

### 12. TC-029: bin/specrunner.ts 差分なし

- `git diff main -- bin/specrunner.ts` → 出力なし（差分ゼロ）✅

### 13. TC-030: metrics.md の実測値

- `specrunner/changes/command-registry-handler-extraction/metrics.md` が存在 ✅
- 全 10 項目（行数・inline handler 数・named handler 数・registry process.exit・全体 process.exit・fs/credential import・handler module 数・SCC 数・CLI contract command 数・./dynamic import 数）に before/after と計測コマンドを記載 ✅
- Production process.exit 件数（`src/`+`bin/`、テスト除外）: T-19 前後で 98 → 98（変化なし）✅

### 14. 全テスト green

- verification-result.md: build / typecheck / test / lint / changed-line-coverage すべて passed ✅
- architecture-ratchet.test.ts: 15 tests green ✅
- cli-contract-snapshot.test.ts: green ✅

---

## 検証できなかった項目

- TC-028 の「base `483c75f7` から fixture を手動再生成し diff を確認」: base commit へのアクセスが必要なため実行不能。fixture の内容は `command-registry.ts` の現在の COMMANDS ツリーと整合しており、`toEqual` テストが green であることを確認済み。
- metrics.md の実測値の独立再計測: 計測コマンドは記載済みであり、conformance-result-003.md の確認値と内容的に整合。

---

## Findings 詳細

### F1（low / observation）: architecture-ratchet.test.ts の重複ヘルパー関数

`listCliTsFiles()` と `listCliTsFilesNoTests()` が同一実装（`readdirSync(CLI_DIR).filter(...).map(...)`）を持つ。  
`readdirSync` は非再帰のため `__tests__/` サブディレクトリのファイルは自然に除外される — `NoTests` という名前は誤解を招くが、両関数が同じ結果を返すことで正確性は損なわれていない。  
Check 3（`listCliTsFiles`）と Check 5/6（`listCliTsFilesNoTests`）が同じファイル集合を使うため、二重定義を 1 つにまとめることで可読性が向上する。  
正確性への影響: **なし**（6 つのチェックはすべて正しく動作している）。

### F2（low / observation）: conformance-result-003.md の Architecture ratchet 表が 4 チェック止まり

conformance-result-003.md のサマリ表は「4 チェック実装済み（287行）」と記載しているが、実際のコードは 6 チェック 15 テスト 522 行である。  
これはパイプライン内の report が中間 iteration の情報を参照したことによる artifact 不整合であり、実装コードの問題ではない。

---

## 結論

すべての must priority TC（TC-001〜TC-012・TC-022・TC-025〜TC-030）が実装・green 確認済み。  
should priority TC（TC-013〜TC-021・TC-023〜TC-024）も全件実装済み。  
architecture ratchet 6 チェックがすべて AST または反射ベースで実装され、単純 grep 依存を回避している。  
CLI contract の構造的同一性が versioned JSON fixture で固定されている。  
指摘事項はすべて observation レベルであり、正確性・安全性への影響はない。
