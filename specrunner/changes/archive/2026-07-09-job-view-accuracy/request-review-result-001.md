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
| 1 | LOW | Clarity | 要件1 | `resumePoint` が存在する場合に「escalation 由来か否か」を判断する具体的な方法（`steps[resumePoint.step]` の最新 run の verdict を確認する等）が明示されていない。ただし `recordFailedStepResult` が timeout 時に `verdict: null` を設定し、escalation 時は `verdict: "escalation"` となるためコード文脈から実装は一意に導出可能。 | 明記は不要だが、implementer 向けに「`steps[resumePoint.step]` の最新 run の verdict が `"escalation"` であれば escalation 由来と判定する」と一行補足すると認知負荷が下がる。 |

## Verification Notes

**Bug 1 (job ls — escalation 誤帰属) — 確認済み**

- `src/core/job-list/operations-view.ts:150-167`：`deriveEscalationSourceStep` が `state.steps` 全体を走査し `verdict === "escalation"` の最新 run を返す実装を確認。resume 後の別理由での停止でも過去の escalation が表示され続けるバグが実在する。
- `src/state/schema.ts:107-113`：`ResumePoint { step, reason: string, iterationsExhausted, exhaustionPhase? }` の定義を確認。
- `src/state/schema.ts:518-521`：`resumePoint` が optional（backward compat）であることを確認。
- `src/core/pipeline/pipeline.ts:426`（escalation）・`src/core/step/executor.ts:412`（timeout）・`src/core/pipeline/pipeline.ts:683`（exhaustion）の 3 箇所で `resumePoint` が書き込まれることを確認。timeout 時は `recordFailedStepResult` が `verdict: null` を設定するため、`resumePoint.step` の最新 run の verdict を見れば escalation / non-escalation が区別できる。

**Bug 2 (job stats — 二重計上) — 確認済み**

- `src/core/command/job-stats.ts:358-376`：`resolveChangeDir(slug, cwd)` のみで usage.json を解決し、invocation の `jobId` によるフィルタが存在しない実装を確認。
- `src/core/usage/types.ts:17`：`CommandInvocation.jobId?: string`（optional）であり、旧データには jobId がないことを確認。
- `src/core/job-access/resolve-change-dir.ts`：slug → 最新 archive dir の解決ロジックを確認。同一 slug 複数 job が同一 change dir に解決されるため、usage.json が共有されてしまう構造的原因を確認。

**既存テストとの整合性**

- `src/core/job-list/__tests__/operations-view.test.ts`：TC-016/TC-017/TC-018 の fixture は `resumePoint` を設定しない（`makeJobState` のデフォルトに resumePoint なし）。要件 2 のレガシーフォールバックにより、これらのテストは新実装でも引き続き green となる。

**コードライン番号の正確性**

request.md に記載された全ラインレンジ（`operations-view.ts:150-167`、`schema.ts:107-113`、`schema.ts:518-521`、`job-stats.ts:358-376`、`resolve-change-dir.ts:16-56`、`types.ts:17`）をコード照合し、すべて正確であることを確認。

**設計判断の整合性**

architect 評価済みの 4 判断（採用 1 件・却下 3 件）はすべてコード構造と整合しており、スコープ逸脱のリスクなし。
