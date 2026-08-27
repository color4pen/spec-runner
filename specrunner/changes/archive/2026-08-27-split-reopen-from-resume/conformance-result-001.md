# Conformance Result — split-reopen-from-resume (Iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. spec R1 — reopen は awaiting-archive → awaiting-resume に遷移し、pipeline を起動しない

**確認内容**: `src/core/command/reopen.ts` を全文読解した。

- `ReopenCommand` は `extends CommandRunner` を持たない standalone class (`export class ReopenCommand`)。
- `execute()` の処理順は: worktree-guard → job-resolution → status-gate → PR-gate
  → `appendOperatorEvent` → `transitionJob(state, "awaiting-resume", ctx, { allowReopen: true })`
  → `persist` → `return 0`。
- workspace 構築・keepAlive・pipeline launcher への呼び出しはコード中に存在しない。
- TC-001（exit 0、`status === "awaiting-resume"`）・TC-002（`status === "running"` が persist されない）で検証済み。

### 2. spec R2 — 不適格 job は拒否される

**確認内容**: `reopen.ts` の status gate (L118-131) と PR gate (L134-178) を確認。

- status ≠ "awaiting-archive" → `return 1`
- PR番号なし → `return 1`
- GitHub client なし → `return 1` (fail-closed)
- API失敗 → `return 1` (fail-closed)
- PR state = MERGED → `return 1`
- PR state = CLOSED → `return 1`
- 各拒否ケースで `persist()` は呼ばれない。
- TC-003(archived)、TC-004(canceled)、TC-005(MERGED)、TC-006(CLOSED)、TC-007(no client/API error)、TC-030(no PR number) すべて検証済み。

### 3. spec R3 — 既存 evidence は保持される

**確認内容**: `reopen.ts` L220 の patch 定義を確認。

- patch: `{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: null }` のみ。
- `steps`、`reviewerStatuses`、`decisions`、`biteEvidence` は patch に含まれない。
- `pid` は `process.pid` ではなく `null`（pipeline を起動しないため）。
- TC-008（steps と reviewerStatuses の保持）、TC-009（patch フィールドが run-control のみ・pid が null）で検証済み。

### 4. spec R4 — operator event は state 遷移前に記録される

**確認内容**: `reopen.ts` L204-224 の呼び出し順を確認。

- `appendOperatorEvent` が先（L204-209）、`persist(transitioned)` が後（L224）。
- operator event に `fromStep` フィールドなし。
- TC-010（呼び出し順: `invocationCallOrder` で検証）、TC-011（`fromStep` が `undefined`）で検証済み。

### 5. spec R5 — `--from` は reopen で受け付けない

**確認内容**: `src/cli/command-registry.ts` の `reopen` subcommand flags 定義（L1219-1225）を確認。

- `flags` に `reason`、`verbose`、`quiet`、`json`、`no-worktree` のみ。`from` エントリなし。
- `from-flag-no-enum.test.ts` TC-004 がフラグパーサーの reject を検証済み。
- `command-registry-reopen.test.ts` TC-012-a が `reopenCmd?.flags?.["from"]` が `undefined` を検証済み。

### 6. spec R6 — resume が reopen 後の唯一の実行 entry point

**確認内容**: `src/state/lifecycle.ts` VALID_TRANSITIONS を確認。

- `VALID_TRANSITIONS["awaiting-resume"] = new Set(["running", "canceled"])` は変更なし。
- `canTransition("awaiting-archive", "running")` は `false`。
- TC-013 が `canTransition("awaiting-resume", "running") === true` を検証。
- TC-015 が `ResumeCommand.prepare()` が `awaiting-archive` で throw することを検証。

### 7. spec R7 — REOPEN_TRANSITIONS opt-in の call-site 限定 (B-17)

**確認内容**: `lifecycle.ts` の `REOPEN_TRANSITIONS`、`core-invariants.test.ts` の B-17 テストを確認。

- `REOPEN_TRANSITIONS`: `awaiting-archive → new Set(["awaiting-resume"])`。
- `{ allowReopen: true }` リテラルが `src/` 配下で存在するのは `src/core/command/reopen.ts` のみ
  （lifecycle.ts の `opts?.allowReopen === true` は別のパターン；コメント行は B-17 フィルタで除外）。
- B-17 テスト（liveness check + violation detection）が green。
- `canTransition("awaiting-archive", "awaiting-resume")` は `false`（TC-017-d）。

### 8. spec R8 — Actions workflow が reopen + resume を明示的に compose する

**確認内容**: `.github/workflows/specrunner-dispatch.yml` L208-247 の `elif [ "$ACTION" = "reopen" ]` ブロックを確認。

- `bun ./bin/specrunner.ts job reopen "$SLUG" --reason "$REASON"` (L244)
- `set -- --from "$FROM"` + `[ -n "$PROMPT" ] && set -- "$@" --prompt "$PROMPT"` (L245-246)
- `bun ./bin/specrunner.ts job resume "$SLUG" "$@"` (L247)
- `job reopen` が non-zero で失敗すると shell が exit し `job resume` は実行されない（`|| true` なし）。
- TC-019 (7 subtests) が YAML コンテンツを検証済み。

### 9. REOPEN_USAGE に --from が不在 / guide の二段階フロー記述

**確認内容**: `command-registry.ts` REOPEN_USAGE、`guide.ts` escalation topic (L356-369) を確認。

- REOPEN_USAGE の Options ブロックに `--from` 行なし。`resume --from` への誘導注記あり。
- `guide escalation` セクション 3 が「Step 1: reopen（lifecycle 遷移のみ）、Step 2: resume（pipeline 再開）」を明示。

### 10. OperatorEventRecord.fromStep が optional に変更された

**確認内容**: `src/store/event-journal.ts` L143 を確認。

- `fromStep?: string`（optional）に変更済み。
- 後方互換：既存 `fromStep` あり record は fold() で正常に収集される（TC-009-a, TC-009-b）。
- 新しい record は `fromStep` なし（TC-009-c, TC-024）。

---

## 検証できなかった項目

None — 全 normative items を実装コードおよびテストファイルで直接確認した。

---

## Findings 詳細

指摘なし。

全 normative 要件（request.md 受け入れ基準 8 件、spec.md SHALL/MUST 要件 8 件・
Scenario 17 件相当）が実装で満たされている。
アーキテクチャ不変条件 B-17 の liveness と violation detection は保持されており、
call-site は `src/core/command/reopen.ts` のみに限定されている。
