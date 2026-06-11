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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Summary

design.md・spec.md・tasks.md の整合が取れており、ブロッキング指摘なし。実装に進める状態。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | State preservation | design.md D2 | recover パスは `persistState(staleRecovery 更新) → resumeJob(slug)` の順。`resumeJob` 内で `ResumeCommand.prepare()` が `running → awaiting-resume → running` を遷移する際、`transitionJob` のスプレッドで既存フィールドが保持されるため `staleRecovery` は正しく維持される。この保証が design に明示されていないが、lifecycle.ts の実装から導出可能。 | design.md D2 Rationale に「`transitionJob` のスプレッドにより `staleRecovery` は遷移後も保持される」の一文を追記（任意）。 |
| 2 | LOW | Concurrency | design.md Risks | `recover` / `escalate` ループは `maxStartsPerRun` の対象外で全件逐次実行される。再起動後に多数の stale-running job が存在すると一時的なリソース集中が起き得る。設計リスクに sequential 実行・実在数に限定という軽減策が文書化されている。 | 現状の文書化で許容範囲内。将来 `maxRecoversPerRun` を `InboxConfig` へ昇格する可能性を Open Questions に追記しておくと判断しやすい（任意）。 |
| 3 | LOW | Coverage gap | design.md Risks | `getJobSlug` が空文字を返す stale-running job は `planStaleRecoveries` でスキップされ `status=running` のまま残る（escalate もされない）。既存の手動 resume と同挙動だが Risks に記載がない。 | design.md Risks に「slug 解決が空の job は recover・escalation どちらも対象外となり running のまま残る（手動 resume と同挙動）」を追記（任意）。 |

---

## Security Review

新規の外部入力サーフェスなし。

- **プロセス liveness プローブ** (`process.kill(pid, 0)`): pid は内部 state から取得。外部から注入不可。ESRCH / EPERM の既存ハンドリングが維持される。
- **ファイルアクセス** (`isStaleRunning` の sidecar 読み): パスは `path.join(repoRoot, livenessJsonPath(slug))` で構築。`livenessJsonPath` は固定プレフィックス `.specrunner/local/<slug>/liveness.json` を返し、slug は内部 state 由来。path traversal リスクは既存コードと同レベル。
- **状態書き込み** (`persistState`): `resolveStateStoreByJobId` 経由で slug → store を解決する既存経路を再利用。書き込み先は管理済み change folder 内。
- **OWASP Top 10**: 認証・認可の新規変更なし。`notifyEscalation` は既存 `notifyJobTerminal` を再利用し、issueNumber null 時は no-op。入力検証の新規ギャップなし。

---

## Verdict Rationale

全指摘 LOW・任意対応。ブロッキング指摘なし。設計判断 D1–D7 は代替案の検討を含め十分な根拠が示されており、タスク T-01–T-07 の acceptance criteria は明確。approved。
