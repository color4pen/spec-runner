# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（全 8 箇所）

1. **`src/adapter/claude-code/agent-runner.ts:443-446`** — `baseAllowedTools = ["Read", "Bash", "Grep", "Glob"]` + conditional MCP tool 追加を確認。Bash は allowedTools に含まれており canUseTool を素通りする（request の主張と一致）。

2. **`src/adapter/claude-code/agent-runner.ts:121-150`** — `createWorkspaceToolGuard(cwd)` は `Edit`/`Write` のみを対象とし、他の全 tool（Bash 含む）は終端で `{ behavior: "allow", updatedInput: input }` を返す（request の主張と一致）。

3. **`src/adapter/claude-code/agent-runner.ts:94-104`** — `buildWorkspaceSandbox(cwd)` を確認。`failIfUnavailable: false`、`filesystem.allowWrite: [cwd, cwd/**]`、`allowUnsandboxedCommands: false`、`autoAllowBashIfSandboxed: true`（request 記載の項目すべて一致）。

4. **`src/core/port/agent-runner.ts:113-141`** — `AgentRunContext` インターフェースを確認。`step / state / branch / slug / cwd / config / requestType / input / session / policy / emit` のみを持ち、宣言 writes / staging mode を運ぶ field は存在しない（request の主張と一致）。

5. **`src/core/step/step-context-builder.ts:130-157`** — `ctx: AgentRunContext` 組み立て点を確認。`step`・`state`・`deps`（`deps.slug` を含む `StepDeps = StepContext`）・`cwd` が揃っており、`step.writes?.(state, deps)` と `stagingModeFor(step.name)` の計算が可能（request の主張と一致）。

6. **`src/core/step/write-scope.ts`** — leaf module を確認:
   - `GUARDED_WRITE_STEPS` → :33-39（implementer / build-fixer / code-fixer / test-materialize / adr-gen）✅
   - `stagingModeFor` → :51-53 ✅
   - `protectedCanonPaths` → :64-74（request.md / spec.md / design.md / tasks.md / test-cases.md / attestation）✅
   - `forbiddenWritePaths` → :104-112（canon − declared）✅

7. **`src/core/pipeline/round-git-scope.ts:104-106`** — `pipelineManagedPaths(slug)` = [state.json, events.jsonl, usage.json, bite-evidence-result.md] を確認（request の主張と一致）。

8. **`scripts/probes/write-scope-guard-probe.ts`** — 現行 3 シナリオ（out-of-workspace-write / in-workspace-write / report_result）を確認。Bash / git は未検証（request の「Bash / git は未検証」記述と一致）。

### 追加検証

- **managed adapter の permission surface 不在**: `src/adapter/managed-agent/agent-runner.ts` に `canUseTool` / `allowedTools` / `permission` の記述なし → managed runtime は対象外という R4 主張を確認。
- **`query-one-shot.ts` が bypassPermissions を使用**: `src/adapter/claude-code/query-one-shot.ts:136` で `permissionMode: "bypassPermissions"` を確認 → utility query は canUseTool 非経由で R4（対象外）が成立。
- **`StepDeps` に `slug` フィールド存在**: `src/core/port/step-context.ts:17` で `slug: string` を確認 → `buildStepContext` 内で `deps.slug` 経由のアクセス可能。
- **`AgentStep.writes?` の返り値型**: `src/core/port/step-types.ts:218` で `writes?(state, deps): IoRef[]` を確認。`IoRef` は `.path: string` を持ち（step-types.ts:21-23）、実装側は `.path` を抽出して guard に渡す形になる（実装上の注意点だが request の記述と矛盾しない）。

### 設計整合性

- R1（Bash を canUseTool 経由に載せ替え）→ `allowedTools` から外すだけで canUseTool に発火する SDK 挙動は probe で実測済みと request が明記。現行コードと合わせて整合している。
- R2（git 状態変更 deny）→ 合成モデル成立後に agent の git 状態変更用途が消えたという根拠が明示されており設計判断の記録も一致。
- R3（Write/Edit scope deny 拡張）→ `buildStepContext` での計算、`write-scope.ts` の既存関数再利用、`AgentRunContext` への threading という設計方針が実コードの構造と整合している。
- R4（commit 層不変）→ 既存の `write-scope.ts` / `commit-push.ts` / egress テスト群を無変更で維持することが明示されており、多重防御の独立性が保たれる。
- R5（probe 拡張 5 シナリオ）→ 現行 probe の 3 シナリオと対比して追加する 5 シナリオが明確に定義されており、実装可能。

受け入れ基準は R1〜R5 の各要件をカバーしており、破壊確認（修正前の挙動に戻すとテストが fail する）の要求も含まれている。

## 検証できなかった項目

None — 全コードアサーションと設計主張を確認できた。

## Findings 詳細

None（指摘なし）。
