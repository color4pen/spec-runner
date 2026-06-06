# Conformance Result — minimal-state-slug-dir — Iteration 2

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
| tasks.md | ⚠️ | T-01〜T-07, T-10, T-11, T-13(一部), T-18 は全 [x]。T-08/T-09/T-12/T-13 は部分実装、T-14/T-15 は [ ] だが設計上の挙動は成立している。T-16/T-17/T-19 は [ ] だが実質実装済み |
| design.md | ✅ | D1〜D9 すべての設計判断が実装に反映されている |
| spec.md | ❌ | 2 要件に違反: `modelUsage` が events.jsonl に依然記録される（Req: 導出可能フィールドを除く）、`job ls` 既定が active のみでない（Req: active 列挙） |
| request.md | ❌ | `modelUsage` 未除去、`job ls` 既定フィルタ不一致。`bun run typecheck && bun run test` は green (273/3222) |

---

## 詳細

### 実装スコープ（観測事実）

git diff stat: 44 files changed, +4076/-287

段1（T-01〜T-05）完全実装済み。段2 の大部分が実装済み：

- T-06: `src/util/paths.ts` に `slugStateJsonPath` / `slugEventsPath` / `livenessJsonPath` / `managedMarkerPath` 等追加
- T-07: `LocalRuntime.buildDeps` の storeFactory が slug-mode `JobStateStore` を返す。worktree 内 `changes/<slug>/` へ dual-write
- T-09: `stateToStateJson` が slug mode 時に `worktreePath` / `pid` / `session` を strip。archive / cancel の worktreePath 解決に sidecar → convention 2段 fallback が実装済み
- T-10: `deriveAndWriteUsage` を no-op 化済み。executor.ts で per-step `appendInvocation`
- T-11: executor.ts / local.ts / exit-guard.ts が interruption record を journal に append
- T-12: `JobStateStore.list()` が worktree scan + current checkout + legacy の複合列挙
- T-13: `createExitGuardHandler(repoRoot, jobId)` per-job mode 実装済み。`isStaleRunning` が sidecar-based PID 突き合わせ対応済み
- T-16: executor.ts L544–546 で `parsed.pullRequest` を state に materialize。`stateToStateJson` が pullRequest を保持。ps.ts / resolve-target.ts / merge-then-archive.ts の読み手すべて動作中
- T-17: `archiveChangeFolder` が `git mv` で `changes/<slug>/` ごと移動 → `state.json` / `events.jsonl` / `usage.json` が archive に含まれる

### 違反 1: `modelUsage` が events.jsonl に依然記録される

**場所**: `src/store/event-journal.ts` `StepAttemptRecord` / `stepRunToRecord`

```typescript
// event-journal.ts L49 — コメントは "Stage 2: removed when..." だが未除去
modelUsage?: Record<string, ModelUsage>;

// stepRunToRecord L269 — modelUsage を record に書き込んでいる
...(run.modelUsage !== undefined ? { modelUsage: run.modelUsage } : {}),
```

T-10 で `deriveAndWriteUsage` は廃止（no-op 化）され `modelUsage` の唯一の消費者が消えた。しかし:

1. `StepAttemptRecord` に `modelUsage` フィールドが残存（Stage 2 コメント付きで未除去）
2. `stepRunToRecord` が `run.modelUsage` を journal record に書き込んでいる
3. `src/state/helpers.ts` `pushStepResult` が `modelUsage` を in-memory StepRun に保持
4. `executor.ts` が `agentResult.modelUsage` を `pushStepResult` に渡し続けている

**spec.md 違反**: "Requirement: 導出可能フィールドと fileContent を state から除く"
> `StepRun.modelUsage` を除去 MUST する

**request.md 受け入れ基準違反**:
> cost が step ごとに `usage.json` へ append され、finish 一括派生と `.specrunner/jobs/` 読みが除去され、**`modelUsage` が state から除かれている**。

なお `fileContent` については `stepRunToRecord` が outcome から明示的に除外しているため events.jsonl には書かれない。state.json にも steps は含まれない。disk 上は除去済み。型定義・コードパスの残存は T-08 の残作業だが disk-level の spec 要件は満たしている。

### 違反 2: `job ls` 既定フィルタが active only でない

**場所**: `src/cli/ps.ts` L141–143

