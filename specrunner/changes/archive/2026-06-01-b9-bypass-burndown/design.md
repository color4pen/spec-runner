# Design: b9-bypass-burndown

## Context

`single-mutator-enforcement`（#492）で B-9 invariant「JobState.status は `transitionJob` 経由のみ」を立て、既存 bypass 3 箇所を `arch-allowlist.ts` に grandfather した（enforce 相）。本 change は burn-down 相として 3 箇所を `transitionJob` 化し、B-9 allowlist エントリを全削除して実違反ゼロを達成する。

bypass 3 箇所（scan で確定すること）:

| tracking | file | 直書き内容 |
|----------|------|-----------|
| B9-store-fail | `src/store/job-state-store.ts` `fail()` | `status: "failed" as JobStatus` |
| B9-exit-guard | `src/core/lifecycle/exit-guard.ts` | `status: "awaiting-resume"` |
| B9-signal-handler | `src/core/runtime/local.ts` signal-handler | `status: "awaiting-resume" as const` |

## Goals / Non-Goals

**Goals**:
- 3 箇所の status 直書きを `transitionJob` 経由に書き換える
- `arch-allowlist.ts` の B-9 エントリを全件削除（実違反ゼロ）
- B-9 arch test が green のまま regression guard を維持
- 各遷移が `VALID_TRANSITIONS` で合法であることを保証（または非合法ケースの扱いを記録）

**Non-Goals**:
- 他 invariant（B-1〜B-8）の変更
- B-9 検出ロジック自体の変更（#492 確定済）
- `architecture/model.md` の編集
- 振る舞いの意図的変更

## Decisions

### D1: `fail()` — `transitionJob` 化が安全

**選択**: `JobStateStore.fail()` 内で `transitionJob(state, "failed", { trigger, reason, patch })` を使う。

**遷移合法性の分析**:
- `VALID_TRANSITIONS` で `running → failed` は合法。
- `fail()` の全 call-site（10 箇所）を調査した結果、全て pipeline/step 実行中のエラーハンドラから呼ばれており、prior state は常に `running`:
  - `pipeline.ts:205` — executor が state 付きで throw しなかった safety net。pipeline 実行中なので `running`。
  - `executor.ts:218,271,294,350` — agent step の catch/error handling。step 実行は `running` 中に行われる。
  - `runner.ts:118,169` — workspace setup / init failure。job create 直後で `running`。
  - `runner.ts:191` — `diskState.status === "running"` で guard 済み。
  - `executor-helpers.ts:74,178` — session creation失敗 / polling-style step failure。step 開始時で `running`。
- `failed → failed` は noop（`transitionJob` の same-status check）。問題なし。

**patch フィールドの活用**: `error` と `step` を `TransitionContext.patch` に渡す。`transitionJob` が `updatedAt` と history を自動付与するため、現行 `fail()` の手動 `updatedAt` 設定が不要になる。

**Rationale**: 全 call-site の prior state が `running` であり、`running → failed` は合法。`VALID_TRANSITIONS` の変更は不要。

**Alternatives considered**:
- `canTransition` guard を先に挟む: call-site の prior state が確定しているため過剰防御。throw は万一のバグ検出として有益。

### D2: exit-guard — `transitionJob` 化が安全

**選択**: `exit-guard.ts` 内で `transitionJob(state, "awaiting-resume", { trigger: "exit-guard", reason })` を使う。

**遷移合法性の分析**:
- line 19 の `if (state.status !== "running") continue;` で prior state は `running` に限定されている。
- `running → awaiting-resume` は `VALID_TRANSITIONS` で合法。

**Rationale**: 既に guard があるため安全。

### D3: signal-handler (local.ts) — `canTransition` guard + `transitionJob`

**選択**: `local.ts` の signal-handler 内で `canTransition(current.status, "awaiting-resume")` を先にチェックし、合法な場合のみ `transitionJob` を呼ぶ。

