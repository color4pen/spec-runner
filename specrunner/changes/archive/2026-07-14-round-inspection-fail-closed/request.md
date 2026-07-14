# 並列 round の worktree 検査を fail-closed 化する（検査不能を clean と区別し escalation）

## Meta

- **type**: spec-change
- **slug**: round-inspection-fail-closed
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`ParallelReviewRound` は fan-out 後、`runtimeStrategy.listWorktreeChanges(cwd)` で worktree の変更を取得し、宣言外変更があれば round を halt、宣言済み変更のみを scoped commit する（ADR-2026-07-13 D3 / B-15）。

現在この seam の contract は「**Never throws — returns [] on any error**」であり、`LocalRuntime.listWorktreeChanges` は `git status` が非ゼロ終了・spawn 例外・その他例外のときすべて `[]` を返す。consumer 側は `[]` を「worktree に変更なし」として扱うため、**`git status` が失敗すると宣言外変更の検査（B-15 の核）が黙って skip され、宣言済み成果物も commit されず、reviewer は approved として state に記録される**。すなわち「検査不能」を「clean」と同一視する fail-open で、コメント上は fail-safe と書かれているが実際のセキュリティ特性は逆。

本 request は seam の戻り値を判別共用体にし、「検査成功（paths）」と「検査不能」を分離する。検査不能なら round を escalation させ、検査できていない状態を approved に落とさない（fail-closed）。

## 現状コードの前提

- seam 定義: `src/core/port/runtime-strategy.ts` — `RuntimeStrategy.listWorktreeChanges?(cwd): Promise<string[]>`（optional, L424）、`RealRuntimeStrategy.listWorktreeChanges(cwd): Promise<string[]>`（required, L534）。doc comment（L405-424）に「Never throws — returns [] on any error」。
- local 実装: `src/core/runtime/local.ts:845` — `git status --porcelain -z --no-renames`。exit 非ゼロで `[]`、catch で `[]`。
- managed 実装: `src/core/runtime/managed.ts:560` — local worktree を持たない設計（parallel custom reviewer managed は既知の Non-Goal）。常に `[]`。
- consumer: `src/core/pipeline/parallel-review-round.ts:222-259` — `changed = await listWorktreeChanges(cwd)` → `partitionRoundChanges({changed, declared, slug})`。`offending` があれば escalation（`ROUND_NONDECLARED_CHANGE`）、`toStage` があれば `commitRoundArtifacts`。
- テスト: `src/core/runtime/__tests__/local-round-git.test.ts` / `managed-round-git.test.ts` / `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`（fake が `string[]` を返す, L145）。

## 要件

1. seam の戻り値を判別共用体にする:
   ```
   WorktreeInspectionResult =
     | { kind: "success"; paths: string[] }
     | { kind: "unavailable"; reason: string }
   ```
   `RuntimeStrategy.listWorktreeChanges?` / `RealRuntimeStrategy.listWorktreeChanges` の戻り値を `Promise<WorktreeInspectionResult>` に変更し、doc comment の「Never throws — returns [] on any error」を新 contract（成功時 success、検査不能時 unavailable。throw しない点は維持）に更新する。ports→domain import は増やさない（error 情報は `reason: string` で表現）。
2. `LocalRuntime.listWorktreeChanges`: `git status` exit 0 → `{kind:"success", paths}`。**非ゼロ終了・spawn 例外・その他例外 → `{kind:"unavailable", reason}`**（reason に exit code / エラー概要）。
3. `ManagedRuntime.listWorktreeChanges`: `{kind:"success", paths:[]}`（挙動不変。local worktree が設計上存在しないため「変更なし」は検査失敗ではなく真の空。下記設計判断参照）。
4. consumer（`ParallelReviewRound`）: 戻り値が `unavailable` の場合、**round を escalation** させる（`aggregateVerdictResult = "escalation"`、`roundError = {code:"ROUND_INSPECTION_UNAVAILABLE", message, hint}`）。この場合 `commitRoundArtifacts` は呼ばない。`success` の場合は従来どおり `partitionRoundChanges(paths)` を通す。
5. 全実装・全 test fake・既存テストを新 DU に追随させる（`grep -rn listWorktreeChanges src tests` で漏れなく更新）。`listWorktreeChanges` が未定義の fake（method 省略）が skip される既存挙動は維持する。
6. **round escalation 時に member results を approved で確定させない（resume でも fail-closed）**: inspection 判定を member 結果の適用（`applyRoundResults`）より**前**に行い、inspection escalation（`unavailable` / `ROUND_NONDECLARED_CHANGE`）のときは member statuses を適用せず pending に留める。これにより resume 時に `selectPendingMembers` が member を再選出し、fan-out が再実行されて再 inspection される。この措置がないと、全 member approved の invocation で inspection escalation → 既に approved が persist → resume の all-approved fast-path が inspection を skip して approved 確定する穴が残る。既存の `ROUND_NONDECLARED_CHANGE`（宣言外変更 halt）経路も同型の穴を持つため一緒に塞ぐ。

## スコープ外

- `architecture/` 配下は変更しない。B-15 の §4 / conformance / 歯（core-invariants.test.ts）への反映は、実装 merge 後に attended で行う（trust-root を out-of-loop に保つ）。
- managed runtime の parallel custom reviewer サポート拡張（Non-Goal のまま）。
- `commitRoundArtifacts` / `partitionRoundChanges` のロジック変更（呼び出し条件のみ変える）。

## 受け入れ基準

- [ ] local: `git status` 非ゼロ終了および spawn 例外で `listWorktreeChanges` が `{kind:"unavailable"}` を返す（テストで固定）。exit 0 は `{kind:"success", paths}`。
- [ ] managed: `{kind:"success", paths:[]}` を返す（挙動不変、テストで固定）。
- [ ] **consumer: `unavailable` を受けたとき round が escalation（verdict = escalation、`roundError.code = "ROUND_INSPECTION_UNAVAILABLE"`）し、`commitRoundArtifacts` を呼ばないことをテストで固定する（本 request の主眼）**。
- [ ] `success` 経路は従来どおり宣言外変更検出・scoped commit が働くことを既存テストで維持する。
- [ ] inspection escalation（`unavailable` / offending）後、member reviewer statuses が `approved` でなく `pending` であることをテストで固定する（resume で再 inspection される前提）。inspection 成功時は `approved` になることも対で固定する。
- [ ] port の doc comment から「Never throws — returns [] on any error」が消え、新 contract に更新されている。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **DU で「検査不能」を「clean」から分離する**のが修正の核。`[]` は現状 3 つの状態（真の空 / 検査失敗 / worktree 不在）を潰しており、B-15 の halt 判定が検査失敗時に空振りする。
- **local の検査失敗は escalation（fail-closed）**。検査できていない worktree を approved に落とさない。escalation は SpecRunner の設計安全網であり、ここで止めるのが正しい。
- **managed は `success:[]` を維持**（`unavailable` にしない）。理由: local worktree を持たない managed では「local worktree 変更なし」は検査失敗ではなく構造上真の事実であり、member も local worktree に書かない。local の `git status` 失敗（未知状態）と managed の worktree 不在（既知の空）は異なる。managed parallel は Non-Goal のため round を毎回 escalation させる必要はない。※この線引きが妥当かは spec-review で検証する。
- error 情報は `reason: string` に限定し、port の ports→domain 非依存を保つ。consumer 側で `roundError`（code/message/hint）へ写像する。