```typescript
} else {
  // TC-142: default — exclude archived
  jobs = allJobs.filter((j) => j.status !== "archived");
}
```

`ACTIVE_STATUSES = new Set(["running", "awaiting-resume"])` が定義されているにもかかわらず、既定フィルタは "archived 以外すべて" となっており `failed` / `canceled` / `awaiting-archive` / `awaiting-merge` 等が既定表示に含まれる。

**spec.md 違反**: "Requirement: active 列挙を worktree 不変量 + dual-read で成立させる"
> `job ls` 既定は active のみ、`--all` で archive を含む SHALL

**request.md 受け入れ基準違反**:
> `job ls` 既定が active のみ・`--all` で archive を含む。

### tasks.md 詳細確認

| Task | 状態 | 備考 |
|------|------|------|
| T-01〜T-05 | ✅ 全 [x] | 段1 完全実装 |
| T-06 | ✅ 全 [x] | path helpers 追加済み |
| T-07 | ✅ 全 [x] | dual-write で `changes/<slug>/` に書き込み |
| T-08 | ⚠️ 1/4 [x] | request.slug/path は location injection 済み ✓。fileContent は disk-level で除去済み（stepRunToRecord が除外）だが型・コードパスが残存。modelUsage は disk-level でも残存（違反 1） |
| T-09 | ⚠️ 2/3 [x] | machine-local sidecar 分離済み、archive/cancel の 3-path fallback 実装済み。resume の `resolve-request-path.ts` は sidecar 直接参照しないが convention-based path injection で代替 |
| T-10 | ✅ 全 [x] | per-step usage append 済み、`deriveAndWriteUsage` no-op 化済み |
| T-11 | ✅ 全 [x] | interruption record 実装済み |
| T-12 | ⚠️ 1/3 [x] | list() 複合列挙は実装済み。job ls 既定フィルタ未修正（違反 2）、managed marker write/clear 未実装 |
| T-13 | ⚠️ 2/3 [x] | per-job exit-guard・sidecar pid 突き合わせ実装済み。worktree ⟺ 非終端不変量の明示的 cleanup 未整備 |
| T-14 | [ ] 全未 | 再 run の非破壊性は設計上保証（branch 名が jobId8 を含み衝突不可、force-push なし）。cancel は jobId 指定で個別片付け機能済み。但しタスクレベルの確認・テストが未完 |
| T-15 | [ ] 全未 | `load()` fallback で legacy `.json` を読み続く `persist()` が split-layout へ書く動線はあるが、明示的な移行経路・テストが未実装 |
| T-16 | [ ] 全未 | 実装は完了（executor.ts 材料化、stateToStateJson 保持、読み手全動作）。tasks.md の確認チェックが未完了 |
| T-17 | [ ] 全未 | `git mv` で folder ごと移動し state ファイル含まれる。tasks.md の確認チェックが未完了 |
| T-18 | ✅ 全 [x] | doctor checks 更新済み |
| T-19 | ⚠️ | `bun run typecheck && bun run test` green (273 test files / 3222 tests) ✅。pipeline 統合テストの形式的確認が未完了 |

### bun run typecheck && bun run test

```
273 test files passed (3222 tests) — green ✅
typecheck: tsc --noEmit exit 0 ✅
```

---

## 修正要件

### Fix-1: `modelUsage` を events.jsonl から除去する（T-08 / T-10 の完結）

1. `src/store/event-journal.ts`: `StepAttemptRecord.modelUsage` フィールドを削除
2. `src/store/event-journal.ts`: `stepRunToRecord` の `modelUsage` spread を削除
3. `src/state/helpers.ts`: `StepResultInput.modelUsage` / `pushStepResult` の `modelUsage` spread を削除
4. `src/core/step/executor.ts`: `finalizeStep` の `pushStepResult` 呼び出しから `modelUsage` 引数を削除
5. `src/state/schema.ts`: `StepRun.modelUsage` フィールドを削除

T-10 の consumer 廃止はすでに済んでいる。このクリーンアップで T-08 の modelUsage 除去が完結する。

### Fix-2: `job ls` 既定フィルタを active only に変更する（T-12）

`src/cli/ps.ts` L141–143 を以下に変更:

```typescript
} else {
  // 既定: active のみ (running | awaiting-resume)
  jobs = allJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
}
```
