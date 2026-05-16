# Code Review - managed-reset-status-stale-guard (Iteration 3)

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-16

---

## Summary

iter 2 で唯一未解決だった F-04（TC-MR-NEW-012 のアサーション未追加）が iter 3 で解消された。`tests/unit/cli/managed.test.ts:415` で local な `stdoutSpy` を宣言し、`tests/unit/cli/managed.test.ts:425` で `not.toContain("This will delete the Anthropic Environment")` を assert することで「runtime 不一致 + `--force` 時に既存 destructive prompt が出力されない（二重確認防止）」を test レベルで明示。

実装コード（`src/cli/managed.ts`、`src/cli/command-registry.ts`、`specrunner/specs/managed-cli-commands/spec.md`）には変更なし。typecheck / test ともに green（162 files, 1933 tests passed）。

iter 1 で挙げた F-01〜F-04 はすべて解決済み。test-cases.md の **must** 優先度テストケースは全てカバーされている。

---

## Findings

### Resolved iter 2 findings

| iter 2 finding | 対応 | 状況 |
|---|---|---|
| F-01 (TC-MR-NEW-012 アサーション未追加) | `tests/unit/cli/managed.test.ts:415,425` で `stdoutSpy` 追加と `not.toContain` 追加 | 解決 |

iter 3 で新規に検出された問題はなし。

---

## Verification Results

### Correctness（spec 要件との一致）

- **req-1 (managed status 拡張)**: `src/cli/managed.ts:147-159` で `Runtime: local` 出力後に `hasStaleManagedConfig(config)` で stale を判定し、`environment.id` / `agents.<role>` を個別に列挙。design.md と一致。
- **req-2 (managed reset runtime 不一致 guard)**: `src/cli/managed.ts:189-237` で `runtime !== "managed"` 分岐を独立配置。stale なし → early return（L190-193）、stderr 警告（L195-197）、non-TTY 中断（L200-204）、`promptConfirm` 確認（L205-209）、SDK delete（L213-228）、`agents={}` + `environment` 削除 + `runtime` 削除（L231-234）、`logSuccess("Reset stale managed fields.")`（L235）。設計通り。
- **req-3 (data flow)**: stale false → "Nothing to reset" early return / stale true → 警告 → confirm → reset の流れが design.md L83-99 と完全一致。
- **req-4 (--force 拡張)**: `MANAGED_RESET_USAGE`（`src/cli/command-registry.ts:102`）に `(including when runtime is not managed)` 文言が追加されている。
- **req-5 (regression)**: `config.runtime === "managed"` path（`src/cli/managed.ts:239-282`）は構造的にそのまま維持され、既存 destructive prompt（L241-243）→ SDK delete → `logSuccess("Config reset.")` → orphan warning が変更なし。テスト TC-MR-001/002/003/004/007 が green を確認。
- **req-6 (spec authority)**: `specrunner/specs/managed-cli-commands/spec.md` が新規作成され、Requirement 4 件（status 拡張 / reset guard / `--force` bypass / non-TTY 中断）と Scenario 5 件をすべて含む。既存 spec（`managed-agent-runtime/spec.md`、`cli-commands/spec.md`）は変更されていないことを `git diff main` で確認済み。

### Type Safety

- `hasStaleManagedConfig` シグネチャは `SpecRunnerConfig` 引数 → `boolean` 戻り値で明示。`any` なし。
- `process.stdin.isTTY` の参照は `(process.stdin as NodeJS.ReadStream).isTTY ?? false`（`src/cli/managed.ts:200`）で `unknown` ではない型に narrow。Node の標準型と整合。
- `runtime` フィールド削除に使用された `delete (newConfig as unknown as Record<string, unknown>)["runtime"]`（L233 / L275）は既存 managed path と同じパターン。`runtime?: ...` が optional のため `delete` は legal。`as unknown as` 二段 cast は `any` 回避のための定石。問題なし。
- SDK error の `status` 取り出し `(err as { status?: number }).status` も既存パターン踏襲。
- typecheck（`tsc --noEmit`）は no error。

### Edge Cases

- **非-TTY**: `(process.stdin as NodeJS.ReadStream).isTTY ?? false` で falsy 化、`!isTTY` → "Non-interactive mode requires --force to reset stale config." + return。`rm/runner.ts` パターン準拠（design.md D1）。
- **`--force` bypass**: `if (!opts.force)` ブロック全体（TTY 判定と prompt）を skip → SDK delete → reset へ直接進む。design.md D4 通り。
- **stale detection**: `environment?.id` truthy または `Object.keys(config.agents ?? {}).length > 0` のいずれか。両方 falsy → "Nothing to reset"。空 object `environment: {}` は id 未設定なので false 判定（TC-STL-004 通り）。
- **二重確認防止**: `runtime !== "managed"` path 内で `return`（L236）するため `runtime === "managed"` path には絶対落ちない。テスト 5-d で `not.toContain("This will delete the Anthropic Environment")` を assert。
- **完了メッセージ切り分け**: stale path → `"Reset stale managed fields."`（L235）、managed path → `"Config reset."`（L278）+ orphan warning（L279-281）。design.md D3 通り。

