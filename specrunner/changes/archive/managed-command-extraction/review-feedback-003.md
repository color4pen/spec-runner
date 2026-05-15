# Review Feedback — Iteration 3

- **date**: 2026-05-15
- **reviewer**: code-reviewer
- **verdict**: approved

## Summary

Iteration 2 で指摘した 2 件の ERROR は両方とも解消されている。新規 doctor check (`agentProviderAliveCheck` / `environmentProviderAliveCheck`) が `managedChecks` に追加され、`SPECRUNNER_API_KEY` を使った provider 側生存確認（GET `/v1/agents/{id}?beta=true` / `/v1/environments/{id}?beta=true`、`anthropic-beta: managed-agents-2026-04-01` header）を実装。`managed reset --help` も `MANAGED_RESET_USAGE` 経由で orphan note 付きで表示される。INFO の DoctorConfig JSDoc も fix 済み。`bun run typecheck` および `bun run test`（157 files, 1875 tests）は green。

受け入れ基準・test-cases.md の must 36 件はすべてカバー。Confidence 80% 以上の blocking finding なし。

## Findings

なし（critical / major）。以下は approve を阻害しない minor のみ。

### minor — provider-alive check のユニットテスト未作成

**File**: `src/core/doctor/checks/agents/agent-provider-alive.ts`、`src/core/doctor/checks/agents/environment-provider-alive.ts`

**Issue**: iter 2 ERROR を解消する 2 つの新規 check（合計 224 行）が追加されたが、対応するユニットテスト (`tests/core/doctor/checks/agents/agent-provider-alive.test.ts` 等) が存在しない。test-cases.md TC-DR-006 は受け入れ基準として「active provider の SDK 経由で API 疎通が確認される / agent ID / environment ID の provider 側生存が確認される」を述べているが、これは「実装が存在する」レベルで満たされているため must テストとしては green。ただし `anthropicKeyValidCheck` には `tests/core/doctor/checks/auth/anthropic-key-valid.test.ts` がある（同種の fetch + status 401/404/timeout 分岐ロジック）ため、整合性の観点から新規 check にも同様のテストがあるのが望ましい。

**Fix**: `agent-provider-alive.test.ts` / `environment-provider-alive.test.ts` に以下のシナリオを追加することを推奨（次の iteration あるいは後追い PR で可）:
- `SPECRUNNER_API_KEY` 未設定 → warn skip
- agentId / envId が config に無い → fail
- fetch 200 → pass
- fetch 401 → fail with key invalid hint
- fetch 404 → fail with `managed setup` hint
- fetch 5xx → warn
- AbortError / timeout → warn

### minor — `init.ts` の `--runtime managed` エラーメッセージ表現

**File**: `src/cli/init.ts:16`

**Issue**: delta-spec.md L32 のエラーメッセージは `--runtime flag is no longer supported. Run 'init' for config scaffold, then set SPECRUNNER_API_KEY and run 'managed setup'.` と規定。実装は `init no longer sets up managed runtime. Run 'init' for config scaffold, then set SPECRUNNER_API_KEY and run 'managed setup'.`。意味は同等で migration path も含まれており TC-INIT-002 は実質 pass するが、文言が逐語的に一致しない。

**Fix**: delta-spec.md の文言に合わせて `init no longer sets up managed runtime.` を `--runtime flag is no longer supported.` に修正することを推奨。

### info — `agents-registered` / `environment-registered` と新規 provider-alive の責務重複

**File**: `src/core/doctor/checks/agents/agents-registered.ts`、`src/core/doctor/checks/agents/agent-provider-alive.ts`

**Issue**: `agents-registered` は config に登録された agentId の存在確認（軽量）、`agent-provider-alive` は provider 側の API 疎通確認（重量）。前者で missing 検出した role を後者でも `missing.push(role)` で再検出するため、出力に重複が出る可能性がある（テスト網羅されている範囲では問題ない）。registry を分離するか、`agent-provider-alive` が `agents-registered` の結果を前提に skip するパターンが望ましいが、各 check が独立であることを優先する現設計の方が DoctorCheck の独立性原則に沿っているため、blocking ではない。

**Fix**: 不要（informational のみ）。

## Acceptance Criteria Coverage

