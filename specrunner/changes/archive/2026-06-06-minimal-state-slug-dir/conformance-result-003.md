# Conformance Result — minimal-state-slug-dir — Iteration 3

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ⚠️ | T-01〜T-11, T-13(一部), T-14〜T-18 は全 [x] またはチェック済みの実装完了。T-12 は 2 サブタスク未完（job ls default filter・managed marker）。T-13 は worktree ⟺ 非終端の cleanup サブタスク未完。T-19 はチェックボックス未更新だが tests/typecheck は green |
| design.md | ✅ | D1〜D9 すべての設計判断が実装に反映されている |
| spec.md | ❌ | 2 要件に違反: `job ls` 既定が active only でない（SHALL 要件）、managed marker 列挙が未実装（MUST 要件） |
| request.md | ❌ | 受け入れ基準「`job ls` 既定が active のみ・`--all` で archive を含む」未満足。managed runtime active 列挙不可。`bun run typecheck && bun run test` は green (273 files / 3222 tests) ✅ |

---

## 詳細

### 実装スコープ（観測事実）

git diff stat: 46 files changed, +4311/-288

段1（T-01〜T-05）完全実装済み。段2 の大部分が実装済み：

- T-06: path helpers（`slugStateJsonPath` / `slugEventsPath` / `livenessJsonPath` / `managedMarkerPath` 等）追加済み
- T-07: `LocalRuntime` が worktree 内 `changes/<slug>/` を slug-mode `JobStateStore` で読み書き。step commit に含まれる
- T-08: `request.slug` / `request.path` を slug-mode `stateToStateJson` で strip 済み。`modelUsage` は events.jsonl から除去済み（`StepAttemptRecord` 不在、`stepRunToRecord` 非含）。`fileContent` は disk-level で除去済み（`stepRunToRecord` が outcome から除外）。型定義・コードパスの残存は code hygiene 課題
- T-09: `stateToStateJson` が slug mode 時に `worktreePath` / `pid` / `session` を strip。archive / cancel の worktreePath 解決に sidecar → convention 2段 fallback
- T-10: per-step `appendInvocation` で `usage.json` へ append 済み。`deriveAndWriteUsage` は no-op 化
- T-11: interruption record を executor / local.ts / exit-guard.ts で journal に append
- T-12: `JobStateStore.list()` が current checkout + local worktrees + split-layout + legacy の複合列挙を実装。**managed marker scan は未実装**。**`job ls` 既定フィルタ未修正**（後述 違反 1・2）
- T-13: `createExitGuardHandler(repoRoot, jobId)` per-job mode 実装済み。`isStaleRunning` が liveness sidecar pid 突き合わせ対応済み。worktree ⟺ 非終端の cleanup サブタスクは未整備
- T-14: 再 run 非破壊性（branch 名が `<prefix><slug>-<jobId8>` で新旧衝突しない）、複数 attempt の `job ls` 表示・`job cancel <jobId>` 個別片付け、すべて実装済み
- T-15: `load()` fallback で legacy `.json` 読み → `persist()` が新形式書き込みの移行経路実装済み
- T-16: `executor.finalizeStep` で `parsed.pullRequest` を state に materialize。`stateToStateJson` が `pullRequest` を保持。ps.ts / resolve-target.ts の読み手も動作
- T-17: `archiveChangeFolder` が `git mv` で `changes/<slug>/` ごと移動 → `state.json` / `events.jsonl` / `usage.json` が archive に含まれる
- T-18: doctor storage checks を新レイアウトに更新済み

### イテレーション 2 からの変更

| Fix | 状態 |
|-----|------|
| Fix-1: `modelUsage` を events.jsonl から除去 | ✅ 完了 — `StepAttemptRecord` に `modelUsage` フィールドなし、`stepRunToRecord` も含まない |
| Fix-2: `job ls` 既定フィルタを active only に変更 | ❌ 未完了 — 依然 `j.status !== "archived"` のまま |

---

### 違反 1: `job ls` 既定フィルタが active only でない（T-12 未完）

**場所**: `src/cli/ps.ts`

```typescript
} else {
  // TC-142: default — exclude archived
  jobs = allJobs.filter((j) => j.status !== "archived");
}
```

`ACTIVE_STATUSES = new Set(["running", "awaiting-resume"])` が `src/state/lifecycle.ts` で定義済みで、`--active` フラグでは正しく使われているが、default（既定）分岐では使われていない。`failed` / `canceled` / `awaiting-archive` / `terminated` が既定表示に含まれる。

**spec.md 違反**: "Requirement: active 列挙を worktree 不変量 + dual-read で成立させる"
> `job ls` 既定は active のみ、`--all` で archive を含む **SHALL**

**request.md 受け入れ基準違反**:
> `job ls` 既定が active のみ・`--all` で archive を含む

---

### 違反 2: managed marker write/clear が未実装（T-12 未完）

**場所**: `src/core/runtime/managed.ts` および `src/store/job-state-store.ts`

`managedMarkerPath()` helper（`.specrunner/local/<slug>/marker.json`）は `src/util/paths.ts` に定義済みだが:

- `managed.ts` にマーカーの write / clear ロジックなし
- `JobStateStore.list()` に managed marker scan なし

managed runtime で active な job が `job ls` に表示されない。Scenario「local runtime の active job（worktree あり）と managed runtime の active job（marker あり）が併存する → 両 runtime の active job が一覧に表示される」が成立しない。

**spec.md 違反**: "Requirement: active 列挙を worktree 不変量 + dual-read で成立させる"
> managed runtime は `.specrunner/local/<slug>/` の metadata marker で列挙 **MUST**

---

### 非ブロッキング（既知の残作業）

| 項目 | 状態 | 理由 |
|------|------|------|
| `StepOutcome.fileContent` 型定義・コードパスの残存（T-08） | ⚠️ code hygiene | disk-level では events.jsonl・state.json に含まれない。build-fixer の `fileContent` 欠落は empty string fallback で graceful。AC「files に fileContent が含まれない」は満足済み |
| `StepRun.modelUsage` 型定義・コードパスの残存（schema.ts / helpers.ts / executor.ts） | ⚠️ code hygiene | disk-level では events.jsonl に含まれない。唯一の消費者（`deriveFromJobState`）廃止済み |
| T-13: worktree ⟺ 非終端の cleanup 整備 | ⚠️ partial | exit-guard per-job mode・sidecar pid 突き合わせは実装済み。AC「自 worktree branch state に `awaiting-resume` を記録して resume 成立」「stale running を pid で判定」は満足済み |
| T-19: テストチェックボックス未更新 | ⚠️ stale checkbox | `bun run typecheck && bun run test` は green（273 files / 3222 tests）。test files の変更は git diff に含まれる |

---

## 修正要件

### Fix-1: `job ls` 既定フィルタを active only に変更する

`src/cli/ps.ts` の default 分岐を以下に変更:

```typescript
} else {
  // 既定: active のみ (running | awaiting-resume)
  jobs = allJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
}
```

### Fix-2: managed marker write/clear と `JobStateStore.list()` への managed scan 追加

1. `src/core/runtime/managed.ts` の job 開始時に `managedMarkerPath(slug)` へ marker.json を書く（D7 スキーマ: `{slug, jobId, status, createdAt}`）
2. finish / cancel 完了時に marker を clear する（ファイル削除）
3. `JobStateStore.list()` に managed marker scan セクションを追加:
   - `.specrunner/local/*/marker.json` を列挙
   - marker の `jobId` で dedup に参加させる

> Note: managed marker の write/clear は design.md の Open Questions にも記載されており、実装範囲の確定が必要。
