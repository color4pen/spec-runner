# Tasks: build-fixer の廃止 — verification 失敗は implementer への継続再入で直す

> 参照: design.md の D1〜D4 と「Test 更新対象の全列挙」。列挙外のファイルは無変更で green を保つ。

## T-01: 遷移表を implementer 再入へ置換(STANDARD / FAST)

- [ ] `src/core/pipeline/reverification.ts` に `verificationFailedLast(state): boolean` を追加
      (最新 verification run の `outcome.verdict === "failed"` を返す純関数)。`STEP_NAMES.VERIFICATION` を使用
- [ ] `IMPL_CODE_MUTATOR_STEPS` から `STEP_NAMES.BUILD_FIXER` を除去(implementer は既存で残す)。関連コメント修正
- [ ] `src/core/pipeline/types.ts` STANDARD: `VERIFICATION failed → BUILD_FIXER` を
      `VERIFICATION failed → IMPLEMENTER` に置換。`BUILD_FIXER success → VERIFICATION` / `BUILD_FIXER error → escalate`
      の 2 行を削除
- [ ] STANDARD 実装完了経路に `{ step: IMPLEMENTER, on: "success", to: VERIFICATION, when: verificationFailedLast }`
      を **`when: isTestGenExempt` 行の直後・`→ BITE_EVIDENCE` 行の前** に追加(first-match-wins 順序を厳守)
- [ ] `src/core/pipeline/types.ts` FAST: `VERIFICATION failed → BUILD_FIXER` を
      `VERIFICATION failed → IMPLEMENTER` に置換。`BUILD_FIXER` 2 行を削除(FAST は bite-evidence 無し=追加行不要)
- [ ] 冒頭コメント(`implementer / build-fixer use "success"/"error"`)を build-fixer 除去に合わせて修正

**Acceptance Criteria**:
- STANDARD_TRANSITIONS / FAST_TRANSITIONS に `step=VERIFICATION, on=failed, to=IMPLEMENTER` の行が存在する
- 両遷移表に `step=BUILD_FIXER` の行が存在しない
- STANDARD に `step=IMPLEMENTER, on=success, to=VERIFICATION, when=verificationFailedLast` が
  `to=BITE_EVIDENCE` 行より前に存在する
- `verificationFailedLast` が最新 verification=failed で true、passed/未実行で false を返す(単体テスト)

## T-02: registry の paired fixer / step 登録 / role を更新

- [ ] `src/core/pipeline/registry.ts` STANDARD/FAST descriptor の `loopFixerPairs[VERIFICATION]` を
      `STEP_NAMES.IMPLEMENTER` に変更
- [ ] 両 descriptor の `steps` 配列から `[STEP_NAMES.BUILD_FIXER, BuildFixerStep]` を削除
- [ ] 両 descriptor の `roles` から `[STEP_NAMES.BUILD_FIXER]: {...}` を削除
- [ ] `BuildFixerStep` の import を削除。step 順序コメントを修正

**Acceptance Criteria**:
- `STANDARD_DESCRIPTOR.loopFixerPairs[VERIFICATION] === "implementer"`(FAST も同様)
- 両 descriptor の `steps` / `roles` に build-fixer が存在しない
- `bun run typecheck` が registry.ts で通る

## T-03: implementer に失敗文脈注入と回復 message を実装(制約を持ち込まない)

- [ ] `src/core/step/implementer.ts` に `enrichContext(dynamicContext, cwd, slug)` を追加。
      `verificationResultPath(slug)` を best-effort 先読みし `{ ...dynamicContext, verificationContent }` を返す
      (不在時は dynamicContext をそのまま返す)。`buildFailureSection`(build-fixer から移設)で
      `## Verification Failures`(failed phase / exit code / error output)を組み立てる
- [ ] `buildMessage` を分岐: `verificationFailedLast(state)` が真のとき **回復 message** を返す
  - 指示は「verification の失敗を解消する。canon(test-cases.md / spec)と整合するよう実装・テストを直す」のみ。
    **機械的修正限定・設計判断禁止・範囲限定の文言を含めない**
  - 失敗 command と出力の `## Verification Failures` セクションを含める
    (`deps.dynamicContext?.verificationContent` を `extractVerificationFailures` で展開)
  - 継続(前回 sessionId あり)時は前回文脈が session に残る前提の短縮版、
    fresh fallback 時は `buildImplementerInitialMessage`(branch 文脈 + tasks/spec 案内)に失敗セクションを付す
- [ ] 既存の conformance 再入分岐・通常初回分岐は現状維持(`verificationFailedLast` が偽の経路)

**Acceptance Criteria**:
- `verificationFailedLast` 真の state で buildMessage が失敗 command/出力を含む(単体テスト)
- 回復 message に「機械的修正のみ」「設計判断禁止」等の制約文言が含まれない(単体テスト)
- verification-result.md 不在でも enrichContext が throw せず元の dynamicContext を返す
- `verificationFailedLast` 偽(初回・conformance 再入)では message が従来と同一

## T-04: session 継続の配線(step-context-builder)と fresh fallback