| Criterion (request.md L168-199) | Status |
|----------------------------------|--------|
| `managed setup` idempotent reconciliation | ✅ |
| `managed setup` 不足リソース create | ✅ |
| `run` 中 404 → SDK エラー伝播（自動 recovery なし） | ✅ |
| `SPECRUNNER_API_KEY` 未設定で early-fail | ✅ |
| `managed status` (API 通信なし) | ✅ |
| `managed reset` environment delete + config clear | ✅ |
| `managed reset --help` orphan note 明示 | ✅ (`MANAGED_RESET_USAGE`) |
| `init` 雛形のみ | ✅ |
| `init --runtime managed/local` でエラー停止 | ✅ |
| runtime デフォルト `"local"` 反転 | ✅ (`migrate.ts:113`) |
| schema から `anthropic` 削除 | ✅ |
| call site 全て env var に移行 | ✅ (`grep config.anthropic src/` → 0件) |
| `migrate.ts:112-113` 反転 | ✅ |
| `migrate.ts:117-125` 削除 | ✅ |
| `schema.ts:95` D7 コメント更新 | ✅ |
| `configIncompleteError` ヒント更新 | ✅ (`'specrunner login' first.`) |
| `managedChecks` hint = `'specrunner managed setup'` | ✅ |
| `managed reset` 後 `agents = {}` | ✅ |
| 0600 permission warning 維持 | ✅ |
| `checkRuntimePrereqs(cfg, env)` 新設 | ✅ |
| `run` で `checkRuntimePrereqs` を Step 2.5 として通す | ✅ (`preflight.ts:75-82`) |
| `RUNTIME_PREREQ_MISSING` エラーで停止 | ✅ (`errors.ts:52`) |
| `checkConfigComplete` 縮退 | ✅ (`schema.ts:332-340`、github のみ) |
| `tests/unit/core/preflight.test.ts` 6 ケース | ✅ |
| doctor registry 3 配列分離 | ✅ |
| doctor runner runtime 別 assembly | ✅ (`doctor.ts:115-119`) |
| `doctor` managed で provider API 検証 | ✅ (iter 3 で追加された 2 check) |
| `doctor` local で managed check 不実行 | ✅ |
| `--help` `login` 説明更新 | ✅ |
| 標準フロー (managed) 例示 | ✅ (`command-registry.ts:58`) |
| `bun run typecheck && bun run test` green | ✅ (157 files, 1875 tests pass) |

## Test Coverage

test-cases.md must 36 件・should 10 件のうち、must 全件が実装でカバーされている。

### managed-setup (5 must / 2 should)
- TC-MS-001 happy path → ✅ (`runManagedSetup creates agents and environment` test)
- TC-MS-002 idempotent → ✅ (`reuses existing environment` test)
- TC-MS-003 env var 欠落 early-fail → ✅
- TC-MS-004 SDK error 伝播 → ✅
- TC-MS-005 rollback → ✅ (`rolls back created agents when environment creation fails`)
- TC-MS-006 旧 anthropic 削除 (should) → ✅ (`saveConfig` で一元 strip)
- TC-MS-007 部分 agent (should) → AgentSyncer 単体テストで間接的にカバー

### managed-status (2 must / 2 should)
- TC-MST-001 full output → ✅ (`shows full managed status` test)
- TC-MST-002 local 表示 → ✅

### managed-reset (6 must / 1 should)
- TC-MR-001 `--force` reset → ✅
- TC-MR-002 prompt y → ✅
- TC-MR-003 prompt n → ✅
- TC-MR-004 orphan warning 出力 → ✅
- TC-MR-005 reset 後 config 形状 → ✅ (`agents = {}`, environment undefined)
- TC-MR-006 `reset --help` orphan note → ✅ (`MANAGED_RESET_USAGE`)
- TC-MR-007 environment.id 未設定で skip → ✅

### init (3 must / 2 should)
- TC-INIT-001〜005 → ✅ (`tests/init.test.ts`)

### config-schema (9 must / 2 should)
- TC-CS-001〜009 → ✅ (typecheck で構造、`runtime-config.test.ts` で挙動)

### preflight (10 must)
- TC-PF-001〜006 → ✅ (`preflight.test.ts` の 6 ケース)
- TC-PF-007 schema.ts に process.env 結合なし → ✅ (preflight.ts に隔離)
- TC-PF-008 Step 2.5 として呼ばれる → ✅ (`preflight.ts:74-82`)
- TC-PF-009 404 自動 recovery なし → 設計通り (`agent-runner.ts` 等で SDK error は伝播)
- TC-PF-010 6 ケース実装 → ✅

### doctor (6 must / 1 should)
- TC-DR-001〜006 → ✅ (`checks/index.ts` で 3 配列、provider-alive 2 件追加)
- TC-DR-007 doctor.ts の runtime 判定 → ✅ (`doctor.ts:115-119`)

### api-key-migration (5 must)
- TC-AK-001〜005 → ✅ (`grep config.anthropic src/` 0件、`grep AnthropicConfig src/` 0件)

### help (4 must / 1 should)
- TC-HELP-001〜005 → ✅ (`command-registry.ts` の USAGE 構成)

### build-and-test (4 must)
- TC-BT-001 typecheck → ✅ (0 errors)
- TC-BT-002 test → ✅ (157 files, 1875 tests, all green)
- TC-BT-003 mock config 更新 → ✅
- TC-BT-004 managed.test.ts カバレッジ → ✅ (setup 4 / status 2 / reset 5 = 11 件 + happy path init)

## Iteration 2 → 3 差分サマリ

| Finding (iter 2) | Status |
|------------------|--------|
| ERROR: TC-DR-006 provider-side doctor check 欠如 | ✅ fixed (新規 2 check 追加) |
| ERROR: TC-MR-006 `managed reset --help` 未実装 | ✅ fixed (`MANAGED_RESET_USAGE` + help flag) |
| INFO: DoctorConfig JSDoc | ✅ fixed (`types.ts:110`) |

| Finding (iter 3) | Verdict impact |
|------------------|---------------|
| minor: provider-alive check のユニットテスト未作成 | approved 阻害なし |
| minor: init.ts `--runtime managed` 文言が delta-spec と非一致 | approved 阻害なし |
| info: agents-registered と provider-alive の責務重複 | approved 阻害なし |
