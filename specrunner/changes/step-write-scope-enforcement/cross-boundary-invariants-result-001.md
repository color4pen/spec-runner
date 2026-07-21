# Cross-Boundary Invariants Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## レビュー対象

- Change: `step-write-scope-enforcement`
- Reviewer: `cross-boundary-invariants`
- Iteration: 1

## 検証した項目

### diff 範囲確認

`git diff main...HEAD --stat` で変更ファイルを確認:
- `src/core/step/commit-push.ts` — 主要変更：scoped/guarded 分岐、`getWorktreeChangedPaths` 追加
- `src/core/step/write-scope.ts` — 新規 leaf module
- `src/core/step/round-git-scope.ts` — 新規 re-export（`pipelineManagedPaths` を step 層へ公開）
- `src/core/step/spec-review.ts` — `reads()` に `requestMdPath` 追加
- `src/errors.ts` — `WRITE_SCOPE_VIOLATION` 追加

### 変更されていないコードとの相互作用調査

1. **`pipeline.ts:596-597`（不変）**: `awaiting-resume` 状態での `commitFinalState` 呼び出し → write-scope 違反 halt との相互作用を確認
2. **`local.ts:commitFinalState`（不変）**: `git add -A`（無制限 staging）→ 違反ファイルを含む可能性を確認
3. **`pipeline/round-git-scope.ts:partitionRoundChanges`（不変）**: `pipelineManagedPaths` を除外方向に使用 → 新コードでの包含方向との意味的非対称を確認
4. **`executor.ts:validateRequiredInputs`（不変）**: `reads()` の `required !== false` エントリを必須入力として検証 → `spec-review.reads()` 変更との相互作用を確認
5. **`executor.ts:runAgentStep`（不変）**: `finalizeStepArtifacts` の呼び出しタイミングを確認（`orchestrator.begin` 後、`orchestrator.apply` 前）
6. **`commitFinalState`（`commit-push.ts`、不変）**: `git add -A` で全ファイルを stage → 違反ファイルを含む可能性を確認

### 実測確認項目

- `src/core/step/write-scope.ts:GUARDED_WRITE_STEPS` — 5 step: implementer / build-fixer / code-fixer / test-materialize / adr-gen ✓
- `src/core/step/write-scope.ts:protectedCanonPaths` — request.md / spec.md / design.md / tasks.md / test-cases.md / attestation.json ✓
- `src/core/step/write-scope.ts:findWriteScopeViolations` — `isJudgeArtifact`（`/-result-/` パターン）も合わせて照合 ✓
- `src/core/step/commit-push.ts:commitAndPush` guarded path — `getWorktreeChangedPaths` BEFORE `git add -A`（throw で add せず halt）✓
- `src/core/step/commit-push.ts:commitFinalState` — `git add -A`（スコープ制限なし）✓
- `src/core/pipeline/pipeline.ts:596` — `state.status === "awaiting-resume"` で `commitFinalState` 呼び出し ✓
- `src/core/step/spec-review.ts:reads()` — `requestMdPath(deps.slug)` が追加済み（`required` フィールドなし → 必須扱い）✓
- `tests/` 内の `commitFinalState` テスト — 全て `vi.fn().mockResolvedValue(undefined)` 等でモック → 実際の git 操作なし ✓

### テストカバレッジの確認

- `tests/unit/step/commit-push-write-scope.test.ts` — TC-003〜TC-020: `commitAndPush` 単体 ✓
- `tests/unit/step/write-scope.test.ts` — TC-008〜TC-014: `write-scope.ts` 関数 ✓
- `tests/unit/architecture/write-scope-invariants.test.ts` — TC-010, TC-022: grep-pin ✓
- 統合テスト: `WRITE_SCOPE_VIOLATION` halt → `commitFinalState` の連鎖をテストするケース **なし**

## Findings 詳細

### F-01: `commitFinalState` が guarded halt 後の checkpoint で違反ファイルをコミットする（HIGH）

#### 証拠

`commitAndPush`（guarded mode）は違反検出時に `git add -A` の前に throw するため、違反ファイルはステージされない。この実装は正しい。

しかし `pipeline.ts:596-597`:

```ts
if (state.status === "awaiting-resume") {
  await deps.runtimeStrategy?.commitFinalState(deps, state);
}
```

は `WRITE_SCOPE_VIOLATION` halt を含む**全ての** `awaiting-resume` 出口で発火する。`commitFinalState`（`commit-push.ts:221-253`、`local.ts` 経由）は:

```ts
const addResult = await spawnFn("git", ["add", "-A"], { cwd });
// ... commit → push
```

スコープ制限なしで全 worktree をステージする。

実行順序：
1. guarded step（implementer 等）が `request.md` を変更
2. `commitAndPush` → `getWorktreeChangedPaths` が変更を検出 → `findWriteScopeViolations` → throw（add せず）
3. halt → job が `awaiting-resume` に遷移
4. `pipeline.ts:596` → `commitFinalState` が発火
5. `git add -A` → `request.md`（違反ファイル）もステージ
6. `git commit -m "checkpoint: <slug>"` → 違反ファイルがリモートにコミットされる

