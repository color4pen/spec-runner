# Design: pipeline error-path テスト拡充

## Context

pipeline の自動テストは happy path に偏っている。`tests/pipeline-integration.test.ts` は
mock client に verdict 列を事前指定して approve まで通すケースが大半で、実運用で起きやすい
失敗系の検証が薄い。

現状の error-path カバレッジを棚卸しすると以下になる。

| 領域 | 既存テスト | 状態 |
|------|-----------|------|
| spec-fixer ループ exhaustion | `pipeline-integration.test.ts` TC-012 | あり (job state まで assert) |
| code-fixer ループ exhaustion | `pipeline-integration.test.ts` TC-061 | あり (job state まで assert) |
| verification/build-fixer ループ exhaustion | — | **欠落** (TC-064 は +1 bypass で pass する path のみ) |
| escalation → resume 往復 | `unit/core/command/resume.test.ts` | resumePrompt 伝播のみ。**往復は欠落** |
| follow-up retry 枯渇 (executor 視点) | `unit/step/executor-verdict.test.ts` TC-VD-001 (judge null→escalation) | executor 単体ではあり。job state 観点が薄い |
| findings 起因 escalation (executor 視点) | TC-VD-003 (nonexistent ref) / TC-VD-004c・005 (decision-needed) | executor 単体ではあり。pipeline 観点が欠落 |
| session 異常終了 | `unit/adapter/managed-agent/agent-runner.test.ts` (terminated→throw) | adapter throw のみ。job state 観点が欠落 |
| verification 部分失敗 | `unit/verification/runner-commands.test.ts` (runner 内 fail-fast) | runner 単体はあり。pipeline で build-fixer に入る観点が欠落 |

打ち切り判定はコード上 3 箇所（spec-review/code-review/verification の各ループ）に分散しており、
exhaustion-consolidation で集約予定である。集約リファクタの前に現行挙動をテストで固定することが
本 change の目的であり、テスト追加で発見された実装 bug は issue 起票に留め、src/ は変更しない。

判定の前提となる仕様:
- judge 系 step の verdict は構造化 findings から CLI が決定論的に導出する
  (`src/core/step/judge-verdict.ts` の `deriveJudgeVerdict`)。優先順位は
  `ok=false → escalation` / `decision-needed → escalation` / `critical|high → needs-fix` / `else → approved`。
- exhaustion は各ループで fixer が `maxIterations` 到達後に「+1 bypass review」も解消できなかった場合に
  `handleExhausted` が発火し、最後の reviewer entry の verdict を `escalation` に書き換え、
  `status=awaiting-resume`・`error.code=<LOOP>_RETRIES_EXHAUSTED`・`resumePoint.step=<対の fixer>`・
  `resumePoint.exhaustionPhase="review-after-final-fix"` を記録する。

## Goals / Non-Goals

**Goals**:

- 3 つの fixer ループ（spec-fixer / code-fixer / build-fixer）すべてに exhaustion → escalation の
  テストを存在させる（既存 2 本を確認し、欠落している build-fixer 分を追加する）。
- escalation で halt した job を resume で再開し、escalation を起こした step から再入することを検証する。
- follow-up retry 枯渇・findings 起因 escalation・session 異常終了・verification 部分失敗の各テストを、
  mock の自己申告ではなく job state の遷移（observable な結果）で assert する。
- 共有 mock helper（`buildPipelineMockClient` / `buildMockGithubClient`）を `tests/helpers/` に集約し、
  テストファイルごとの builder 重複を解消する。

**Non-Goals**:

- exhaustion 判定 3 箇所の実装集約（exhaustion-consolidation として別 change）。
- judge 系 verdict 導出仕様の変更。
- snapshot テストの導入。
- src/ の実装変更。テスト追加で発見された bug は issue 起票に留める。

## Decisions

### D1: テストのみの change とし、src/ は一切変更しない

現行挙動を固定する安全網が目的のため、テストファイルと `tests/helpers/` 配下の共有 helper のみを
変更対象とする。テストが現行実装と矛盾する結果を示した場合（＝ bug 発見）は、テストを実装に
合わせて「現行挙動を pin する」形で書き、別途 issue を起票する。テストを通すために src/ を直さない。

- Rationale: 本 change は exhaustion-consolidation リファクタの前段安全網であり、リファクタ前に
  実装を変えると「何を固定したのか」が曖昧になる。挙動の固定と挙動の修正を分離する。
