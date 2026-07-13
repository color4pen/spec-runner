# divergence status — 状況断面（snapshot・mutable・非 authority）

> **これは状況断面（point-in-time snapshot）であり、構造の authority ではない。**
> 構造の定規は `model.md`（層 / closure / B-x 不変条件）で、本書は「actual がそこへどれだけ収束しているか」の現状記録にすぎない。設計書（`model.md` / `components.md` / `domain-model.md` / `conformance.md`）は時間に依存しない構造のみを持ち、状況断面は持たない。
> **live な真実**は歯: `tests/unit/architecture/core-invariants.test.ts`（検査）＋ `tests/unit/architecture/arch-allowlist.ts`（既知 divergence の grandfather 台帳、削除のみで縮む ratchet）。本書はその人間向け要約。

## 現状（2026-07-14 時点）

- **B-1〜B-14 ＋ §3 DSM closure に対する実 divergence = ゼロ。**
- `arch-allowlist.ts` の残エントリは `B-1` の `R2-*-adapter` 3件のみ。これは composition-root（`core/runtime/`）が adapter を import する §3 許可 edge の記録であり、**違反ではない**。
- 定義 doc の追随: judge findings の検証 seam / Finding VO / 導出純関数の所在を `components.md`・`domain-model.md` に反映、構造 ADR `2026-06-10-findings-verification-seam` を ratify 済み。
- **scope/permission サブシステム ＋ pipeline 選択 ＋ fast profile を反映済み**（弧 #689→#692→#693→#694）: B-11（concrete runtime の能力 interface）を `model.md` §4 ＋歯に追加、`permissionScope` / `Finding.origin` / scope derivation（機械導出の第2 escalation 源）を `domain-model.md`・`components.md` に、pipeline 選択 / 着手前 capability gate / scope checkpoint 束縛を `dynamic-model.md` に反映。`PIPELINE_REGISTRY` は `standard` / `design-only` / `fast` の 3 本で、`permissionScope` 宣言は `fast` の1件。

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
| pipeline 選択（Meta）＋ 着手前 capability gate | `pipeline-selection-capability-gate` |
| fast profile（最初の `permissionScope` 宣言）| `fast-pipeline` |

## enforcement / 配線の status

- **歯（決定的レビュー B-1〜B-14 + closure）**: 実装済み（`core-invariants.test.ts`、src 全体）。
- **writer 注入**（`architecture/` を design/implementer の prompt へ）: 未着手。
- **reviewer 注入**（review criteria に B-1〜B-12 を追加）: 未着手。
- **`tests/` 二重構造（`tests/core/` と `tests/unit/`）整理**: 未着手。
- T1 trust（branch protection）: private repo・owner 手動 gate のため対象外。
- **実行所有権モデル（`adr/2026-07-13-execution-ownership-model.md`、ADR accepted）**: 構造判断（D1〜D4 の所有権配置）は採用済み。**B-13 / B-14 は `sequential-single-writer` で ratify 済み**（歯・§4・conformance.md (A) 昇格完了）。残 divergence: 並列 round の共有 base・可変 `deps`・中間 persist（crash 時に member 部分状態が残りうる）／ 共有 worktree への `git add -A` による commit 帰属の実行順依存（B-15/B-16 は proposed のまま）。実装 PR ごとに §4 ＋ `conformance.md` (A) ＋歯へ昇格し burn-down する。