**要件「1 件でも違反があれば commit せず halt する（fail-closed）」が checkpoint 経路で破られる。**

本変更が導入した `WRITE_SCOPE_VIOLATION` halt の新しいプロパティ（violating ファイルが worktree に残留）と、従来の `commitFinalState` の振る舞い（`git add -A`）が組み合わさることで生じる cross-boundary 欠陥。従来の halt（タイムアウト / push 失敗）では worktree が agent 書き込みで汚染されることはなかった。

**既存テストでは未検出**: 全 pipeline 統合テストで `commitFinalState` は mock（no-op）されており、この経路をテストしていない。

#### 修正案

- **Option A**: `commitFinalState` に write-scope 除外を追加（`forbiddenWritePaths` または `protectedCanonPaths` を除いた上で `git add -A`）
- **Option B**: halt 経路で `WRITE_SCOPE_VIOLATION` の場合、`commitFinalState` 呼び出し前に違反パスを `git restore -- <paths>` で除外
- **Option C**: `commitFinalState` を `pipelineManagedPaths` の staging のみに限定（最も安全だが既存挙動変更）

---

### F-02: `pipelineManagedPaths` の意味的反転 — 包含（sequential scoped）と除外（parallel round）（MEDIUM）

#### 証拠

**不変コード**: `pipeline/round-git-scope.ts:partitionRoundChanges`:
```ts
const managedSet = new Set(pipelineManagedPaths(slug));
// toStage: changed ∩ declared — managed paths は含まれない
const toStage = changed.filter((f) => declaredSet.has(f));
// offending: changed − declared − pipelineManaged
const offending = changed.filter((f) => !managedSet.has(f) && !declaredSet.has(f));
```
管理 path は round commit から**除外**（terminal seam に委ねる設計）。

**変更後コード**: `commit-push.ts:commitAndPush` scoped path:
```ts
const managed = pipelineManagedPaths(slug);
const stagePaths = [...new Set([...filePaths, ...managed])];
// staged に管理 path を含める
```
管理 path を per-step commit に**包含**（現行挙動保存）。

設計 D3 にこの非対称が文書化されているが、関数の **単一の定義**が**対称でない用途**に使われる構造は保守リスクを生む。`pipelineManagedPaths` に新たなファイルが追加された場合:
- parallel round: offending から除外（意図通り）
- sequential scoped: stagePaths に包含（意図しない staging の増加）

また「sequential scoped staging が managed path を含むこと」を直接アサートするテストが存在しない（TC-004 はコミットメッセージ形式のみを検証）。

---

### F-03: scoped step の境界違反が worktree に残存し後続 guarded step で誤帰属 halt を生じる（MEDIUM）

#### 証拠

scoped step（spec-review 等）が保護パス（request.md 等）を変更した場合:
1. scoped staging: `stagePaths` に request.md が含まれないため変更は**コミットされない**（正しい）
2. しかし変更は worktree に**残存**する（git restore は行われない）
3. 後続の guarded step（test-materialize, implementer 等）が実行されると
4. `getWorktreeChangedPaths` が `request.md` の変更を検出
5. `findWriteScopeViolations` → `WRITE_SCOPE_VIOLATION` → halt

guarded step 自身は request.md を変更していないにもかかわらず、spec-review の違反に起因する halt として表面化する。エラーメッセージには "implementer on branch ... attempted to write outside its declared scope" と表示され、帰属が誤る。

オペレーターは worktree を調査して「誰が request.md を変更したか」を特定する必要があり、git log では direct commit がないため追跡が困難。

このケースをテストするシナリオは存在しない。

---

### F-04: scoped mode の `stagePaths.length === 0` early return が HEAD-advance invariant を迂回する（LOW）

#### 証拠

`commit-push.ts:commitAndPush` scoped path:
```ts
if (stagePaths.length === 0) return;  // early return — commitAndPushTail 呼ばれない
```

`commitAndPushTail` が HEAD-advance 検出（agent 自主 commit → push-only）を担当するため、`stagePaths` が空の場合は agent 自主 commit の push が行われない。

**実際の到達可能性**: `pipelineManagedPaths(slug)` は常に 3 要素（state.json / events.jsonl / usage.json）を返すため、`stagePaths` は実際には空にならない。ただし依存が隠れており、`pipelineManagedPaths` の実装が変わると latent になる。

---

## Observations

### O-01: `spec-review.reads()` への request.md 追加が `validateRequiredInputs` の挙動を変更する（INFO）

D6 の実装（`spec-review.ts:83`）は `{ path: requestMdPath(deps.slug) }` を `required` フィールドなしで追加。`validateRequiredInputs` は `required !== false` を必須扱いするため、request.md が不在の場合 spec-review は `STEP_INPUT_MISSING` で halt するようになる（以前は agent が自力で失敗）。

意図的な変更であり（D6 rationale: lineage への記録）、失敗モードが改善される net positive。request.md はパイプライン全体の一次入力であり、実運用で欠落するケースは想定外。
