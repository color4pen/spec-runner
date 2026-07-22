# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. allowedTools と canUseTool の発火経路（agent-runner.ts:443-446）

`src/adapter/claude-code/agent-runner.ts` 443-446 行を確認:

```ts
const baseAllowedTools = ["Read", "Bash", "Grep", "Glob"];
const allowedTools = reportTool
  ? [...baseAllowedTools, `mcp__${REPORT_MCP_SERVER_NAME}__${reportTool.name}`]
  : baseAllowedTools;
```

Bash が allowedTools に含まれるため、`permissionMode: "default"` 下では canUseTool を素通りする。request の主張と一致。

### 2. createWorkspaceToolGuard の対象範囲（agent-runner.ts:121-150）

121-150 行を確認。guard は `Edit` / `Write` のみ検査し、それ以外は末端で `{ behavior: "allow", updatedInput: input }` を返す。git コマンドを含む Bash には一切触れない。request の主張と一致。

### 3. sandbox 設定（agent-runner.ts:94-104）

`buildWorkspaceSandbox` は `failIfUnavailable: false`、`allowUnsandboxedCommands: false`、`filesystem.allowWrite: [cwd, "${cwd}/**"]` を返す。git 操作は制限されない。request の主張と一致。

### 4. AgentRunContext に writes/stagingMode が無いこと（port/agent-runner.ts:113-141）

`AgentRunContext` インターフェース（113-141 行）を確認。`step / state / branch / slug / cwd / config / requestType / input / session / policy / emit` のみ。宣言 writes / staging mode を運ぶ field は存在しない。request の主張と一致。

### 5. buildStepContext の組み立て点（step-context-builder.ts:130-157）

130-157 行の ctx 組み立てを確認。`step.writes?.(state, deps)` も `stagingModeFor` も呼ばれていない。request が「ここで計算できる」と述べている根拠が確認できた。

### 6. write-scope.ts の再利用可能関数群

- `GUARDED_WRITE_STEPS`（33-39 行）: implementer / build-fixer / code-fixer / test-materialize / adr-gen
- `stagingModeFor`（51-53 行）: GUARDED_WRITE_STEPS に属するかで "scoped" / "guarded" を返す
- `protectedCanonPaths`（64-74 行）: request.md / spec.md / design.md / tasks.md / test-cases.md / attestation の 6 パス
- `forbiddenWritePaths`（104-112 行）: protectedCanonPaths - declaredWritePaths

すべて request の主張と一致。

### 7. pipelineManagedPaths（round-git-scope.ts:104-106）

104-106 行: `[slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug), biteEvidenceResultPath(slug)]` — state.json / events.jsonl / usage.json / bite-evidence-result.md。request の主張と一致。

### 8. write-scope-guard-probe.ts の現行シナリオ

現行は 3 シナリオ（out-of-workspace-write / in-workspace-write / report_result）。Bash / git に関するシナリオは存在しない。request の「Bash / git は未検証」という記述と一致。

### 9. query-one-shot の bypassPermissions

`src/adapter/claude-code/query-one-shot.ts:136` で `permissionMode: "bypassPermissions"` を確認。utility query が agent step の canUseTool 経路を通らないという request の主張は正しい。

## 検証できなかった項目

### A. `provider-readiness-probe.ts:228-232`

`scripts/probes/` 配下には `write-scope-guard-probe.ts` のみ存在し、`provider-readiness-probe.ts` は見当たらない。ファイルが削除済みまたは別パスに移動した可能性がある。ただし、この参照は bypassPermissions の補足根拠に過ぎず、`query-one-shot.ts` で同内容を直接確認できたため、実装への影響はない。

## Findings 詳細

### Finding 1: `query-one-shot.ts` のパス記述が実際と異なる（note）

request.md に記載されたパス `src/core/runtime/query-one-shot.ts:135-136` は誤り。実際のファイルは `src/adapter/claude-code/query-one-shot.ts` に存在する。bypassPermissions の内容自体は実際のファイルで確認済み。implementer は正しいパスを参照すること。

### Finding 2: `provider-readiness-probe.ts:228-232` が存在しない（note）

scripts/probes/ に当該ファイルが見当たらない。request が参照している bypassPermissions の根拠は `query-one-shot.ts` で代替確認済み。実装への影響はないが、implementer は存在しないファイルへの参照に注意すること。
