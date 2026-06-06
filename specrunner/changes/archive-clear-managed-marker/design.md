# Design: archive 後に managed marker が残り幽霊 job が表示される

## Context

`cancel/runner.ts` および `managed.ts` はそれぞれ `marker.json` を削除するが、`archive/orchestrator.ts` は削除しない。archive 後も `.specrunner/local/<slug>/marker.json` が残るため `job ls` の managed markers セクションが古い jobId を拾い、幽霊 job を表示するリスクがある。

`liveness.json` についても同様に、archive 完了後に worktree が除去されるにもかかわらずファイルが残る（Phase 2 では `worktreePath` を null に書き戻しているが、ファイル自体は残る）。

## Goals / Non-Goals

**Goals**:
- `archive` 成功時に `marker.json` を削除する（best-effort）
- `archive` 成功時に `liveness.json` を削除する（best-effort）
- 削除失敗は archive 全体を失敗させない

**Non-Goals**:
- managed runtime の state 永続化先の変更
- marker / liveness のフォーマット変更
- `marker.json` / `liveness.json` を削除するための新規抽象の導入

## Decisions

**D1 — `marker.json` を Phase 2 完了後に best-effort unlink する**

archive orchestrator の Phase 2（worktree teardown）の後に `fs.unlink(managedMarkerPath(slug))` を呼ぶ。`cancel/runner.ts` の `clearManagedMarker` と同じパターンを踏襲し、ENOENT を含む全エラーを無視する（local runtime には marker が存在しないため ENOENT は正常ケース）。新規抽象は不要。

Rationale: cancel・teardown と対称性を持たせる。新規抽象を追加すると依存関係が増えるが、1 行の unlink で十分。

**D2 — `liveness.json` を Phase 2 完了後に best-effort unlink する（write-back パターンから削除へ変更）**

現在の Phase 2 は `worktreePath: null` を書き戻しているが、archive 完了後にファイルを読む用途はない。`fs.unlink(livenessJsonPath(slug))` に置き換える。

Rationale: request.md の要件 R2 は「削除する」と明示している。worktree が除去された後にファイルを保持する理由がなく、write-back より unlink のほうがシンプル。ENOENT は無視（worktreePath なしで実行した場合はファイルが存在しない可能性がある）。

## Risks / Trade-offs

[Risk] ENOENT サイレント → `unlink` 失敗時に stderr warning を出さない（ENOENT の場合）。archive 全体は成功する。
Mitigation: best-effort の設計意図と一致しており、cancel と同じ扱いとする。

[Risk] 他プロセスが同時に `liveness.json` を読む → unlink タイミングが重なる可能性。
Mitigation: archive Phase 2 完了後（worktree 除去済み）に実行するため、liveness を読む agent プロセスは既に存在しない。

## Open Questions

なし