- Alternatives considered: 発見 bug をその場で修正する案 → スコープ（chore/test-only）を逸脱し、
  リファクタ前の基準点が動くため却下。

### D2: assert は job state の observable な遷移で行い、mock の自己申告に依存しない

各テストは `result.status` / `result.error?.code` / `result.steps?.[step]` の StepRun 配列とその
`outcome.verdict` / `result.resumePoint` を assert する。`mock.calls` の回数だけで合否を判定しない。

- Rationale: 受け入れ基準が「mock 自己申告ではなく job state の遷移を assert」であり、observable な
  結果のみが exhaustion-consolidation 後も不変であるべき契約だから。
- Alternatives considered: spy の呼び出し回数で検証する案 → 実装内部構造に結合し、リファクタで壊れる
  ため補助的な位置づけに留める。

### D3: 共有 mock helper を `tests/helpers/` に集約する

`buildPipelineMockClient` と `buildMockGithubClient` は `tests/pipeline-integration.test.ts` と
`tests/multi-layer-defense.test.ts` にほぼ重複定義されている。両者の和集合となる signature を
`tests/helpers/pipeline-mock-client.ts`（仮）に切り出し、両ファイルから import する。
judge 系 mock は `approved` boolean ではなく `findings` 配列を返す現行形を維持する。

新規テストが必要とする拡張は helper に additive に足す:
- `specReviewVerdicts` / `codeReviewVerdicts` に decision-needed 起因の escalation を表現する
  verdict mode を追加する（`ok:true` + `resolution:"decision-needed"` の finding を emit）。
  既存の `"escalation"` は voluntary failure（`ok:false`）を表すため別物として残す。
- session 異常終了を任意の step で注入できるよう、`designFailure` を一般化した step 指定の
  termination 注入オプションを additive に追加する（既存 `designFailure` の挙動は不変に保つ）。

- Rationale: 受け入れ基準と要件 7「builder 重複を増やさない」を満たす。helper を 1 箇所にすると
  judge mock の findings 形への追随も 1 箇所で済む。
- Alternatives considered: 各テストファイルに builder を複製し続ける案 → 重複が増えるため却下。
  helper を全面再設計する案 → スコープ過大かつ既存テストの広域改変を招くため、和集合抽出に留める。

### D4: 既存 exhaustion テストを再利用し、欠落ループのみ追加する

spec-fixer（TC-012）と code-fixer（TC-061）の exhaustion → escalation は既に job state まで
assert 済みである。これらは要件 1 を満たすため流用し、欠落している verification/build-fixer の
exhaustion テストを追加する。全 verification iteration（+1 bypass を含む）が failed を返すよう
`runVerification` mock を構成し、`error.code="VERIFICATION_RETRIES_EXHAUSTED"`・
`status="awaiting-resume"`・`resumePoint.exhaustionPhase="review-after-final-fix"`・
`resumePoint.step="build-fixer"` を assert する。

- Rationale: 既存 2 本は受け入れ基準が要求する observable assert を備えており、再実装は重複。
  最優先ギャップは review finding #1 が指摘した verification exhaustion path。
- Alternatives considered: 3 ループとも書き直す案 → 既存資産の無駄かつ差分が膨らむため却下。

### D5: escalation → resume 往復は pipeline 再入 API で検証する

往復テストは 2 フェーズで構成する。
1. pipeline を escalation まで走らせ `status=awaiting-resume` と `resumePoint` を得る。
2. mock を「次は解消する」状態に組み替え、`createStandardPipeline(deps, bus).run(resumePoint.step, resumedState, deps)`
   で再入し、`resumePoint.step` から再開して完了（`awaiting-archive`）へ到達することを assert する。

exhaustion 起因の場合 `resumePoint.step` は対の fixer 名（例: spec-fixer / code-fixer / build-fixer）、
findings 起因（decision-needed 等）の場合は escalation を起こした reviewer step 自身になる。テストは
どちらの起点でも「resumePoint が指す step から再入する」ことを確認する。

- Rationale: `Pipeline.run(startStep, ...)` が任意 step からの再入を直接サポートしており、resume コマンドの
  step 解決（`resolveResumeStep`）も resumePoint.step を返す。observable な再入起点を直接検証できる。
