# Code Review Feedback — iteration 001

## 検証した項目

### Diff scope
`git diff main...HEAD --stat` で 28 ファイル、+4183/-47 行の変更を確認。

### 仕様・設計との照合
- `specrunner/changes/custom-reviewer-canon-binding/design.md` — D1〜D7 の設計判断を読解
- `specrunner/changes/custom-reviewer-canon-binding/test-cases.md` — TC-001〜TC-050 の must 39 件 / should 11 件を確認
- `specrunner/changes/custom-reviewer-canon-binding/tasks.md` — T-01〜T-09 の全タスクが完了チェック済みであることを確認

### 実装ファイル精読

**src/util/paths.ts**（T-01）
- `CANONICAL_DOC_NAMES` Set で 5 ファイル名を固定
- `canonicalDocPaths(slug)` が 5 パスを純粋に返す
- `isCanonicalDocPath(path)` が prefix チェック + slashIdx + filename depth + Set lookup の 4 段で判定
  - archive / canceled 配下（スラッシュを含む filename）は `filename.includes("/")` で正しく除外
  - change folder 外は `!path.startsWith(prefix)` で除外
  - 他 src/ モジュールを import しない制約（TC-034）を満たしている

**src/core/pipeline/round-git-scope.ts**（T-02）
- `excludeChangeFolderPaths`（旧）は残存して既存テストに使われる（後述 F-1）
- `excludePipelineManagedChangePaths`（新）は `isCanonicalDocPath` に基づくアローリスト方式で正典文書を保持
- 呼び出し側（`parallel-review-round.ts`）は新関数のみを使用

**src/kernel/reviewer-snapshot.ts**（T-03）
- `ReviewerStatus.canonHash?: string | null` 追加
- `isBoundToCanonHash(status)` が `typeof status.canonHash === "string"` で正確に判定
  - `undefined`（legacy）・`null`（unavailable）→ false → fail-closed
  - 文字列 → true → 等値比較に進む

**src/core/pipeline/reviewer-status.ts**（T-04）
- `computeCanonHash`: hash 非 null の refs のみ採用 → path 昇順ソート → `path:hash|...` 形式で直列化。空配列 / 全 null → null
- `selectPendingMembers` の判定順序（D4）:
  1. `status === "skipped"` → skip（既存）
  2. `status !== "approved"` → pending（既存）
  3. `baselineCommit == null` → skip（managed fail-safe short-circuit、canon 到達しない）
  4. revision 不一致 → pending
  5. `currentCanonHash === undefined` → skip（3-arg 後方互換）
  6. `currentCanonHash === null` → pending（fail-closed）
  7. `!isBoundToCanonHash(rec)` → pending（legacy / unavailable record → fail-closed）
  8. `rec.canonHash !== currentCanonHash` → pending（正典変更）
  9. 一致 → skip
- `applyRoundResults`: approved verdict に `canonHash = currentCanonHash ?? null` を記録。3-arg 呼び出しは `null`（fail-closed）
- `aggregateVerdict`: 非空かつ全 "skipped" → escalation。空 → approved（D6）

**src/core/pipeline/parallel-review-round.ts**（T-05）
- step 1b: `deps.runtimeStrategy?.digestArtifacts` の有無で `currentCanonHash` を `undefined` / `string | null` に分岐
- 除外を `excludePipelineManagedChangePaths` に置換（D5）
- **canon-binding guard**（`sourceTouched.length === 0 && currentCanonHash !== undefined`）:
  - always-activate reviewer が無変更時に spurious invalidation されることを防ぐ
  - guard 内では `applyRoundResults` は呼ばず `approvedAtCommit` の re-anchor のみ
  - guard 外（sourceTouched 非空）では `computeInvalidations` → re-anchor または pending 化
  - 正典文書のみ変更された場合: `sourceTouched` に正典ファイルが含まれる（保持されるため）→ guard は発火しない → `computeInvalidations` が always-activate reviewer を invalidate する。path-constrained reviewer は `computeInvalidations` では invalidate されないが、re-anchor 後に `selectPendingMembers` の canon check で pending に倒れる
- `allMembersSkipped` フラグで `applyRoundResults` を抑止し member を pending のまま残す（D6 resume 保持）
- `ROUND_ALL_MEMBERS_SKIPPED` roundError 設定

**src/core/pipeline/reviewer-chain.ts**（T-05 / D6 transition）
- `buildParallelReviewerTransitions` に ROUND_ALL_MEMBERS_SKIPPED 専用 escalation 遷移を追加
  - `error.code === "ROUND_ALL_MEMBERS_SKIPPED"` のみ → regression-gate 経由で残りのパイプラインを完走
  - その他の escalation は従来どおり "escalate" 終端へ