- [ ] `src/core/step/step-context-builder.ts` の `resumeSessionId` 算出を拡張:
      `FIXER_STEP_NAMES.has(step.name)` に加え、
      **`step.name === STEP_NAMES.IMPLEMENTER && verificationFailedLast(state)`** の場合も
      `getPreviousSessionId(state, STEP_NAMES.IMPLEMENTER) ?? undefined` を渡す
      (`verificationFailedLast` を reverification.ts から import。文字列 literal でなく定数使用)
- [ ] 前回 sessionId が null/不在なら `undefined`(fresh)に倒れることを保証(既存 `?? undefined` パターン)

**Acceptance Criteria**:
- implementer + 最新 verification=failed + 前回 implementer sessionId あり → `session.resumeSessionId` に前回 ID が入る
- 前回 implementer run が無い/ sessionId=null → `session.resumeSessionId === undefined`(fresh、例外なし)
- 最新 verification=passed(conformance 再入)や初回 → implementer は resumeSessionId undefined(従来通り)

## T-05: resume の後方互換 alias(build-fixer → implementer)

- [ ] `src/core/resume/resolve-step.ts` に `LEGACY_STEP_ALIASES = { "build-fixer": STEP_NAMES.IMPLEMENTER }` を追加
- [ ] `resolveResumeStep` で `from` と `resumePoint.step` に alias を適用(`mapMemberToCoordinator` と同様の前段写像)

**Acceptance Criteria**:
- `resolveResumeStep("build-fixer", ...)` が `"implementer"` を返す
- `resolveResumeStep(undefined, {step:"build-fixer", ...})` が `"implementer"` を返す
- 既存の member→coordinator 写像・その他 step 名解決は不変(既存テスト green)

## T-06: build-fixer step / prompt / whitelist / 登録の削除

- [ ] `src/core/step/build-fixer.ts` を削除
- [ ] `src/prompts/build-fixer-system.ts` を削除
- [ ] `src/kernel/step-names.ts`: `AGENT_STEP_NAMES` から `"build-fixer"`、`STEP_NAMES` から `BUILD_FIXER` を削除
- [ ] `src/kernel/agent-definition.ts`: `AgentStepName` union から `"build-fixer"` を削除
      (AGENT_STEP_NAMES との bidirectional 同期を維持。typecheck で確認)
- [ ] `src/core/step/fixer-helpers.ts`: `FIXER_STEP_NAMES` から `BUILD_FIXER` を削除。
      `buildContinuationMessage` の source 判定から build-fixer 分岐を削除(spec-fixer/code-fixer は不変)。doc コメント修正
- [ ] `src/core/step/write-scope.ts`: `GUARDED_WRITE_STEPS` から `"build-fixer"` を削除(implementer は残す)
- [ ] `src/core/doctor/checks/agents/agents-registered.ts` / `definition-drift.ts` / `agent-provider-alive.ts`:
      必須/期待 agent 群から `BUILD_FIXER`(および `BuildFixerStep` import)を削除
- [ ] `src/cli/managed.ts` / `src/cli/config-effective.ts`: `BuildFixerStep` の import と登録を削除

**Acceptance Criteria**:
- `src/` に `build-fixer.ts` / `build-fixer-system.ts` が存在しない
- `AGENT_STEP_NAMES` / `AgentStepName` / `STEP_NAMES` に build-fixer が無く、`bun run typecheck` が green
- `--from` 有効候補(`[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]`)に build-fixer が含まれない
- doctor / managed / config-effective が build-fixer を参照しない

## T-07: agent-facing prompt 内容の更新(build-fixer 記述の除去)

- [ ] `src/prompts/rules.ts` の責任範囲表から build-fixer 行を削除
- [ ] `src/prompts/pipeline-map.ts` の step 一覧から build-fixer 行を削除し、verification 失敗が implementer 再入で
      直る旨に整合させる
- [ ] `src/prompts/fragments.ts` の `COVERAGE_GATE_INTEGRITY` は code-fixer が使用するため fragment 自体は維持。
      コメントの build-fixer 言及のみ修正

**Acceptance Criteria**:
- rules.ts / pipeline-map.ts の生成テキストに build-fixer が現れない
- COVERAGE_GATE_INTEGRITY fragment は残存し code-fixer prompt に含まれ続ける(既存 code-fixer テスト green)

## T-08: コメント整合(削除に伴う説明の追随)

- [ ] build-fixer を説明していた **編集済みファイル内** のコメントを implementer 再入に整合させる
      (`git/dynamic-context.ts` の `verificationContent` doc、`verification/propagate.ts` /
      `verification.ts` / `reload-coverage-config.ts` / `parse-result.ts`、`staging-containment.ts` /
      `commit-push.ts` / `canon-write-scope.ts` / `report-tool.ts` / `port/*.ts` / `config/schema/types.ts` 等)
- [ ] 純コメントのみで挙動に無関係な箇所は最小限に留める(green には不要)

**Acceptance Criteria**:
- 編集済みファイルのコメントが build-fixer step の存在を前提としない
- コメント変更が挙動・テストに影響しない(green 維持)

