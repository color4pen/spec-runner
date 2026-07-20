# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | critical | security | src/core/step/executor.ts | per-node 検証・journal commit の配線がない。`verifyNodeJournalAuthorship` / `commitJournalArtifacts` / `restoreJournalToAnchor` / `makeJournalTamperHalt` が executor から呼ばれておらず、T1〜T5 acceptance criteria が production 上で完全に不達。 | `finalizeStepArtifacts` + `captureHeadSha` の後、`!roundOwnsGitEffects && runtimeStrategy` guard 下に: (1) `verifyNodeJournalAuthorship` 呼び出し、(2) tamper → `restoreJournalToAnchor` + `makeJournalTamperHalt` + `{kind:"halt"}` 返却、(3) ok/skip → `commitJournalArtifacts` 呼び出しを挿入する。 | yes |
| 2 | critical | security | src/core/command/resume.ts | resume command に `verifyResumeJournalAuthenticity` / `restoreResumeJournal` の配線がない。T4（crash→resume）の tamper 検出が production 上で無効。 | `prepare` メソッドの state resolve 後・running 遷移 persist 前に `verifyResumeJournalAuthenticity` を呼び出し、tamper → `restoreResumeJournal` → `PrepareError`、unavailable → `PrepareError`（fail-closed）を実装する（design D5 の位置）。 | yes |
| 3 | critical | security | src/core/pipeline/parallel-review-round.ts | round journal sweep が未実装。`commitRound` 後に `commitJournalArtifacts` を呼ぶ記述がなく、round 経路の journal bytes が checkpoint まで origin に載らない。 | `run` メソッドの `commitRound`（または `commitRoundArtifacts`）完了後に `runtimeStrategy.commitJournalArtifacts(cwd, branch, slug, infra)` を1回呼ぶ。design D1「round 終端の journal sweep」を実装する。 | yes |
| 4 | critical | correctness | src/store/job-state-store.ts | `JobStateStore` constructor が `anchorHolder?: JournalAnchorHolder` を受け取らず `JobJournal` へ渡していない（T-03 未実施）。pipeline の write が in-process anchor に追従せず `verifyNodeJournalAuthorship` の on-disk tooth が常に baseline なしになる。 | constructor opts に `anchorHolder?: JournalAnchorHolder` を追加し、`new JobJournal(this._location, opts?.anchorHolder)` で渡す。 | yes |
| 5 | critical | correctness | src/core/runtime/factory.ts | `createRuntime` が `JournalAnchorHolder` を生成・注入していない。production では `this.journalAnchor === undefined` となり、(a) verifyNodeJournalAuthorship が常に skip/tamper（anchor なし）、(b) commitFinalState が durable anchor を push しない、という状態になる。 | `createRuntime` で `new LocalRuntime({ ..., journalAnchor: new JournalAnchorHolder() })` とし、`LocalRuntime.buildDeps` の `storeFactory` に `anchorHolder: this.journalAnchor` を渡す。 | yes |
| 6 | high | testing | src/core/step/__tests__/per-node-authorship-verification.test.ts | TC-022〜TC-025 は `runtime.verifyNodeJournalAuthorship(...)` を直接呼んでおり executor wiring を通らない。F-01 の gap（executor 未配線）はテストで検出されていない。配線修正後に executor 経由の integration test（tamper → halt が executor の返り値として現れること）が必要。 | F-01 の配線修正後、executor を通して tamper を注入し `{kind:"halt", halt}` が返ることを確認する integration test を追加する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 2 | 0.30 |
| security | 2 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 4 | 0.10 |

- **total**: 4.35

## Summary

基盤実装（pure 関数・git plumbing・holder・LocalRuntime の seam メソッド群・attach 経路）は正しく設計・実装されており、typecheck / test も全件 green。しかし **executor.ts / resume command / round sweep / production factory の4点で配線が欠落**しており、production 実行時は authorship 検証・復元・halt が完全に無効化されている。in-process anchor も `journalAnchor` が常に `undefined` のため populateされず、per-node on-disk tooth は anchor 確立なし → skip（journal 不在）または tamper（journal 存在）という誤った判定を返す。

T7（`commitAndPush` の staging 除外）と attach 経路の authenticity 述語追加（T8 の attach 面）のみが production 上で有効な状態。

修正方針: F-05（factory）→ F-04（JobStateStore）→ F-01（executor）→ F-02（resume）→ F-03（round sweep）の順に実装し、F-06 の executor 経由 integration test を追加することで acceptance criteria T1〜T6 が全経路で達成される。