- Alternatives considered: CLI コマンド `resume` を end-to-end で叩く案 → worktree / git 副作用が絡み
  単体テストとして不安定。pipeline 再入 API レベルで往復を固定する方が決定論的。

### D6: executor 観点と pipeline 観点を二層で配置し、runtimeStrategy 依存を明示する

follow-up retry 枯渇・findings 起因 escalation は executor 単体テスト（`executor-verdict.test.ts`）に
既存の決定論的カバレッジがある。本 change ではそれらを土台にしつつ、job state 観点（pipeline を通した
`status` / `error` / `resumePoint`）の assert を補う:
- follow-up retry 枯渇: judge 系は null toolResult → escalation → `awaiting-resume`、
  producer 系は null toolResult → `completionVerdict`（既定 success）で pipeline 続行、を assert する。
- decision-needed 起因 escalation: helper の decision-needed verdict mode を使い、runtimeStrategy 不要で
  pipeline が `awaiting-resume` に入ることを assert する。
- 実在しない file を参照する blocking finding 起因 escalation: 当該分岐は
  `deps.runtimeStrategy.verifyFindingRefs` が非 null かつ非空配列を返すときのみ発火する
  （executor.ts 内）。pipeline 観点で固定する場合は `verifyFindingRefs` が非空を返す runtimeStrategy を
  注入する。注入しない構成では executor 単体テスト（TC-VD-003）でカバーする。

- Rationale: review finding #2・#3 が指摘したとおり、nonexistent-ref 分岐は runtimeStrategy 非 null が
  前提であり、注入を怠ると assert が静かに本物の code path を踏まない。層を明示して取りこぼしを防ぐ。
- Alternatives considered: 全部 pipeline 観点に寄せる案 → nonexistent-ref が runtimeStrategy 注入を
  要し冗長。全部 executor 観点に寄せる案 → 受け入れ基準「job state の遷移を assert」を満たさない。

### D7: session 異常終了テストは「現行の停止状態」を pin する

agent session が terminated / エラー終了したとき、SESSION_TERMINATED 系のエラーが state に記録され、
job が再開可能な状態で停止することを assert する。helper の termination 注入で対象 step の session を
terminated にし、`error.code` が SESSION_TERMINATED 系であること、および停止後の status が再開可能で
あることを observable に確認する。実際の停止 status（awaiting-resume か否か）は実装の現行挙動を
観測して pin し、もし「再開不能な hard failure」で止まる等の不整合が見つかった場合は D1 に従い
issue 起票に留める。

- Rationale: session 異常は normalizeSessionError によって code が決まり（既定 SESSION_TERMINATED）、
  停止状態は lifecycle 不変条件に依存する。実挙動を観測して固定するのが安全網として正しい。
- Alternatives considered: 「awaiting-resume であるべき」と決め打ちで assert する案 → 現行挙動が
  異なる場合にテストが赤くなり src/ 修正へ誘導してしまう（スコープ逸脱）ため、現行挙動を pin する。

## Risks / Trade-offs

- [Risk] helper 集約のリファクタが既存テスト（pipeline-integration / multi-layer-defense）を壊す。
  → Mitigation: 抽出 signature を両 builder の和集合とし、デフォルト値・session 既定列を現行と一致させる。
  変更後に `bun run typecheck && bun run test` の全件 green を確認する。
- [Risk] session 異常終了の停止 status が想定（再開可能）と異なる現行挙動を取る。
  → Mitigation: D7 に従い現行挙動を観測して pin し、不整合は issue 起票に留めて src/ を変えない。
- [Risk] decision-needed / termination 注入のための helper 拡張が helper の表面積を不必要に広げる。
  → Mitigation: 既存オプションを不変に保つ additive 拡張に限定し、新規 verdict mode と注入 hook 以外を足さない。
- [Risk] verification exhaustion テストの iteration 回数（+1 bypass）を誤ると green/red が逆転する。
  → Mitigation: `maxRetries=2` 構成で verification を 3 回とも failed にする（既存 TC-064 の iteration 構成を反転利用）。
- [Risk] nonexistent-ref 分岐が runtimeStrategy 注入漏れで踏まれない。
  → Mitigation: D6 に従い当該分岐を踏むテストでは `verifyFindingRefs` 非空を返す runtimeStrategy を必ず注入する。

## Open Questions

- なし（実装中に session 異常終了の現行停止 status を観測し、D7 に従って pin する）。