## T-09: テスト更新 — 削除シンボル import 破綻の解消(design 表 A)

- [ ] `tests/prompts/build-fixer-system.test.ts` と `src/prompts/__tests__/coverage-gate-prohibition.test.ts` を削除
- [ ] `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` /
      `src/prompts/__tests__/fragment-coverage.test.ts` /
      `src/prompts/__tests__/artifact-hygiene-discipline.test.ts` /
      `tests/unit/prompts/fragment-coverage.test.ts` / `tests/unit/prompts/common-context-catch.test.ts` /
      `tests/unit/rules-md.test.ts` / `tests/anthropic-step-model-refresh.test.ts` から
      `BUILD_FIXER_SYSTEM_PROMPT` / `BuildFixerStep` の import と該当行・describe を除去(他 prompt/step は不変)

**Acceptance Criteria**:
- 上記ファイルが削除シンボルを import せず compile する
- 残存する code-fixer / spec-fixer / implementer 等の prompt テストは不変で green

## T-10: テスト更新 — 遷移/予算/exhaustion/再入(design 表 B)

- [ ] `tests/pipeline-integration.test.ts`: TC-064 / TC-065 を implementer 再入へ更新。
      exhaustion の `resumePoint.step` 期待を `"implementer"` に。`agents` fixture の build-fixer 行除去
- [ ] `tests/unit/core/pipeline/pipeline.reverification.test.ts`: `makeStandardSteps` から build-fixer を除去し、
      TC-003/TC-004/exhaustion を implementer 再入(回復ループ)で表現
- [ ] `tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts`: mutator を build-fixer→implementer に差し替え
      (`IMPL_CODE_MUTATOR_STEPS` 変更に追随)。必要なら実態に合わせ再命名
- [ ] `tests/error-path-integration.test.ts`: TC-T07 を「verification 部分失敗 → implementer runs」へ。`agents` fixture 除去
- [ ] `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts`: `stepNames toContain BUILD_FIXER` を除去
- [ ] `src/core/step/__tests__/fixer-reviewer.test.ts`: build-fixer source label テストを除去
- [ ] `tests/core/step/fixer-helpers.test.ts`: `FIXER_STEP_NAMES.has("build-fixer")` と build-fixer source label を除去

**Acceptance Criteria**:
- 更新後テストが implementer 再入経路を検証し green
- exhaustion テストが `VERIFICATION_RETRIES_EXHAUSTED` の **発火** を固定(回数値に依存しない)

## T-11: テスト更新 — doctor / registry / agent 定義(design 表 C)

- [ ] `tests/core/doctor/checks/agents/agents-registered.test.ts` / `definition-drift.test.ts` /
      `tests/core/doctor/mock-context.ts` / `tests/unit/agent/registry.test.ts` から build-fixer を除去
- [ ] `tests/unit/core/command/rules-new.test.ts` の `"build-fixer"` を live step(例 `code-fixer`)へ差し替え
- [ ] `tests/reviewer-activation-e2e.test.ts` / `tests/multi-layer-defense.test.ts` /
      `tests/custom-reviewers-e2e.test.ts` の `agents: {"build-fixer": ...}` 行を除去
- [ ] `tests/adapter/managed-agent/agent-runner.test.ts` / `agent-runner-verbose-log.test.ts` を確認し、
      build-fixer を sample に使う箇所があれば live step へ差し替え

**Acceptance Criteria**:
- doctor/registry/agent テストが build-fixer を要求せず green
- rules-new テストが有効 step 名で成功する

## T-12: 受け入れ基準の新規テスト追加(design 表 D)

- [ ] 遷移: STANDARD / FAST の `VERIFICATION failed → IMPLEMENTER` を固定(通常・chore 両経路)
- [ ] 継続再入: 前回 implementer sessionId ありで `resumeSessionId` に前回 ID、message に失敗 command/出力が入る
- [ ] fresh fallback: 前回 sessionId 無しで `resumeSessionId undefined`、message は失敗内容を含み error にならない
- [ ] ループ上限: 持続失敗で `VERIFICATION_RETRIES_EXHAUSTED` が発火(pipeline 統合、回数非依存)
- [ ] 互換: build-fixer 実行歴を含む state の load/fold が壊れない + `resolveResumeStep("build-fixer") → implementer`
- [ ] 予算回帰防止: 回復再入が bite-evidence をバイパスし verification に直帰する(D2)

**Acceptance Criteria**:
- 上記 6 観点が個別テストで green
- 受け入れ基準(request.md)の各項目に 1:1 で対応するテストが存在する

## T-13: 全体検証

- [ ] `tasks.md` の各チェックボックスを完了に更新
- [ ] `bun run typecheck && bun run test` が green
- [ ] design.md「Test 更新対象の全列挙」表の DEL/UPD/ADD が全て反映され、NC 列のファイルは無変更であることを確認

**Acceptance Criteria**:
- `typecheck && test` が green
- 列挙外(NC)ファイルに差分が無い
- `src/` 全体に build-fixer の live 参照(step 定義・prompt・遷移・agent 登録・whitelist)が残らない
