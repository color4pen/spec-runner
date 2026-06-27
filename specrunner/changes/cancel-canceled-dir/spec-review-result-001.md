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
| 1 | MEDIUM | Testability | tasks.md T-04 / `runner-branch-delete.test.ts` | `runner-branch-delete.test.ts` は `resolveStateStoreByJobId` を mock するが、新実装では同 mock が未使用になる。T-04 は「fake repoRoot では warning に落ちるため branch 削除アサートは維持される想定」と記載するが、`evacuateChangeFolder` の try/catch が正しく機能しなかった場合にテストが silent に壊れるリスクがある。T-04 が「実 fs を要するなら repoRoot を実 tempDir に差し替え」と代替案を示しているため致命的ではないが、担保が弱い。 | 実装時に `runner-branch-delete.test.ts` の repoRoot を実 tempDir に差し替え（または mock で evacuateChangeFolder を stub）し、branch 削除アサートが green を保つことを確認する。T-04 の注記どおりに調整すれば十分。 |
| 2 | MEDIUM | Correctness | tasks.md T-04 / `runner.test.ts` | idempotent テスト（status=canceled の job に再 cancel）は退避後に `loadState(jobId, slug)` が `changes/<slug>/state.json` を参照するが、退避後そこは空になる。T-04 は「`loadCanceledState` ヘルパーへ置き換える」と記載しているが、ヘルパーのシグネチャや `canceled/<slug>-<jobId8>/` のパス導出方法が spec.md/tasks.md に明示されていない。実装者が jobId8 から退避先パスを再構築する必要があり、見落としやすい。 | tasks.md T-04 に「`loadCanceledState(jobId, slug, tempDir)` の雛形（`canceled/<slug>-${jobId.slice(0,8)}/`）」を 1 行補記することが望ましいが、実装者判断で対応可能な範囲のため承認を妨げない。 |
| 3 | LOW | Specification gap | spec.md | `--restore-draft` + `--no-worktree` の組み合わせで drafts 復元は warning で失敗するが、request.md は `canceled/` に保全される。この非対称な挙動が spec.md に明示されていない（既存挙動かつスコープ外なので問題ではないが、ユーザーが `--restore-draft` + no-worktree で draft が戻らないことに気づきにくい）。 | スコープ外として現状維持で可。将来 no-worktree + `--restore-draft` の対応を要件化する際に spec を更新すれば十分。 |
| 4 | LOW | Design clarity | design.md D4 | tombstone が `git status` に untracked として蓄積することは D4 で認識・記載済みだが、`canceled/` を `.gitignore` するかどうかの推奨が記載されていない。利用者裁量とするのは妥当だが、`specrunner init` で自動的に `.gitignore` に追加すべきかの方針が open のまま。 | Open Questions として D4 に明記済みのため現状維持で可。将来の `specrunner init` 改修時に判断する。 |

## Summary

根本原因の分析（worktree 撤去 → persist という破壊的順序）は正確で、D1（順序反転）＋ D6（退避先への直接 persist）による修正は構造的に記録喪失の余地を消す。D2（move）・D5（jobId 一意化）・D8（active scan 除外）・D9（purge でも tombstone 残す）は全て request.md の architect 評価済み判断と整合している。

spec.md のシナリオは要件を網羅し、tasks.md は実装パスが具体的で明確。セキュリティ上の重大な懸念なし（内部 CLI ツール、外部入力は UUIDに限定）。発見した所見はいずれも tasks.md で認識・対処方針が記載されており、実装を妨げるものはない。