**遷移合法性の分析**:
- signal handler は pipeline 実行中に登録され、`teardown()` で解除される。通常の prior state は `running`（合法）。
- しかし race condition window がある: pipeline が `awaiting-merge` に遷移した後、`teardown()` でハンドラが解除される前に SIGINT を受ける可能性。`awaiting-merge → awaiting-resume` は `VALID_TRANSITIONS` に**ない**（非合法）。
- `failed → awaiting-resume` は合法（fail() 直後に signal を受けるケース）。
- 非合法ケースで `transitionJob` が throw すると外側の catch で swallow され `process.exit(130)` に進む。これ自体は正しい挙動（awaiting-merge を awaiting-resume に戻すべきではない）だが、例外を flow control に使うのは意図が不明瞭。

**参考**: `managed.ts` の signal-handler は guard なしで `transitionJob` を直接呼んでおり、throw は catch で swallow。local.ts でも同パターンを踏襲し、guard は追加しない。

**修正**: `managed.ts` と同じパターンを採用。`transitionJob` を直接呼び、非合法遷移の throw は既存の catch で swallow する。

**Rationale**: managed.ts との一貫性。非合法遷移時は throw → catch → `process.exit(130)` で state は変更されず、正しい挙動が維持される。

**Alternatives considered**:
- `canTransition` guard を追加: managed.ts と不一致になる。先に guard を入れると throw によるバグ検出の機会を失う。
- `VALID_TRANSITIONS` に `awaiting-merge → awaiting-resume` を追加: 完了済みジョブを resume 状態に戻すのは意味的に不正。

### D4: B-9 suppression test は削除

**選択**: `core-invariants.test.ts` の `"does not flag status writes that are correctly allowlisted (B-9 allowlist suppression)"` テスト（line 685-700）を削除する。

**Rationale**:
- このテストは B-9 allowlist エントリが存在することを前提にした synthetic suppression test。B-9 エントリを全削除すると `b9Entries` が空になり、`filterViolations` がすべてを violation として返すため、テストが fail する。
- B-9 regression guard テスト（line 666-683）は B-9 エントリが空でも機能する: synthetic violation を inject し、`filterViolations(injectedMatches, [])` が violation を返すことを assert。空 allowlist で正しく動作。
- live B-9 scan test（line 428-464）も機能維持: bypass が解消されたので grep で直書きが見つからず、allowlist フィルタ不要で green。
- `filterViolations` の suppression ロジック自体は B-1 の allowlist エントリ（3 件残存）でカバーされている。
- synthetic entry に decouple する案は、B-9 エントリを 1 件残すことになり「実違反ゼロで allowlist 空」という目標と矛盾する。

**Alternatives considered**:
- synthetic B-9 entry に decouple（`event-bus-interface-demote` パターン）: B-9 は allowlist が空になるべきケースであり、synthetic entry を残すのは allowlist governance rule（"ONLY shrinks"）の精神に反する。B-1 に suppression テスト機能が残っているため B-9 で重複させる理由がない。

### D5: `fail()` の import 追加

**選択**: `src/store/job-state-store.ts` に `transitionJob` を `src/state/lifecycle.ts` から import する。

**レイヤー分析**: store（persistence 層）→ state（shared-kernel 層）への依存は下方向であり、B-3（shared-kernel → domain 禁止）に抵触しない。実際 `job-state-store.ts` は既に `src/state/schema.ts` を import しており、同層内の追加 import。

## Risks / Trade-offs

- [Risk] `fail()` 内の `transitionJob` が予期しない prior state で throw する → Mitigation: 全 10 call-site の prior state を分析し `running` であることを確認済み。万一の throw は既存の error handling（catch → rethrow）で捕捉される。
- [Risk] signal-handler の race condition で `awaiting-merge` から throw → Mitigation: 既存 catch で swallow、state 不変、`process.exit(130)` は正常実行。managed.ts と同パターン。
- [Risk] `transitionJob` が history entry を追加するため、`fail()` 呼び出し元の `appendHistory` と重複する → Mitigation: history は forensic ログであり、entry 追加は情報の増加（劣化ではない）。冗長でも正確性が優先。

## Open Questions

- なし。
