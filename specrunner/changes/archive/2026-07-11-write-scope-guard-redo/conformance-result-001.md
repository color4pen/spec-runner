# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | All 9 tasks (T-01–T-09), every checkbox [x], verified against implementation |
| design.md | ✓ | D1–D7 all faithfully implemented; D7 deviation (2 TC-023 lines vs. "1") self-disclosed |
| spec.md | ✓ | All 7 Requirements and all Scenarios satisfied |
| request.md | ✓ | All acceptance criteria met; the "1 line" AC deviation acknowledged in design.md D7 |

---

## Detailed Findings

### tasks.md

All 9 tasks are marked `[x]` and verified against the implementation:

- **T-01** `createWorkspaceToolGuard(cwd)`: exported at `agent-runner.ts:119–145`. Deny logic uses `path.resolve` + `path.relative` with correct edge-case handling (empty relative → inside, `..`-prefix or absolute → outside). All tool inputs not matching `Edit`/`Write` return `allow`.
- **T-02** Query options rewire: `permissionMode: "default"` (line 433), base `allowedTools = ["Read","Bash","Grep","Glob"]` (line 423), MCP pre-approval appended conditionally on `reportTool` (lines 424–426), `canUseTool: createWorkspaceToolGuard(cwd)` (line 437). `disallowedTools`, `sandbox`, `stderr`, `model`, and other fields unchanged.
- **T-03** `buildWorkspaceSandbox`: `allowUnsandboxedCommands: false` at line 97. `sandbox.network`, `denyRead`, `allowRead` absent.
- **T-04** Probe: `scripts/probes/write-scope-guard-probe.ts` exists. `design.md §Probe Execution Log` contains the raw stdout with three `[PROBE] scenario=... verdict=PASS` lines. The "max turns" SDK message on the in-workspace scenario is expected (write succeeded before the cap; `file_created=true` confirmed). No docs/type-reading substituted for execution trace.
- **T-05** Guard unit tests `TC-FW-01..TC-FW-05`: all present in `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`.
- **T-06** Query-options freeze tests `TC-FW-06`, `TC-FW-07`: present, assert individual keys, cover `permissionMode`, `allowedTools` exclusion, MCP inclusion/exclusion, `canUseTool` type, `sandbox.allowUnsandboxedCommands`.
- **T-07** TC-023 update: `allowedTools` assertion → `["Read","Bash","Grep","Glob"]` (line 310), `permissionMode` → `"default"` (line 311). Exactly 2 assertions in 1 test; no other existing test modified.
- **T-08** `cross-boundary-invariants.md`: `src/adapter/**` present on line 9; no other content changed.
- **T-09** Verification: tasks.md records 6430/6430 tests green. One-shot (`query-one-shot.ts`) still carries `bypassPermissions` without `canUseTool`/`sandbox` — confirmed by grep. `local.ts` and codex adapter not in diff stat.

### design.md (D1–D7)

- **D1** `permissionMode: "default"`, Edit/Write removed from `allowedTools`: implemented at `agent-runner.ts:423–433`.
- **D2** `createWorkspaceToolGuard(cwd)`: pure factory, local type alias avoids direct SDK import (TC-024 safe). Wired once in `queryOptions`; propagates to all follow-up turns via `...queryOptions` spread.
- **D3** MCP pre-approval: `mcp__specrunner_report__${reportTool.name}` built from `REPORT_MCP_SERVER_NAME` constant (single-sourced). Conditional on `reportTool` presence.
- **D4** `allowUnsandboxedCommands: false` in `buildWorkspaceSandbox`; no `sandbox.network`/`denyRead`/`allowRead`.
- **D5** Probe in `scripts/probes/` (outside tsconfig/vitest/tsup globs). Raw log pasted in `design.md`. Three scenario verdict lines present.
- **D6** `src/adapter/**` appended to reviewer `paths`. No other reviewer content changed.
- **D7** Two TC-023 assertions changed (`allowedTools` + `permissionMode`). Deviation from "1 line" AC correctly attributed to the original criterion's oversight (it missed the `allowedTools` assertion). Self-disclosed in design.md. New `TC-FW-*` tests independently freeze the contract.

### spec.md

All 7 Requirements verified:

| Requirement | Verdict |
|---|---|
| Step agent denies Edit/Write outside workspace | ✓ — guard deny path confirmed; message names worktree (TC-FW-01, TC-FW-02) |
| In-workspace writes, non-write tools, malformed input remain allowed | ✓ — TC-FW-03, TC-FW-04, TC-FW-05 |
| Step-agent query options carry measured `default` configuration | ✓ — TC-FW-06 |
| report_result MCP pre-approved when configured | ✓ — TC-FW-07; absent when unconfigured (TC-FW-06) |
| dangerouslyDisableSandbox escape hatch disabled | ✓ — `buildWorkspaceSandbox` + TC-FW-06 |
| Runnable probe exists and raw log recorded in design.md | ✓ — file confirmed; three verdict lines in log |
| cross-boundary-invariants covers adapter layer | ✓ — `src/adapter/**` on line 9 of reviewer |
| One-shot, LocalRuntime.query, codex unchanged | ✓ — not in diff stat; one-shot grep confirms `bypassPermissions` + no guard |

### request.md (acceptance criteria)

| Criterion | Verdict |
|---|---|
| workspace 外 Edit/Write deny を canUseTool 単体テストで固定 | ✓ TC-FW-01, TC-FW-02 |
| workspace 内 Edit/Write と他 tool allow を単体テストで固定 | ✓ TC-FW-03, TC-FW-04, TC-FW-05 |
| query options 凍結（Edit/Write 非含有・MCP 条件付き含有・permissionMode "default"） | ✓ TC-FW-06, TC-FW-07 |
| probe スクリプト repo 存在 + design.md に実行生ログ（3 verdict 行） | ✓ |
| cross-boundary-invariants paths に `src/adapter/**` | ✓ |
| one-shot 系既存凍結テスト無変更で green | ✓ |
| 更新は TC-023 の 1 行のみ（偏差: 実際は 2 行） | ACCEPTED — D7 で自己開示済み。2 行とも本変更が書き換えるフィールドで、隠蔽なし。他既存テスト無変更 |
| `typecheck && test` が green | ✓ tasks.md T-09: 6430/6430 |

---

## Non-blocking Observations

**Pre-existing inconsistency (scope 外、本変更が導入したものではない)**: report_result follow-up retry ブロック（`agent-runner.ts` ~706–712）のコメントに「Remove MCP server from retry options」とあるが、対応する `delete retryOptions["mcpServers"]` 行が存在しない。postWork/outputVerification ターンでは明示的に削除されている。本変更以前から存在する挙動であり、本 request のスコープ外。
