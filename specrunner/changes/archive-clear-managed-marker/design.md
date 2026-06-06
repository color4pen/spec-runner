# Design: archive 成功時に managed marker / liveness sidecar を削除する

## Context

machine-local sidecar は slug ごとに `.specrunner/local/<slug>/` 配下に置かれる。

- **managed marker** `.specrunner/local/<slug>/marker.json`（`{ slug, jobId, status, createdAt }`）— managed runtime job の存在を示す index。`job ls` の section 4（managed markers）はこれを起点に jobId を引いて jobs-dir state を読む。
- **local liveness sidecar** `.specrunner/local/<slug>/liveness.json`（`{ pid, session, worktreePath, jobId }`）— local runtime job の machine-local index。

この sidecar の lifecycle 削除は現状 2 経路にしかない。

- `cancel`（`src/core/cancel/runner.ts` の `cleanupJobResources`）— worktree 削除後に `managedMarkerPath(slug)` を best-effort `fs.unlink` する。
- managed teardown（`src/core/runtime/managed.ts` の `teardown` → `clearManagedMarker`）— terminal status で marker を best-effort `fs.unlink` する。

一方 `archive`（`src/core/archive/orchestrator.ts`）の Phase 2（worktree teardown）には sidecar 削除が無い。先行 change `decouple-jobs-dir-reads`（D5）が Phase 2 で liveness.json の `worktreePath` を `null` に repoint する処理を入れているが、marker.json は触らず、liveness.json も削除はしない。その change の Open Question は「archived local job の sidecar をいずれ撤去するか」を後続検討事項として残していた。

archive 後に marker.json が残ると `job ls` section 4 が古い jobId を拾い、幽霊 job を表示するリスクがある。cancel・teardown は marker を消すのに archive だけ抜けている対称性の欠落であり、本変更はこれを埋める。

### 触れる主な seam

- `src/core/archive/orchestrator.ts` — Phase 2。現状の liveness `worktreePath: null` repoint（`fs.readFile` → `fs.writeFile`）と、新規 sidecar 削除。
- `src/util/paths.ts` — `managedMarkerPath(slug)` / `livenessJsonPath(slug)`（再利用のみ。追加なし）。
- `src/core/finish/types.ts` の `FinishFs` — `unlink` を利用（既存メソッド。追加なし）。
- tests: `tests/unit/core/archive/orchestrator.test.ts`（TC-032 の挙動が repoint → delete に変わるため更新が必要）。

### sidecar 経由の error 伝播

archive orchestrator は `input.fs`（`FinishFs`）を関数内で `fs` に分解して使う（module の `node:fs/promises` を shadow）。CLI 実体 `buildRealFs().unlink`（`src/cli/archive.ts`）は node の `unlink` をそのまま await するため、ファイル不在時は `code === "ENOENT"` を持つ error を throw する。best-effort の error 分岐（ENOENT は silent / それ以外は warning）はこの error を catch して判定できる。

## Goals / Non-Goals

**Goals**:

- `archive` 成功時に対象 slug の `.specrunner/local/<slug>/marker.json` を削除する（best-effort）。
- `archive` 成功時に対象 slug の `.specrunner/local/<slug>/liveness.json` を削除する（best-effort）。
- marker / liveness の削除失敗で archive 全体を失敗させない。ファイル不在（ENOENT）は silent、それ以外の失敗は stderr に warning を出し、exit code・最終 status（`archived`）は不変に保つ。
- cancel / managed teardown と同じ「Phase 末尾で best-effort `fs.unlink`」パターンに揃え、archive の sidecar lifecycle を cancel・teardown と対称にする。
- `bun run typecheck && bun run test` を green に保つ。

**Non-Goals**:

- managed runtime の state 永続化先の変更（jobs-dir → slug。後続 request `managed-slug-keyed-state` で対応）。
- marker.json / liveness.json のフォーマット変更。
- 空になった `.specrunner/local/<slug>/` ディレクトリ自体の削除（後述 Open Question）。
- 新たな fs 抽象や共通 helper の追加（architect 評価: 新規抽象は不要）。

## Decisions

### D1: Phase 2 末尾に unconditional な sidecar 削除 step を追加する

`runArchiveOrchestrator` の Phase 2 で、worktree teardown と feature branch 削除の**後**に、対象 slug の sidecar 2 ファイルを best-effort で削除する step を 1 つ追加する。

- `path.join(cwd, managedMarkerPath(slug))` と `path.join(cwd, livenessJsonPath(slug))` を、それぞれ injected `fs.unlink`（`FinishFs.unlink`）で削除する。
- このブロックは `if (worktreePath)` の**外**に置く。managed job は worktree を持たず（`resolveWorktreePathForArchive` が convention path を返すケースも含め worktree 実体が無い）、`if (worktreePath)` 内に置くと marker が消えない経路が生じるため。
- `managed.ts` の `clearManagedMarker` と同一パターン（`path.join` + `fs.unlink` + try/catch）で、新規抽象は導入しない。

