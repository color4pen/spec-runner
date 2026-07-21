# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コード主張のファクトチェック

**`src/core/step/commit-push.ts`**

- **Line 48**: `const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A"]);`
  — `commitAndPush` 関数（sequential step 用）の staging が `git add -A`（worktree 全体）であることを確認。✅
- **Line 115**: `const addResult = await spawnFn("git", ["add", "-A"], { cwd });`
  — `commitFinalState` 関数の staging も同様に `git add -A` であることを確認。✅
- **Line 183**: `const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);`
  — `commitScopedPaths` 関数（並列 round 用）の scoped variant が既に存在することを確認。✅

**`src/core/step/spec-review.ts:80-87`**

```ts
reads(state: JobState, deps: StepDeps): IoRef[] {
  const folder = changeFolderPath(deps.slug);
  return [
    { path: `${folder}/spec.md` },
    { path: `${folder}/design.md` },
    { path: `${folder}/tasks.md` },
  ];
},
```
— reads() が spec.md / design.md / tasks.md のみで request.md を含まないことを確認。✅

**`src/prompts/rules.ts`**

— `RULES_MD_CONTENT` 文字列テンプレートに step × touch 可能 / 禁止の責任範囲表が存在することを確認。✅

**`src/core/step/types.ts`**

— `export * from "../port/step-types.js"` の 1 行 re-export バレル。
  `reads?()` / `writes?()` は実体として `src/core/port/step-types.ts` の `AgentStep` / `CliStep` インターフェース内で `IoRef[]` を返す optional method として宣言されていることを確認。✅

### 2. "列挙可能" vs "広域 write" step の分類

各 step の `writes()` 戻り値を検証:

| Step | writes() の内容 | 分類 |
|------|----------------|------|
| request-review | result file + attestation（確定パス） | 列挙可能 |
| design | design.md / tasks.md / spec.md（確定パス） | 列挙可能 |
| spec-review | spec-review-result file（確定パス） | 列挙可能 |
| spec-fixer | design.md / spec.md（確定パス） | 列挙可能 |
| test-case-gen | test-cases.md（確定パス） | 列挙可能 |
| code-review | review-feedback file（確定パス） | 列挙可能 |
| conformance | conformance-result file（確定パス） | 列挙可能 |
| adr-gen | specrunner/adr/ 配下（確定パス） | 列挙可能 |
| implementer | `{ artifact: "gitState" }` のみ | 広域 write |
| build-fixer | `{ artifact: "gitState" }` のみ | 広域 write |
| code-fixer | `{ artifact: "gitState" }` のみ | 広域 write |

— request 記載の分類（implementer / build-fixer / code-fixer が列挙不能）と一致。✅

### 3. `commitAndPush` の呼び出し経路

`src/core/runtime/local.ts:669` で `finalizeStepArtifacts` が全 sequential step に対し `commitAndPush`（`git add -A`）を呼んでいることを確認。並列 round は `local.ts:822` で `commitScopedPaths` に分岐していることを確認。

### 4. 既存 scoped variant の流用可能性

`commitScopedPaths`（`commit-push.ts:172-206`）はパスリストを受け取る独立関数として実装済みであり、sequential step からも呼び出し可能な形になっている。✅

### 5. 受け入れ基準の検証可能性

全 6 項目が単体テスト / 型チェックで検証可能:
1. judge step scoped staging → テスト可能（`commitScopedPaths` モック）
2. 広域 step fail-closed halt → テスト可能（diff mock + 違反 path 検証）
3. 既存テスト無改変 green → `typecheck && test` で確認
4. write-scope 単一ソース整合性 → テスト可能（定義 vs rules.ts 比較）
5. spec-review reads() に request.md → テスト可能（unit test）
6. `typecheck && test` green → CI で確認

## 検証できなかった項目

None

## Findings 詳細

None — typed findings は report_result で報告（findings 0件）。

### 参考: minor な観察事項

`src/core/step/types.ts` は re-export バレルであり、IoRef・reads()/writes() の実体宣言は `src/core/port/step-types.ts` に存在する。request.md の記述は「各 step は reads() / writes() を宣言する（IoRef[]）」という意味では正確だが、正確な宣言ファイルは `port/step-types.ts` である。実装上の影響なし（observation のみ）。