### Regression

- managed path のロジック（`src/cli/managed.ts:239-282`）は完全に元の挙動を保持。既存テスト TC-MR-001 (`--force`)、TC-MR-002 (TTY `y`)、TC-MR-003 (TTY `n`)、TC-MR-004 (orphan warning)、TC-MR-007 (env.id 未設定) はすべて green。
- `runManagedStatus` も `runtime === "managed"` 分岐（L161-174）は無変更。TC-MST-001 が green。

### Spec.md completeness

`specrunner/specs/managed-cli-commands/spec.md` の内容を verify:

| 要件 | Spec での記載 |
|---|---|
| status 拡張（stale 列挙） | L6-20 Requirement + 2 Scenarios |
| reset runtime 不一致 guard（4-step 手順） | L22-39 Requirement + 1 Scenario |
| `--force` bypass | L41-45 Scenario + L53-55 Requirement |
| non-TTY 中断 | L47-51 Scenario + L57-59 Requirement |
| 二重確認防止（SHALL NOT） | L33 |
| 完了メッセージ「Reset stale managed fields.」 | L31, L45 |

req-6 で要求された Requirement / Scenario はすべて記述されている。

---

## Test Coverage

### must 優先度テストケース カバレッジ

| TC | カバー先 | 状況 |
|---|---|---|
| TC-MST-NEW-001 (stale 両方) | test 5-a (L198-213) | OK |
| TC-MST-NEW-002 (agents のみ) | L250-265 | OK |
| TC-MST-NEW-003 (env.id のみ) | L267-282 | OK |
| TC-MST-NEW-004 (stale なし) | test 5-b (L215-225) | OK |
| TC-MST-NEW-005 (managed regression) | TC-MST-001 (L227-248) | OK |
| TC-MR-NEW-001 (Nothing to reset) | 5-h (L478-487) | OK |
| TC-MR-NEW-002 (`--force` で reset) | 5-d (L405-430) | OK |
| TC-MR-NEW-003 (non-TTY 中断) | 5-e (L432-450) | OK |
| TC-MR-NEW-004 (TTY `y` で reset) | L489-512 | OK |
| TC-MR-NEW-005 (TTY `n` 中断) | 5-f (L452-476) | OK |
| TC-MR-NEW-010 (managed regression) | TC-MR-001 (L286-305) | OK |
| TC-MR-NEW-011 (managed `n` で abort) | TC-MR-003 (L334-361) | OK |
| TC-MR-NEW-012 (二重確認防止) | 5-d L425 `not.toContain` | OK |
| TC-STL-001/002/003 (hasStaleManagedConfig) | 5-a / 5-b / 5-h 経由で間接的に検証 | OK |
| TC-SPEC-001 (新規 spec 存在) | `specrunner/specs/managed-cli-commands/spec.md` 存在 | OK |
| TC-SPEC-002/003 (既存 spec 不変) | `git diff main` で確認 | OK |
| TC-TYPE-001 (typecheck) | `bun run typecheck` no error | OK |
| TC-TYPE-002 (test) | 1933 tests passed | OK |

must 全件カバー済み。

### should 優先度

- TC-MST-NEW-006（複数 agents 列挙）: 未テストだが、`for (const [role, record] of Object.entries(...))` のループは複数 agent をそのまま列挙する単純な構造で、TC-MST-NEW-001（design 1 件）で同じ code path が検証されている。should なので blocking しない。
- TC-MR-NEW-007/008/009（SDK delete 系）: 未テストだが、stale path の SDK delete は managed path の TC-MR-001/004/007 と同一ロジック（コピー）であり code-level で挙動が保証されている。should なので blocking しない。
- TC-MR-NEW-006（空 Enter で中断）: 未テストだが、`promptConfirm` の `answer.trim().toLowerCase() === "y" || === "yes"` 判定は空文字列で false を返すため挙動は確実。should なので blocking しない。
- TC-STL-004（environment id なしで false）: 直接テストはないが、TC-MR-NEW-001（stale なしで early return）が `agents: {}` のみで pass しており同等の検証になる。should なので blocking しない。

### Help text

- TC-HELP-001（`--force` 説明）: `command-registry.ts:102` で `Skip confirmation prompt (including when runtime is not managed)` を確認。should だが満たされている。

---

## Verdict

- **verdict**: approved

iter 2 で残っていた F-04 が解決され、test-cases.md の must 優先度はすべてカバーされた。実装は spec / design / tasks すべてに整合し、typecheck / test も green。regression リスクなし。マージ可。
