# Tasks: pipeline error-path テスト拡充

実装方針（全タスク共通）:
- src/ は変更しない。変更対象はテストファイルと `tests/helpers/` 配下の共有 helper のみ。
- assert は job state の observable な遷移（`status` / `error.code` / `steps[step]` の `outcome.verdict` /
  `resumePoint`）で行い、mock の呼び出し回数の自己申告に依存しない。
- テストが現行実装と矛盾する結果を示した場合は、現行挙動を pin する形で書き、別途 issue を起票する
  （T-08 参照）。テストを通すために src/ を直さない。

## T-01: 共有 pipeline mock helper の集約

- [x] `tests/helpers/pipeline-mock-client.ts`（新規）を作成し、`buildPipelineMockClient` と
      `buildMockGithubClient` を移設・export する。signature は `tests/pipeline-integration.test.ts` と
      `tests/multi-layer-defense.test.ts` の両定義の和集合（`specReviewVerdicts` / `codeReviewVerdicts` /
      `sessionIds` / `designFailure` 等）とし、デフォルト値・session 既定列を現行と一致させる。
- [x] judge 系 mock は `approved` boolean ではなく `findings` 配列を返す現行形を維持する。
- [x] `tests/pipeline-integration.test.ts` と `tests/multi-layer-defense.test.ts` のローカル定義を削除し、
      新 helper から import するよう書き換える。
- [x] helper に additive 拡張を加える:
      (a) decision-needed 起因 escalation を表す verdict mode（`ok:true` + `resolution:"decision-needed"` の
          finding を emit。既存の `"escalation"` = voluntary failure とは別物として残す）。
      (b) session termination を任意 step で注入するオプション（`designFailure` の一般化。既存
          `designFailure` の挙動は不変に保つ）。

**Acceptance Criteria**:
- `buildPipelineMockClient` / `buildMockGithubClient` の定義がリポジトリ内で 1 箇所（`tests/helpers/`）のみになる。
- 既存の pipeline-integration / multi-layer-defense の全テストが helper 経由で従来どおり green。
- `bun run typecheck` が green。

## T-02: verification/build-fixer ループ exhaustion テスト追加

- [x] `tests/pipeline-integration.test.ts` に、全 verification iteration（+1 bypass を含む計 3 回、
      `maxRetries=2`）が `failed` を返すよう `runVerification` mock を構成したテストを追加する。
- [x] 以下を assert する:
      `result.status === "awaiting-resume"` /
      `result.error?.code === "VERIFICATION_RETRIES_EXHAUSTED"` /
      `result.steps?.["verification"]` 末尾の `outcome.verdict === "escalation"` /
      `result.resumePoint?.step === "build-fixer"` /
      `result.resumePoint?.exhaustionPhase === "review-after-final-fix"`。

**Acceptance Criteria**:
- verification/build-fixer ループの exhaustion → escalation テストが存在し、上記 job state を assert する。
- 既存 TC-012（spec-fixer）・TC-061（code-fixer）と合わせて 3 つの fixer ループすべてに
  exhaustion → escalation テストが揃う（既存 2 本が job state を assert していることを確認し、
  不足があれば assert を補強する）。

## T-03: escalation → resume 往復テスト追加

- [x] pipeline を escalation まで走らせ `status==="awaiting-resume"` と `resumePoint` を取得する
      フェーズ 1 を書く（exhaustion 起点を利用する）。
- [x] mock を解消側（次の review で approved を返す等）に組み替え、
      `createStandardPipeline(deps, bus).run(resumePoint.step, resumedState, deps)` で再入するフェーズ 2 を書く。
- [x] 再開後に pipeline が `resumePoint.step` から始まり、`status` が `awaiting-archive` へ到達することを
      assert する。完了済み step を起点に巻き戻していないことを確認する。

**Acceptance Criteria**:
- escalation → resume の往復が 1 つのテストで検証され、`resumePoint.step` を起点に再入して完走することを
  job state で assert する。

## T-04: follow-up retry 枯渇のフォールバックテスト（job state 観点）

- [x] judge 系 step が toolResult を返さない（no-tool-call が `maxAttempts`=2 を超える）構成で、
      verdict が `escalation` となり pipeline が `awaiting-resume` に入ることを assert するテストを追加する。
- [x] producer 系 step が toolResult を返さない構成で、verdict が step の `completionVerdict`（既定
      `success`）となり pipeline が後続 step に進むことを assert するテストを追加する。
- [x] 既存 `tests/unit/step/executor-verdict.test.ts` の TC-VD-001（judge null→escalation）等を土台に、
      job state 観点の assert を補う形で配置する（executor 単体か pipeline 経由かは observable assert を
      満たす方を選ぶ）。任意で adapter 観点を足す場合は `followUpAttempts === maxAttempts` を assert する。

**Acceptance Criteria**:
- follow-up retry 枯渇時に judge 系 → escalation、producer 系 → completionVerdict（既定 success）へ
  落ちることが observable な結果で検証される。

## T-05: findings 起因 escalation テスト（pipeline 観点）

- [x] judge の findings に `resolution="decision-needed"` を含む場合に verdict が `escalation` となり、
      `result.status === "awaiting-resume"` になることを pipeline 経由で assert する（T-01 の
      decision-needed verdict mode を使用。runtimeStrategy 注入は不要）。
- [x] 実在しない file を参照する blocking finding を含む場合に escalation へ遷移することを検証する。
      当該分岐は `deps.runtimeStrategy.verifyFindingRefs` が非空配列を返すときのみ発火するため、
      非空を返す runtimeStrategy を注入する（注入しない場合は既存 executor 単体テスト TC-VD-003 で
      カバーされていることを確認する）。

**Acceptance Criteria**:
- decision-needed finding 起因の escalation が job state（`status`/verdict）で検証される。
- 実在しない file 参照の blocking finding 起因の escalation が、`verifyFindingRefs` 非空の経路を
  実際に踏んだ上で検証される。

## T-06: session 異常終了テスト（job state 観点）

- [x] helper の termination 注入で対象 step の agent session を terminated 終了させ、
      job state の `error.code` が SESSION_TERMINATED 系であることを assert するテストを追加する。
- [x] 停止後の状態が再開可能であることを observable に確認する。停止 status の実値は現行挙動を観測して
      pin する（D7）。

**Acceptance Criteria**:
- session 異常終了時に SESSION_TERMINATED 系の error が state に記録され、再開可能な状態で停止することが
  job state で検証される。

## T-07: verification 部分失敗 → build-fixer テスト

- [x] verification が build 成功 + test 失敗の混在 phase 結果で verdict `failed` を返す構成で、
      verdict が failed となり build-fixer の StepRun が記録されることを pipeline 経由で assert するテストを追加する。
- [x] runner 単体での部分失敗（fail-fast 集計が `failed` になる）が既存 `tests/unit/verification/` で
      カバー済みか確認し、欠落があれば補う。

**Acceptance Criteria**:
- 一部 phase のみ失敗するケースで verdict が failed になり build-fixer ループに入ることが検証される。

## T-08: 検証と bug の issue 起票

- [x] `bun run typecheck && bun run test` が green であることを確認する。
- [x] テスト追加の過程で現行実装の bug を発見した場合、src/ を変更せず内容を整理し issue 起票候補として
      記録する（テストは現行挙動を pin する形に保つ）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- src/ への変更が 0 件である。
- 受け入れ基準（3 ループ exhaustion / resume 往復 / follow-up 枯渇 / findings 起因 escalation /
  session 異常終了 / verification 部分失敗）の各テストが存在する。
