# divergence status — 状況断面（snapshot・mutable・非 authority）

> **これは状況断面（point-in-time snapshot）であり、構造の authority ではない。**
> 構造の定規は `model.md`（層 / closure / B-x 不変条件）で、本書は「actual がそこへどれだけ収束しているか」の現状記録にすぎない。設計書（`model.md` / `components.md` / `domain-model.md` / `conformance.md`）は時間に依存しない構造のみを持ち、状況断面は持たない。
> **live な真実**は歯: `tests/unit/architecture/core-invariants.test.ts`（検査）＋ `tests/unit/architecture/arch-allowlist.ts`（既知 divergence の grandfather 台帳、削除のみで縮む ratchet）。本書はその人間向け要約。

## 現状（2026-08-28 時点）

- **B-1〜B-18 ＋ §3 DSM closure に対する実 divergence = ゼロ**（`tests/unit/architecture/` 全 126 test green、2026-08-28 実測）。
- `arch-allowlist.ts` の残エントリ実数: **B-1×3**（`R2-*-adapter` — composition-root が adapter を import する §3 許可 edge の記録であり**違反ではない**）／ **B-6×9** ／ **B-12×6** ／ **CWD×40** ＝ 計 58 entry（2026-08-28 実数確認）。CWD ratchet・repo-root confinement は B-x 番号を持たない delete-only ratchet（`model.md` §6）。
- **既知の未解消 divergence（コード側）: なし**。
- **前回断面（2026-08-20）以降に取り込まれた弧**: agent-context-observability（#1070 — `CommandInvocation` に context 観測面を追加）→ fresh-session rollover（#1076 — `DomainEvent` に `step:rollover` を追加）→ cross-boundary-invariants の Codex provider 実行（#1077）→ push capability preflight（#1078 — 既存 `src/git/` に shared-kernel module `push-capability.ts` を追加）。構造面の変化は kernel の型/イベント列挙と既存層内の module 追加に限られ、新しい層・cross-layer edge は生んでいない。B-6 allowlist には known-safe call-site として `B6-codex-auth-json-read`（#1077）と `B6-runner-push-capability-detect`（#1078）の 2 entry が追加された（B-6×7 → ×9）。
- **定義 doc の追随（2026-08-28・リリース前正本同期）**: 2026-08-24 断面以降に着地した 3 弧 — 単相 archive（#1083 `single-phase-archive`）→ reopen/resume の分離（#1088 `split-reopen-from-resume`）→ fixer への unpushable-path 2 層適用（#1086 `fixer-unpushable-path-coverage`）— を正本に反映。`model.md` B-17 の遷移表記を `awaiting-archive → awaiting-resume` に修正、`dynamic-model.md` の reopen を「状態巻き戻しのみ（pipeline 実行・再開位置選択は `job resume --from` の責務）」に更新、`components.md` の archive 節を Archive subsystem（record / plain 編成 / cleanup / merge 後完了の所有境界を分解）として merge 前に完結する単相 archive へ更新、同 StepExecutor に「`unpushable-path` は commit 前ゲート対象外（adapter follow-up + commit/push 時 backstop が担当）」を明記。構造 ADR `2026-08-28-single-phase-pre-merge-archive` を追加（ADR-20260612 / ADR-20260603 の「merge 済みが archive の前提」部分を amend。両 ADR の他の決定は有効のまま）。いずれもコード側の構造変化は既存層内に閉じ、新しい層・cross-layer edge は生んでいない。
- **定義 doc の追随（2026-08-20）**: issue 起点 lifecycle（`core/issue-target/` — start / resume face）と checkpoint 検証の二層分離（generic integrity / use-case policy）を `components.md` に、reattachment の locator（candidate 発見）／ checkpoint identity（確定）の 2 相分離を `dynamic-model.md` に反映。構造 ADR `2026-08-20-issue-not-job-authority` を追加（issue body = request source ／ Development link = locator ／ branch-borne checkpoint = identity・state authority の役割固定）。
- **前回断面（2026-08-17）以降に取り込まれた弧**: request lifecycle 一本化（draft consume-on-start）→ `job start --from-issue` → checkpoint 検証 policy 分離 → spec-review 単一 fixer ループ → issue-target start face → `job resume --from-issue`（`specrunner/adr/` の 2026-08-17〜2026-08-20 各 ADR が behavior 正典）。構造面の変化は新 domain サブディレクトリ `core/issue-target/`（DSM 被覆内・cli 非依存）と `core/attach/` の policy 分離（cross-layer import なし）に限られ、pipeline step 集合の変化（build-fixer / test-materialize 廃止・bite-evidence 追加・test-case-gen の spec-review 前倒し・spec-review ⇄ spec-fixer 単一ループ化）は descriptor（コード正典）内の変化であり構造 divergence を生んでいない。
- **収束済み（2026-07-31）**: 構造 ADR `2026-07-31-deterministic-request-entrance` の実装が完了。B-18 は `model.md` §4 に ratify 済み・歯（`request-entrance-llm-boundary.test.ts`）は barrel 再導入の検知として維持。
- **scope/permission サブシステム ＋ pipeline 選択 ＋ fast profile は反映済み**（弧 #689→#692→#693→#694）。`PIPELINE_REGISTRY` は `standard` / `design-only` / `fast` の 3 本で、`permissionScope` 宣言は `fast` の 1 件。

