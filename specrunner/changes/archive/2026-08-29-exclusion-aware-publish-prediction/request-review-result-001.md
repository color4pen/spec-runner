# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コード assertions の実地確認

以下のすべてを Read / Grep で実際のファイルに当たり、行番号と内容が request.md の記述と一致することを確認した。

| 場所 | request の主張 | 確認結果 |
|------|--------------|--------|
| `src/git/push-capability.ts` L121-193 | `collectPublishablePaths` が worktree 成分（git status）と unpushed commit 成分（git rev-list）を無条件に合流させる | ✅ 確認。関数は `stagingExcludePatterns` を一切参照しない |
| `src/git/push-capability.ts` L228 | `predictedTouchedFiles` のマッチングに除外が適用されない | ✅ 確認。`renderPushCapabilityNotice` は `matchUnpushablePaths(predictedTouchedFiles, pushCapability)` を直接呼ぶ |
| `src/core/step/commit-push.ts` L519-533 | Layer 2 backstop が `collectPublishablePaths` の生の結果で unpushable 判定し、除外後の staging より前に throw | ✅ 確認。`resolveStagingExcludePatterns` / `applyStagingExclusions` は L665-666（guarded branch 後段）にのみ存在 |
| `src/core/step/commit-push.ts` L1004-1023 | `commitScopedPaths` の Layer 2 backstop も同様に除外非適用 | ✅ 確認。`collectPublishablePaths` を生で呼び出す |
| `src/core/step/commit-push.ts` L568-591 | scoped の residual check（`findScopedCommitViolations`、L575）が `stagingExcludePatterns` を参照せず、違反 → quarantine → restore | ✅ 確認。`findScopedCommitViolations(slug, postStatus.paths, filePaths, allManagedPaths)` は exclude patterns を受け取らない |
| `src/core/step/write-scope.ts` L163-171 | `findScopedCommitViolations` は declared + managed の和集合外をすべて返す | ✅ 確認。引数に exclude patterns なし |
| `src/core/runtime/local.ts` L1609-1624 | Layer 1（`validateStepOutputs`）の unpushable-path 分岐が `collectPublishablePaths` を除外なしで呼ぶ | ✅ 確認。`this.spawnFn` を直接渡し、戻り値をそのまま `matchUnpushablePaths` に渡す |
| `src/core/step/write-scope.ts` GUARDED_WRITE_STEPS | guarded は `implementer` / `code-fixer` / `adr-gen` の 3 step のみ | ✅ 確認。Set の内容が完全に一致 |

### アーカイブ設計との照合

`specrunner/changes/archive/2026-08-01-guarded-staging-artifact-containment/design.md` を確認。

- "Scoped staging (declared-output pathspec) is untouched. Exclusion and the volume guard apply to **guarded** mode only." (D86)
- `stagingExcludePatterns` の導入当初から scoped step への適用は意図的に除外されており、request が「根本原因」と指摘する設計方針を裏付けている。

### docs の現行記述の確認

`docs/configuration.md` の `pipeline.stagingExcludePatterns` 節（L414-443）を確認。

- "All three settings affect **GUARDED steps only** (implementer / build-fixer / code-fixer / test-materialize / adr-gen)." と記載されており、request が要件 8 で更新対象と明示している記述と一致。

### `resolveStagingExcludePatterns` の単一解決点

`staging-containment.ts` に定義され、`commit-push.ts` から import・呼び出される。要件 9「新しい設定面・abstraction 層を作らない」は既存実装と整合。

## 検証できなかった項目

- design / code-review / conformance step のプロンプト生成コード（Delivery exclusions block の注入先。今回は read-only 確認の範囲では参照箇所を特定したが、実装の完成形は design 段階で決定される）

上記 1 点は、request の問題記述の正確性には影響しない。

## Findings 詳細

指摘なし。

コード assertions はすべて実測で正確であることを確認した。問題の再現経路（Layer 1/2 の 3 call site + scoped residual check の 1 call site）・要件（worktree 成分のみ除外・commit 成分は除外不可）・受け入れ基準・スコープ外の明示がいずれも明確で、設計フェーズをブロックする不明瞭点はない。
