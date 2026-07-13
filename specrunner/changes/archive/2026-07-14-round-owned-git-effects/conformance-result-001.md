# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | T-01〜T-06 全チェックボックス `[x]`、実装確認済み |
| design.md | ✅ | D1〜D4 すべて実装に対応（詳細下記） |
| spec.md | ✅ | 全 Requirements / Scenarios をテストで固定 |
| request.md | ✅ | AC-1〜AC-4 すべて満足、`typecheck && test` green (6,666 tests) |

---

## Design Decisions の実装

### D1 — member 実行入力に「round 所有」を宣言し、executor の finalize を抑止

- `PipelineDeps.roundOwnsGitEffects?: boolean` が `src/core/types.ts` に追加。
- `parallel-review-round.ts` が fan-out 前に `roundDeps = { ...deps, roundOwnsGitEffects: true }` を構築（shared `deps` の in-place 変更なし、B-16 保持）。
- `executor.ts` の finalize ブロックが `if (!deps.roundOwnsGitEffects) { ... }` でゲート。round 所有下では `finalizeStepArtifacts` が一切呼ばれない。
- 逐次経路は `roundOwnsGitEffects` が `undefined`（falsy）のため従来挙動を維持。

### D2 — coordinator round 所有点の git primitive を RuntimeStrategy seam に追加

- `RuntimeStrategy` port に `listWorktreeChanges?` / `commitRoundArtifacts?` を optional で追加、`RealRuntimeStrategy` intersection に required で追加（compile-time 強制）。
- `LocalRuntime.listWorktreeChanges`: `git status --porcelain -z --no-renames` の NUL 区切りパース（never-throw、error 時 `[]`）。
- `LocalRuntime.commitRoundArtifacts`: `commitScopedPaths` に委譲。
- `ManagedRuntime` 両メソッド: `[]` / no-op（fail-safe）。
- `commitScopedPaths`: `git add -A -- <stagePaths...>` で pathspec 限定 staging。pathspec なしの `git add -A` は使用していない。
- `CommitPushInfra` は `{ spawnFn: deps.gitTransportSpawn ?? defaultSpawnFn, sleepFn: deps.sleepFn ?? defaultSleepFn, events: this.events }` で構築（executor の構築と対称）。
- `ParallelReviewRound` constructor に `events: EventBus` を追加、`pipeline.ts` が `this.events` を渡す。

### D3 — changed ⊆ declared の判定を pure module に切り出し、coordinator が halt/commit を決定

- `round-git-scope.ts` に `pipelineManagedPaths(slug)` / `partitionRoundChanges({ changed, declared, slug })` を実装（I/O なし pure module）。
- `toStage = changed ∩ declared`、`offending = changed − declared − pipelineManaged`。
- `parallel-review-round.ts` が fan-out 前 base `state` から declared union を計算し、fan-out / merge / aggregate 後に `listWorktreeChanges` → `partitionRoundChanges` → halt or commit を実行。
- `offending > 0` → `aggregateVerdictResult = "escalation"`、`state.error = { code: "ROUND_NONDECLARED_CHANGE", ... }`、`commitRoundArtifacts` は呼ばない。
- `offending == 0 && toStage > 0` → `commitRoundArtifacts` を呼ぶ。
- `listWorktreeChanges` 不在（test fake 等）→ skip（従来挙動）。
- synthetic coordinator StepRun は git 操作の後に push（commit → synthetic StepRun → persist の順）。
- `syntheticRun.outcome.error = aggregateVerdictResult === "escalation" ? state.error ?? null : null` により offending 情報が StepRun に記録される。

### D4 — after-snapshot + 簿記除外

- `pipelineManagedPaths(slug)` が `[state.json, events.jsonl, usage.json]` を返し、`toStage` と `offending` の双方から除外。
- before-snapshot は不要（round 前の非簿記変更は逐次 step が commit 済）の設計を実装が踏まえており、after-snapshot + 簿記除外で誤 halt を防いでいる。

---

## spec.md Requirements / Scenarios 対照

| Requirement | Scenario | テスト固定 |
|---|---|---|
| member 実行経路は git stage/commit port を呼ばない | round 所有下の member は commit port を呼ばない | `executor-round-commit.test.ts` |
| （同上） | 逐次経路は従来どおり commit port を呼ぶ | `executor-round-commit.test.ts` |
| coordinator は宣言出力 union だけを scoped stage する | 宣言出力だけが round commit へ入る | `parallel-review-round-git-effects.test.ts` scenario 1, 3 |
| （同上） | 宣言範囲内の削除・置換を拾う | `round-git-scope.test.ts` scenario 4 |
| 非宣言変更があれば round 全体を halt する | 宣言外ファイルを変更したら round を halt する | `parallel-review-round-git-effects.test.ts` scenario 2 |
| （同上） | 変更が宣言範囲内なら halt せず commit する | `parallel-review-round-git-effects.test.ts` scenario 1 |
| （同上） | pipeline 管理 path の更新は halt を誘発しない | `parallel-review-round-git-effects.test.ts` scenario 3 |
| 逐次経路の commit 挙動を変えない | 逐次 step の commit は byte-for-byte 不変 | `executor-round-commit.test.ts` |

---

## 受け入れ基準

| # | 基準 | 判定 |
|---|---|---|
| AC-1 | member 経路が git stage/commit port を呼ばず、coordinator round 所有点だけが宣言出力を stage することをテストで固定する | ✅ |
| AC-2 | round の changed files が宣言出力 union の範囲内であることを検証し、範囲外なら round halt することをテストで固定する | ✅ |
| AC-3 | scoped staging が `git add -A` を使わず宣言 path に限定することをテストで固定する | ✅ |
| AC-4 | `typecheck && test` が green | ✅ build / typecheck / test / lint すべて passed (6,666 tests) |

---

## スコープ外確認

- `architecture/` 配下: 変更なし（`git diff main...HEAD --stat` で確認）。
- `specrunner/adr/` 配下: 変更なし（同上）。
- source code の変更ファイルは tasks.md T-06 指定の 9 ファイルと対応テストに限られる。スコープ外への変更なし。

---

## 特記事項

`cross-boundary-invariants-result-001.md`（approved）が指摘した F-1（`commitRoundArtifacts` 例外時に merge 済み member StepRun が失われるレアケース）は、design.md「round commit と state persist の二相境界（Non-Goal / ADR 既知 Negative）」として設計者が明示的に承知済み。今回のスコープで修正が必要なブロッカーではない。
