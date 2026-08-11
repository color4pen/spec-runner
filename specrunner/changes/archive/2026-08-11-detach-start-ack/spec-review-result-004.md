# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings 解消状況

前周の decision-needed 指摘（F-01: request.md の resume.ts:291 参照誤記）を最優先で確認した。

| 前周 finding | 状態 |
|---|---|
| [low/decision-needed] request.md の resume.ts:291 参照が liveness sidecar の更新を誤記 | ✅ **解消** — 現在の request.md（L26）は「resume 時の liveness sidecar 更新は workspace-materializer.ts:91 / :117 で行われる。resume.ts:291 の transitionJob は state.json の pid フィールドの更新である」と正確に記述している |

### コード参照の実地検証（全件）

| 参照 | 検証結果 |
|---|---|
| `src/core/command/detach.ts:105-130` (detachSelf 現行) | ✅ 同期関数・spawn + guidance + return 0 の構造を確認 |
| `src/cli/command-registry.ts:427-442` (run/start detach branch) | ✅ `detachSelf(...)` 呼び出し後 `process.exit(code)` — 現在は同期 |
| `src/cli/command-registry.ts:696-711` (resume detach branch) | ✅ 同上 |
| `src/cli/command-registry.ts:84 / :91 / :116` (USAGE 「即座に return」) | ✅ 全行に "即座に return" の変種が存在する — T-03 で更新対象 |
| `src/cli/command-registry.ts:231-232` (JOB_RESUME_USAGE --detach) | ✅ "returns immediately" が存在する — T-03 で更新対象 |
| `src/cli/job-wait.ts:141-143` (default deps) | ✅ `notFoundRetryCount: 5`, `notFoundRetryIntervalMs: 2000` |
| `src/cli/job-wait.ts:180-193` (not-found retry loop) | ✅ `for (let attempt = 0; attempt < deps.notFoundRetryCount; attempt++)` |
| `src/util/paths.ts:301` (livenessJsonPath) | ✅ `${LOCAL_SIDECAR_BASE}/${slug}/liveness.json` |
| `src/core/runtime/workspace-materializer.ts:91` (resume-existing sidecar) | ✅ `await this.host.writeLivenessSidecar(slug, jobId, plan.worktreePath)` |
| `src/core/runtime/workspace-materializer.ts:117` (resume-recreated sidecar) | ✅ `await this.host.writeLivenessSidecar(slug, jobId, newWorktreePath)` |
| `src/core/command/resume.ts:291` (transitionJob + state.json pid patch) | ✅ `patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid }` — state.json の更新であり sidecar 更新ではないことを確認 |
| `src/core/runtime/local.ts:369-376` (no-worktree sidecar write) | ✅ L376: `await this.writeLivenessSidecar(slug, jobId, null)` |
| `src/core/runtime/local.ts:1432-1433` (writeLivenessSidecar シグネチャ) | ✅ `pid: number \| null = process.pid` |
| `src/util/spawn.ts` SpawnBackgroundOptions | ✅ `onExit` は現在なし — T-01 で追加対象 |

### design.md 設計判断検証（D1〜D7）

- **D1（sidecar pid identity）**: resume stale sidecar（dead pid）と spawn child pid の不一致により誤 ack を防ぐ設計。workspace-materializer の writeLivenessSidecar 呼び出しで子の pid が書き込まれることをコードで確認。✅
- **D2（exit event・zombie 回避）**: `process.kill(childPid, 0)` は zombie に対して成功するため polling は不適。exit event は reap と同時に発火する。コード上 `unref()` しても親が生存中は event が届く（setTimeout が event loop を保持）。✅ 設計正確。
- **D3（登録優先順序）**: sidecar は disk に残るため、子が登録後即死しても次 tick で成功と判定可能。チェック順序（registration → death）が register-then-die race を正しく解消する。✅
- **D4（N=40 tail）**: design.md Open Questions に operator-confirmed 値として固定済み。✅
- **D5（deps injection / DI object）**: `JobWaitDeps` と同スタイル、spawn 同期実行後に ack ループへ進む。detach-flag-cli.test.ts L39 の `mockReturnValue(0)` → `mockResolvedValue(0)` への更新が T-05 でカバー済み。✅
- **D6（job wait hint）**: `job-wait.ts:190-193` への hint 追記、retry 窓変更なし。既存 TC-018 への影響なし（exit code・retry 数は変わらない）。✅
- **D7（単一定義 failure text）**: `buildDetachStartFailure` export → output-contract テストで pin。✅

