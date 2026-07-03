# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Edge case | design.md / post-merge-cleanup.ts | resume パス（status=archived + MERGED）では前回実行が liveness sidecar を削除済みの可能性がある。その場合 `resolveWorktreePathForArchive` はステージ3（`buildWorktreePath`）に落ち、既に削除された worktree パスを返す。`manager.remove` は try/catch で保護されているが、存在しない worktree を指す警告が出る。design.md Risks 節で best-effort 方針は承認済み。実装時の対処不要だが、将来の ENOENT suppress 検討候補として記録する。 | 対処不要（設計の best-effort 方針内）。将来改善する場合は `manager.remove` の ENOENT を suppress し "already removed" として no-op 扱いにする。 |

## Summary

コード実査（`merge-then-archive.ts:151`、`orchestrator.ts:65–89`、`post-merge-cleanup.ts:56`）により以下を確認した。

**バグ診断の正確性**: `worktreePath = state.worktreePath ?? null`（L.151）が単一の代入点で、sidecar / 規約パスへのフォールバックを持たない。orchestrator.ts で `resolveWorktreePathForArchive` が既にエクスポートされており、T-01 の import 追加・代入変更で三段フォールバックが cleanup 経路でも使える。

**対称化の完全性**: Step 1 で解決した `worktreePath` は、その後の三カ所の `runPostMergeCleanup` 呼び出し（L.189, L.317, L.532）すべてに伝播する。変更箇所は代入一行のみで最小。

**順序制約（D2）**: Step 1（state load）で解決し変数に保持するため、cleanup 内の sidecar 削除の影響を受けない。仕様のとおり自動的に満たされる。

**警告（D3）**: `post-merge-cleanup.ts` の `slug` は `PostMergeCleanupInput` で必須フィールドとして定義済み。`stderrWrite` も既インポート。変更コストは低い。

**テスト設計**: T-03 の DI パターン（`worktreeManagerFn` / spawn / fs をパラメータ経由で注入し、`vi.mock` なしで直接テスト）は適切。T-04 のモック factory 追加（`resolveWorktreePathForArchive: vi.fn()` のデフォルト `Promise.resolve(null)`）で既存テストへの影響を最小化する設計も妥当。

**セキュリティ**: `resolveWorktreePathForArchive` は `nodePath.join(cwd, ...)` と `fs.readFile` / `JSON.parse` のみ使用。パス traversal・インジェクションリスクなし。
