# divergence status — 状況断面（snapshot・mutable・非 authority）

> **これは状況断面（point-in-time snapshot）であり、構造の authority ではない。**
> 構造の定規は `model.md`（層 / closure / B-1〜B-10）で、本書は「actual がそこへどれだけ収束しているか」の現状記録にすぎない。設計書（`model.md` / `components.md` / `domain-model.md` / `conformance.md`）は時間に依存しない構造のみを持ち、状況断面は持たない。
> **live な真実**は歯: `tests/unit/architecture/core-invariants.test.ts`（検査）＋ `tests/unit/architecture/arch-allowlist.ts`（既知 divergence の grandfather 台帳、削除のみで縮む ratchet）。本書はその人間向け要約。

## 現状（2026-06-02 時点）

- **B-1〜B-10 ＋ §3 DSM closure に対する実 divergence = ゼロ。**
- `arch-allowlist.ts` の残エントリは `B-1` の `R2-*-adapter` 3件のみ。これは composition-root（`core/runtime/`）が adapter を import する §3 許可 edge の記録であり、**違反ではない**。

## doc ↔ code 断面（transient・in-loop change が解消）

- `domain-model.md` §Aggregate / `components.md` §JobStateStore は **event-sourced target** を記述（`JobState` を event journal / projection / liveness に分解、`StepOutcome.fileContent` 除去・`modelUsage` を Aggregate 外へ、branch-borne slug 配置）。**コード（`src/state/schema.ts`・`src/store/job-state-store.ts`）はまだ旧 monolithic**（`fileContent`/`modelUsage` 現存、`.specrunner/jobs/<jobId>.json` 配置）。
- realize は in-loop change `minimal-state-slug-dir`。land で解消。
- 新不変条件の歯は **ratify 待ち**（構造 ADR `2026-06-05-event-sourced-branch-tracked-state.md` の B-11 候補 ＝ journal append / projection overwrite は `JobStateStore` 経由のみ）。

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

## enforcement / 配線の status

- **歯（決定的レビュー B-1〜B-10 + closure）**: 実装済み（`core-invariants.test.ts`、src 全体）。
- **writer 注入**（`architecture/` を design/implementer の prompt へ）: 未着手。
- **reviewer 注入**（review criteria に B-1〜B-10 を追加）: 未着手。
- **`tests/` 二重構造（`tests/core/` と `tests/unit/`）整理**: 未着手。
- T1 trust（branch protection）: private repo・owner 手動 gate のため対象外。