### spec.md 要件カバレッジ確認

request.md の要件 1〜6・受け入れ基準と spec.md の Requirement / Scenario を全件突合。

| 要件 | spec.md カバレッジ |
|---|---|
| 親が登録完了 or 子死亡まで exit しない（process-death-gated） | ✅ Requirement 1 + 「親が exit しない間」「登録完了で exit 0」Scenario |
| exit 0 は発見可能状態の保証 | ✅ Requirement 2 + job wait 直後・resume stale sidecar Scenario |
| 失敗伝播（log tail + フルパス + GENERAL_ERROR） | ✅ Requirement 3 + spawn failure Scenario + register-then-die Scenario |
| job wait hint | ✅ Requirement 4 |
| help 文言・単一定義 failure text | ✅ Requirement 5 |
| foreground / 子の不変条件 | ✅ Requirement 6 |

### tasks.md タスク完全性確認

T-01 → T-02 → T-03 → T-04 → T-05 → T-06 の 6 タスクが揃い、受け入れ基準が要件と 1:1 対応。

- T-05 に `detach.test.ts` 更新が明示されている（design Risk "Test-scope gap" が根拠）。TC-001/002/003 の sync-assert がある detach.test.ts を未更新のまま放置すると `typecheck && test` が hang → 正しくスコープ内。
- T-06 統合テストのセマフィア: seam 注入で実 child process なし。fixture で state.json + sidecar を配置し `detachSelf` resolves SUCCESS → `loadState` が job を発見する流れを検証する設計は合理的。

### セキュリティ確認

- **パストラバーサル**: SLUG_REGEX（`/^[a-z0-9][a-z0-9-]{0,63}$/`）が `detachSelf` 呼び出し前に適用（run 側: `resolveSlugForDetach`、resume 側: `SLUG_REGEX.test` ガード）。スラッシュ・ドットを含むスラグは不可能。✅
- **detach log 読み戻し**: `getDetachLogPath(repoRoot, slug)` はバリデーション済みスラグから決定論的に構築。アプリプロセスが自分で書いたログを読み返すだけで外部 input を経路にしない。✅
- **OWASP A01/A03/A05**: 権限昇格・インジェクション・設定ミス いずれも該当なし。環境変数パススルー（rawEnv）は `pid identity` 観点での問題なし（子プロセスは自身の credential を継承するだけ）。✅

## 検証できなかった項目

- writeLivenessSidecar が呼ばれる前に state.json が確実に書かれるという fsync レベルの ordering 保証は未検証（既存 codebase と同水準の信頼で足りる）。
- no-worktree + resume の組み合わせでの sidecar 書き込みパス（local.ts の resume 分岐）は詳細追跡なし。D1 の pid identity 基準は worktree mode に依存しないため実装正確性への影響は限定的。

## Findings 詳細

### F-01: design.md の spec-fixer-deferred コメントが解消済み問題を参照している（stale）

**severity**: low
**resolution**: fixable

design.md 末尾の HTML コメント（`<!-- spec-fixer-deferred: ... -->`）は、request.md の旧テキスト「resume 子は pid を自身のものに更新して persist する（src/core/command/resume.ts:291）」を修正するよう促す内容である。しかし当該テキストは **現在の request.md には存在しない** — request.md（L26）はすでに正確なテキスト（"resume 時の liveness sidecar 更新は workspace-materializer.ts:91 / :117 で行われる。resume.ts:291 の transitionJob は state.json の pid フィールドの更新である"）を持っている。

このコメントは修正が完了した問題を指しており、残留することで「未修正の課題あり」と誤解させるリスクがある。spec-fixer が design.md からコメントを削除すれば解消できる。