**src/core/pipeline/pipeline.ts**（T-05 / D6 end-of-pipeline）
- `nextStep === "end" && state.status === "running"` の分岐で `state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED"` を判定
- 該当時: `awaiting-resume`（escalation）へ遷移。非該当: 従来の `awaiting-archive`
- `state.error` が後続ステップ（regression-gate / conformance / pr-create）で維持される理由を確認:
  `pushStepResult`（`src/state/helpers.ts`）は `...state` スプレッドで既存フィールドを保持するため、
  成功ステップが `state.error` を `null` にクリアしないことを確認済み。

### テスト確認
- `src/util/__tests__/paths-canonical.test.ts` — TC-011〜TC-015 を精読
- `src/core/pipeline/__tests__/reviewer-status-canon.test.ts` — TC-020/022〜TC-031/033 を精読
- `src/core/pipeline/__tests__/reviewer-status.test.ts` — aggregateVerdict の期待更新（TC-034/035/036）を確認
- `src/core/pipeline/__tests__/round-git-scope-pipeline-managed.test.ts` — TC-004/005/016〜019 を精読
- `src/core/pipeline/__tests__/parallel-review-round-canon.test.ts` — TC-001〜003/006〜010/038〜039 を精読
- `tests/reviewer-activation-e2e.test.ts` — TC-040/041（TC-ACT-01/02/04 の期待更新）を確認
- `tests/canon-binding-e2e.test.ts` — TC-043〜045 の構成を確認
- `verification-result.md` — typecheck / test / lint / coverage 全フェーズ passed を確認

### 受け入れ基準の照合
- [x] 正典変更で pending に戻る: TC-001/TC-028 で固定（unit + integration）
- [x] 不変 resume で skip 維持: TC-002/TC-044 で固定
- [x] 全 skip → escalation: TC-006/034 で固定（unit / reviewer-status.test.ts 更新済み）
- [x] member 0 件 → approved: TC-007/035 で固定
- [x] legacy record → pending: TC-003/029 で固定
- [x] findings-only commit → invalidation なし: TC-004/045 で固定
- [x] E2E（fabricated state + 実 git）: TC-043〜045 で固定
- [x] 破壊確認: TC-046〜049 のコメント・docstring 内記録を確認
- [x] typecheck && test が green: verification-result.md で確認済み

## 検証できなかった項目

- `commitRound` の全体実装（`commit-orchestrator.ts` の呼び出し上流）は本 diff に含まれないため、
  `roundError` → `state.error` の伝播経路を途中まで（line 546: `error: roundError`）のみ確認した。
  ただし `pushStepResult` が `...state` スプレッドで `state.error` を維持することを確認済みであり、
  後続ステップが `state.error` をクリアしない事実はテスト（TC-ACT-01/02/04）の green で検証済み。
- managed runtime での canon hash 動作（Non-Goal）は実機確認不可（`digestArtifacts` が null を返す環境）。
  ただし `captureHeadSha = null → managed short-circuit` のロジックは TC-039 で固定済み。

## Findings 詳細

### F-1 [should] `excludeChangeFolderPaths` に `@deprecated` 注釈がない

**場所**: `src/core/pipeline/round-git-scope.ts` line 37-41

**観察**: 旧関数 `excludeChangeFolderPaths` は既存テスト（`round-git-scope.test.ts`）のために残存している。
production コードでの使用は `parallel-review-round.ts` から `excludePipelineManagedChangePaths` に切り替わった。
しかし旧関数には `@deprecated` JSDoc が付いておらず、将来の実装者が誤って production 用途で再利用するリスクがある。
`@deprecated Use excludePipelineManagedChangePaths instead.` 等の注釈を追加することが望ましい。

**ブロッカー性**: なし。現時点で production コードでは使われておらず、テストは意図的に旧関数を参照している。

---

### F-2 [should] `state.error` の "sticky" 挙動がスキーマ層にドキュメント化されていない

**場所**: `src/core/pipeline/pipeline.ts` line 385-395、`src/state/helpers.ts` の `pushStepResult`

**観察**: ROUND_ALL_MEMBERS_SKIPPED の end-of-pipeline 検出は、`commitRound` が `state.error` に設定したエラーが
regression-gate / conformance / pr-create 各ステップの成功後も残存することに依存している。
この挙動は `pipeline.ts` のコメント（"persists through subsequent steps"）で言及されているが、
なぜ残存するか（`pushStepResult` が `...state` スプレッドで `state.error` をクリアしない）は
コメントに記載されていない。`state.error` フィールドの semantics（step 成功で自動クリアされない）を
`JobState` スキーマまたは `pushStepResult` の JSDoc に記載することが望ましい。

**ブロッカー性**: なし。動作は `pushStepResult` の実装で保証されており、TC-ACT-01/02/04 が緑で固定している。
