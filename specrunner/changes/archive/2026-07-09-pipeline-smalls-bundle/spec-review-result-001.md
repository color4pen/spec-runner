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
| 1 | LOW | consistency | design.md (D4) | ガード発火時の stderr 出力に `stderrWrite(guardErr.message)` を使う擬似コードになっているが、既存の `resume.ts` は `logError(guardErr.message)` を使っている（logError は "Error:" プレフィックスを付加する可能性がある）。出力形式に意図的な差異があるなら設計に明記すること。意図的でないなら実装時に `resume.ts` のパターンに揃えること。 | 実装者は `resume.ts:89-92` のパターン（`logError` + `stderrWrite(\`Hint: ${guardErr.hint}\`)`）を参照し、view コマンドのガード出力も同形式に統一する。設計の擬似コードはあくまで参照用として扱う。 |

## Summary

3 件の不具合はいずれもソースコードで確認済み：

1. **build-fixer prompt**: `src/prompts/build-fixer-system.ts:30-34` に旧 TC-ID 手順が現存。`"missing TC ID"` / `"test-cases.md"` / `"TC ID を必ず記載"` の 3 フレーズが含まれ、request の前提と一致する。
2. **exit-guard resumePoint 欠如**: `exit-guard.ts` の 3 経路（行 65 / 131 / 152）いずれも `patch` なしで `transitionJob` を呼んでいる。`executor.ts:412` の timeout パスが先例として機能しており、design D3 の実装方針は自然。
3. **view コマンドのクラッシュ**: `JobStateStore.list` は `<repoRoot>/.git/specrunner-worktrees` を `readdir` し（行 268-296）、ENOENT 以外を rethrow する。worktree の `.git` はファイルのため ENOTDIR が伝播する経路を確認。`detectSpecrunnerWorktree` + `worktreeGuardError` の既存機構を流用する設計 D4 は適切。

**spec/design/tasks の一貫性**: 要件・シナリオ・設計判断・タスク・受け入れ基準の対応関係に矛盾なし。テスト戦略（新規ファイル `coverage-gate-prohibition.test.ts` / 既存 `exit-guard.test.ts` への追記 / 新規 `view-commands-worktree-guard.test.ts`）は各修正に対して適切にカバーされている。

**セキュリティ**: prompt 変更は静的テキストの差し替えのみでインジェクションリスクなし。worktree ガードは fail-open（`detectSpecrunnerWorktree` が例外を投げた場合はガード不発火 → 通常 flow へ）で、既存の設計原則と整合する。

**スコープ外の観察**（対処不要）: `handleGlobalExit` には `appendInterruption` 呼び出しがなく、他 2 経路と非対称。ただし既存の設計トレードオフであり本 request のスコープ外。