## burn-down 履歴（どの change が何を解消したか）

正典は git 履歴 ＋ `specrunner/changes/archive/`。主なもの:

| invariant / 課題 | 解消した change |
|---|---|
| B-2 SDK 直 import / domain SDK 型 | `move-sdk-to-adapter` / `runtime-sdk-to-adapter` |
| B-3 core↔parser 循環 | `parser-kernel-demote` |
| B-3 step-names back-edge | `step-names-kernel-demote` |
| B-3 port types 上向き | `port-types-kernel-demote` |
| B-3 EventBus 上向き | `event-bus-interface-demote` |
| B-4 util→core | `util-leaf-purify` |
| B-6 env seam | `env-seam-hygiene` |
| B-7 出力 seam | `progress-mask-seam` |
| B-8 runtime 分岐集約 | `runtime-branch-consolidation` |
| B-9 単一 mutator（歯＋bypass 解消）| `single-mutator-enforcement` / `b9-bypass-burndown` |
| B-10 host↔token 束縛（歯＋enforce）| `github-host-config` |
| 歯を core/request scoped → src 全体へ | `arch-upward-edge-ratchet` / `arch-test-core-wide-ratchet` / `arch-closure-src-wide` |
| DSM domain→comp-root (5) | `dsm-runtime-strategy-demote`（`RuntimeStrategy`/prereqs を ports 降格）|
| DSM adapter/ports→domain (16) | `dsm-domain-type-demote`（共有型を `src/kernel/` 等へ降格）|
| permissionScope / scope breach 機械導出（第2 escalation 源）| `scope-exceeded-escalation` |
| B-11 concrete runtime の能力 interface（歯＋`RealRuntimeStrategy`）| `scope-unevaluable-fail-closed` |
| B-12 subprocess seam 限定（`node:child_process` 直 import 封じ込め）| `subprocess-credential-seam` |
| B-13 StepExecutor 単一書き込み禁止（`CommitOrchestrator` が唯一の state committer）| `sequential-single-writer` |
| B-14 StepHalt 適用オーナー集約（`transitionJob` / `attachStateAndRethrow` を CommitOrchestrator に集約）| `sequential-single-writer` |
| B-13 並列 round の single-writer（member no-persist・`CommitOrchestrator.commitRound` 一括）| `round-owned-state-commit` |
| B-15 round git 副作用の coordinator 所有（scoped staging・非宣言 halt）| `round-owned-git-effects` |
| B-18 request 入口の LLM 到達封じ（port/adapter/barrel import 禁止＋dispatch 点、歯＋§4 ratify）| `deterministic-request-entrance` |
| B-16 round 入力の不変性（共有 `deps` を in-place 変更しない・resume 配布）| `round-immutable-input` |
| pipeline 選択（Meta）＋ 着手前 capability gate | `pipeline-selection-capability-gate` |
| fast profile（最初の `permissionScope` 宣言）| `fast-pipeline` |
| ADR `2026-08-01-slug-occupancy-and-attempt-identity`: start guard 状態基準（`assertSlugUnoccupied`）・slug 解決非 terminal 優先（`resolveJobStateBySlug`）・cancel jobId 束縛 teardown・managed guard 有効化 | `slug-occupancy-enforcement` |
| B-13 の禁止 API に `appendOperatorEvent` を追加（reopen の operator-event 記録に伴う歯の拡張）| `job-reopen-from-awaiting-archive` |
| B-18 の LLM port 列挙に `IssueFidelityComparator` を追加（歯＋§4。`issue-request-fidelity-gate` で増えた 4 本目の LLM port の封じ込め）| 本 doc 追随 commit |
| liveness 生存判定の sidecar pid 採用に jobId 照合（`dynamic-model.md` liveness 所有規則への実装追随。stale-running 判定・`job wait` を `resolveJobPid` に収束）| `liveness-probe-jobid-scope` |

