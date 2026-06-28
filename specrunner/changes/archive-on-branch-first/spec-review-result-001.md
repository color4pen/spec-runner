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
| 1 | LOW | Idempotency edge case | tasks.md / design.md D7 | `--no-worktree` モードでは `recordDir = cwd`（main repo）のため、`markJobArchived` が main repo の `state.json` を `archived` に更新する。その直後に `git push origin <feature-branch>` が失敗した場合、再実行の Phase 0 が `JobStateStore.list(cwd)` で `archived` を検出して short-circuit し push が再試行されない。worktree モードは Phase 0 が base branch の `state.json`（`awaiting-archive`）を読むため影響なし。これは現行 base-push 設計にも存在する既知の pre-existing 制約が `--no-worktree` 経路に継承されたもの。 | T-01 に「`--no-worktree` モードで push が失敗した場合、status は既に `archived` になるため再実行で自動回復しない」という注釈を追記して実装者に明示する。将来改善として `markJobArchived` を push 成功後に移動する（ただし本 request のスコープ外）。 |
| 2 | LOW | ADR supersede トレーサビリティ | tasks.md | ADR-20260603 を supersede する新 ADR を生成する要件が design.md Risks と request.md トレードオフ欄に明記されているが、tasks.md には対応するタスクが存在しない。`adr: true` が設定されているため adr-gen step は実行されるが、adr-gen が design.md を読んで supersede 関係を反映するかは暗黙の期待に依存する。 | tasks.md の T-06 または新タスクに「adr-gen が生成する ADR は ADR-20260603 を Supersedes として参照しなければならない」と追記する（adr-gen に読ませる context として）。 |
| 3 | LOW | --no-worktree シナリオ欠損 | spec.md | spec.md のシナリオはすべてデフォルト（worktree）モードを前提としており、`--no-worktree` モード固有の動作（feature branch checkout → recordDir = cwd → cleanup 時の `git checkout <base>`）を検証するシナリオがない。design.md D6 が仕様を完全に記述しているが、spec として固定されていない。request-review LOW #3 の未解消引き継ぎ。 | spec.md に `--no-worktree` 向けシナリオを追加するか、または D6 を spec.md 内で明示的に normative として引用する。T-05 のテスト更新対象に `--no-worktree` ケースを明記する（現在の T-05 記載は暗黙）。 |
| 4 | LOW | CI-SHA 取得経路が no-op 時に未定義 | tasks.md T-03 / design.md D5 | T-03 は「push した記帳 commit の SHA を後段（CI 待ち）へ引き渡せるよう取得する」と記載しているが、Phase 0 が terminal status を検出して短絡した場合（`--with-merge` 再実行で merge 済み検出）やスキップされた場合の SHA 取得経路が明示されていない。D5 は「`getPullRequest` で MERGED 判定 → skip して cleanup へ」と記述しており、このパスは CI 待ちをスキップするため矛盾はないが、「記帳が no-op／部分 skip のとき CI gating headSha は `getPullRequest().headSha` を使う」という仕様が tasks.md に書かれていない。 | T-03 に「記帳 step が no-op を返した場合（status terminal による短絡 or skip-if-done）、CI gating の headSha は `getPullRequest().headSha` を使う」と補足する。 |

## Verification Notes

以下の点を実コードで確認した。

- `orchestrator.ts:164` — `git checkout baseBranch`（削除対象） ✅
- `orchestrator.ts:249` — `git push origin baseBranch`（削除対象） ✅
- `orchestrator.ts:125-128` — Phase 0 の terminal-status 短絡（`TERMINAL_STATUSES.has(state.status)` → no-op）✅
- `JobStateStore.list(cwd):220-235` — `cwd` の `specrunner/changes/*/state.json` を読む（worktree 分離確認）✅
- `markJobArchived:83` — `if (noop) return current;`（既に archived なら no-op）✅
- `archiveChangeFolder:37-43` — change folder 不在なら skip（冪等）✅
- `merge-then-archive.ts:159-162` / `:254-258` / `:434` — `runArchiveOrchestrator` 呼び出し点（再順序化対象）✅
- `job-state-update.ts:53-86` — `markJobArchived` の実装（D3 の status 確定ロジック）✅

### spec ↔ design ↔ tasks 整合確認

| 要件 | spec.md | design.md | tasks.md |
|------|---------|-----------|----------|
| 記帳を feature branch で実行 | ✅ Req-1 Scenario ×2 | D1 | T-01 |
| base への checkout/commit/push 禁止 | ✅ Req-1 | D1（削除対象明示）| T-01 AC |
| protected base で archive 成功 | ✅ Req-2 Scenario | D1 Rationale | T-05 |
| status を記帳時点で archived 確定 | ✅ Req-3 Scenario ×2 | D3 | T-01/T-02 AC |
| cleanup は merge 後のみ | ✅ Req-4 Scenario ×2 | D4 | T-02/T-03 AC |
| feature branch / worktree を no-merge で保持 | ✅ Req-5 Scenario | D4 Rationale | T-02 |
| 中間 status 非導入 | ✅ Req-6 Scenario | D3 Alternatives | T-05 |
| 冪等・回復可能 | ✅ Req-7 Scenario ×2 | D7 | T-05 |
| --with-merge を「記帳→CI→merge→cleanup」へ再順序化 | ✅ Req-4 Scenario | D5 | T-03 |

### セキュリティ確認

- 新規 auth surface なし。token 経路は `createTransportAuth` 経由（既存）。
- git push 先が base → feature branch に変わるが権限モデルは同等（同一 remote の別 branch）。
- 入力値（slug、branch 名）は既存の validation を継承。新たな injection 面なし。
- OWASP Top 10 該当なし。

### 総合評価

設計決定（D1–D7）はすべて spec.md の要件シナリオに対応し、tasks.md が各 AC を具体化している。known-debt の引き継ぎ（ADR-20260603 の client-closed 性後退）は design.md Risks と request.md トレードオフ欄で明示・合意済み。実装ブロッカーとなる HIGH/CRITICAL 所見なし。