**Rationale**: cancel（`cleanupJobResources`）/ managed teardown（`clearManagedMarker`）が「Phase の最後に best-effort `fs.unlink`」で sidecar を消すのと同じ形に archive を揃える。slug は Phase 0 で確定済みのため追加の解決は不要。marker と liveness はどちらも `.specrunner/local/<slug>/` 配下にあり、slug だけで両方を特定できる。

**Alternatives considered**:
- *`.specrunner/local/<slug>/` を `rm -r` でディレクトリごと削除する*: `FinishFs` に再帰削除メソッドが無く、追加すると新規抽象になる（architect 評価「新規抽象は不要」に反する）。2 ファイルの `fs.unlink` で要件は満たせる。却下。
- *削除を `if (worktreePath)` 内に置く*: managed job（worktree 実体なし）の marker が消えず、本変更の主目的（幽霊 managed job の解消）を達成できない。却下。

### D2: 既存の liveness `worktreePath: null` repoint を削除に置き換える

先行 change（`decouple-jobs-dir-reads` D5）が Phase 2 の `if (worktreePath)` 内で行う liveness.json の `worktreePath: null` repoint（`fs.readFile` → JSON parse → `fs.writeFile`）を撤去し、D1 の削除に一本化する。同じ liveness.json を直後に削除するため、repoint write は dead write になる。

**Rationale**: archive は terminal 操作であり、archive 後の state 本体は `specrunner/changes/archive/<dated>-<slug>/state.json` に存在する。`JobStateStore.list()` の archived 区画（section 1b）と `resolveId()`（list ∪ sidecar）が archived job の jobId を引き続き解決できるため、liveness.json を消しても jobId index は失われない。先行 change の Open Question「archived local job の sidecar をいずれ撤去するか」への回答を本変更で「archive 時に撤去」と確定する。repoint を残すと「null を書いてから消す」dead code になりレビュー指摘の温床になる。

**Alternatives considered**:
- *repoint を残したまま削除を追加する*: liveness.json に `worktreePath: null` を書いた直後に同ファイルを削除する write-then-delete の dead code になる。意味の無い I/O とレビュー指摘を生む。却下。

### D3: 削除失敗は ENOENT を silent、それ以外を stderr warning とし archive を継続する

各 `fs.unlink` を個別の try/catch で囲み、archive 全体は失敗させない（exit 0 を維持）。

- error の `code === "ENOENT"`（ファイル不在）: silent no-op（warning なし）。
- それ以外の error: `stderrWrite` で warning を出し、処理を継続する。

**Rationale**: 要件 R3「削除失敗は archive 全体を失敗させない（best-effort、warning のみ）」を満たす。`clearManagedMarker` / cancel の marker 削除は全 error を silent に握り潰すが、本要件は失敗時の warning を明示要求しているため、ENOENT（正常な不在）と真の失敗を区別して後者だけ warning する。orchestrator は既に `stderrWrite`（`src/logger/stdout.js`）を import 済みで追加 import は不要。

**Alternatives considered**:
- *全 error を silent に握り潰す（`clearManagedMarker` と同一）*: R3 の「warning のみ」要件を満たせない。却下。
- *ENOENT も warning にする*: archive 対象が local-only / managed-only の場合、もう一方の sidecar は元々存在せず、毎回 spurious な warning が出てノイズになる。ENOENT は silent が適切。却下。

## Risks / Trade-offs

- [Risk] **TC-032 の挙動変更によるテスト破綻**: 既存 `tests/unit/core/archive/orchestrator.test.ts` の TC-032 は Phase 2 が liveness.json に `worktreePath: null` を `writeFile` することをアサートしている。D2 で repoint を削除に置き換えるため、このテストは失敗する。→ **Mitigation**: TC-032 を「Phase 2 が liveness.json を `fs.unlink` する」検証へ更新する（tasks T-02）。
- [Risk] **archived job の jobId 解決喪失の懸念**: liveness.json を消すと sidecar index から該当 jobId が消える。→ **Mitigation**: archive 後の state 本体は `changes/archive/<dated>-<slug>/` にあり、`list()` の archived 区画と `resolveId()` が jobId を解決できるため index は失われない。worktree も既に削除済みのため liveness sidecar を残す意味は無い。
- [Risk] **managed archive 経路の成熟度**: managed runtime の archive 経路自体は未成熟（先行 change の design が言及）。→ **Mitigation**: 本変更は marker 削除を best-effort で追加するのみで、managed の既存挙動を壊さない。marker が存在しなければ ENOENT で silent no-op になる。
- [Trade-off] **空ディレクトリの残置**: 2 ファイル削除後に `.specrunner/local/<slug>/` が空ディレクトリとして残る。`listLocalSidecars` は各 slug dir で liveness/marker を読み、不在なら skip するため幽霊 job は生じない。ディレクトリ自体の撤去は再帰削除メソッドを要し新規抽象になるため見送る。

## Open Questions

- 空になった `.specrunner/local/<slug>/` ディレクトリを撤去するか。現状放置でも `job ls` に幽霊は出ないため本変更では見送るが、sidecar base のクリーンアップを後続でまとめて行う余地がある。
