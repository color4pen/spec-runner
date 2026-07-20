# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No blocking findings (no HIGH, no decision-needed). Request is ready for pipeline execution.
  - needs-discussion: One or more blocking findings (HIGH or decision-needed) resolvable through discussion.
  - reject:           Multiple blocking findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | LOW | Clarity | request.md § 受け入れ基準 T1 | T1 の「deps 注入で状態遷移を再現」は、scan override で orphan を返させつつ再チェック用 fs.readFile を active 状態の state.json を返すよう mock する手順を想定していると読める。実装者がこの意図を正確に掴めるか若干曖昧。 | テスト内で readFile の呼び出し回数（scan 後の再判定フェーズで返す値）を明示したコメントを入れると確実。request 変更不要。 |

## Code Assertion Fact-Check

以下のコードアサーション（現状コードの前提）をすべて実読で検証した。

| Assertion | File | Verified |
|-----------|------|----------|
| `pruneOrphanSidecars` は scan 後に再判定なく `fs.rm` を呼ぶ | `src/core/prune/sidecar-runner.ts` L99-109 | ✅ |
| `isOrphanSidecar(deps, slug, sidecarDir)` が単体で export されている | `src/core/sidecar/orphan.ts` L66 | ✅ |
| `ACTIVE_STATUSES` = running / awaiting-resume / awaiting-archive / failed / terminated | `src/core/sidecar/orphan.ts` L20-26 | ✅ |
| `SidecarPruneFs` は `SidecarScanFs + rm` の組み合わせ | `src/core/prune/sidecar-runner.ts` L26-28 | ✅ |
| 削除は best-effort（個別失敗は warning に積んで続行） | `src/core/prune/sidecar-runner.ts` L94-116 | ✅ |
| `SidecarPruneDeps.scan` で scan 関数を注入可能 | `src/core/prune/sidecar-runner.ts` L30-35 | ✅ |

## Review Notes

- **TOCTOU 問題の特定は正確**: scan→rm の間に active 化した sidecar が削除される窓は実コードで確認済み。再判定の挿入箇所（各 `fs.rm` 直前）は自明。
- **T1 の破壊確認設計**: scan override で orphan を返し、再判定の `isOrphanSidecar` が active を返すよう `fs.readFile` を mock する設計は、`SidecarPruneFs extends SidecarScanFs` の構造上、追加 deps なしで実現可能。再判定を削除すると `rm` が呼ばれてしまい `expect(rm).not.toHaveBeenCalled()` が落ちる（破壊確認成立）。
- **`isOrphanSidecar` の呼び出し互換性**: 関数は `(deps: ScanSidecarDeps, slug, sidecarDir)` を受け取り、`SidecarPruneDeps.fs` は `SidecarScanFs` を満たすため、そのまま渡せる。
- **既存テストの影響**: skip 出力追加に伴う期待更新を除き、既存 TC-004/006/007/008/020/021 および prune-combined.test.ts は変更不要と判断できる。request の T3 記述と一致。
- **スコープ外の明示**: worktree 側 prune への同種対応・orphan 判定基準変更・doctor 側変更を明示的に除外しており、スコープ境界が明確。