### ratchet 変動（#945 以降）

- **追加**: `B6-runner-foreground-notice`（前景実行 notice の env 参照、`src/core/command/runner.ts`）— detach 内蔵化の弧で追加。`CWD-from-issue-reporoot-di-default`（`src/cli/from-issue.ts` の repoRoot DI 既定）— `job start --from-issue` の弧で追加。
- **削除**: `CWD-finish-resolve-target-di-default` — 対象ファイル `src/core/finish/resolve-target.ts` が死コード削除で消滅。
- **構造変化（divergence を生んでいない）**: barrel / 死コード削除（`core/port/index.ts`・`core/step/index.ts`・`core/event/index.ts`・`core/doctor/index.ts`・`store/index.ts`・`state/store.ts`・`state/reconcile.ts`、`core/tools/`・`core/validation/` ディレクトリ消滅）／ glob matcher 3 実装の `util/glob-match.ts` 統一／ 新 core サブディレクトリ `lifecycle/`・`liveness/`・`gate/`・`inbox/`（いずれも domain 層として DSM 被覆内）。

## enforcement / 配線の status

- **歯（決定的レビュー B-1〜B-18 + closure）**: 実装済み（`core-invariants.test.ts` src 全体 ＋ `request-entrance-llm-boundary.test.ts` ＋ `module-boundary.test.ts` ＋ `write-scope-invariants.test.ts` ＋ `invariant-catalog-parity.test.ts`）。
- **writer 注入**（`architecture/` を design/implementer の prompt へ）: 未着手（step prompt の実在注入 seam は `adapter/shared/` — `conformance.md` 消費点1）。
- **reviewer 注入**（review criteria に B-1〜B-18 を追加）: 未着手。
- **`tests/` 二重構造（`tests/core/` と `tests/unit/`）整理**: 未着手。
- T1 trust（branch protection）: private repo・owner 手動 gate のため対象外。
- **実行所有権モデル（`adr/2026-07-13-execution-ownership-model.md`、ADR accepted）**: 構造判断（D1〜D4 の所有権配置）は実装・ratify 完了。**B-13（逐次＋並列）/ B-14 / B-15 / B-16 を歯・§4・conformance.md (A) へ昇格済み**。逐次経路は `sequential-single-writer`、並列 round の state single-writer は `round-owned-state-commit`、git 副作用の round 所有は `round-owned-git-effects`、入力の不変性は `round-immutable-input` で解消。逐次・並列の両経路が `CommitOrchestrator` の単一書き込みへ収束し、共有 worktree の commit 帰属は宣言出力への scoped staging＋非宣言 halt に置換。実 divergence = ゼロ（git round commit と state commit の二相境界の revision reconciliation は将来 request）。
