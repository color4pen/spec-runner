# Design: build-fixer の廃止 — verification 失敗は implementer への継続再入で直す

## Context

現行 pipeline は verification(build / typecheck / lint / test)失敗を独立 step
`build-fixer` に渡す。build-fixer は fresh session で「機械的修正のみ・設計判断禁止・
失敗出力の範囲のみ」という制約下で作業するため、(a) 実装者なら一手で直せる失敗を文脈を
再構築しながら直す、(b) 設計判断に触れる失敗を制約上直せず歪んだ最小修正か escalation に
なる、という 2 つの損失を生む。

本変更は build-fixer step を廃止し、verification 失敗を **implementer への再入**へ置き換える。
再入は直前の implementer session の継続(resume)として行い、失敗した command と出力を渡す。

### 現状コードの確定事実(探索で検証済み)

- 遷移表 `src/core/pipeline/types.ts`
  - STANDARD `:288-293`: `VERIFICATION passed → ADR_GEN|CODE_REVIEW`、`failed → BUILD_FIXER`、
    `BUILD_FIXER success → VERIFICATION`、`error → escalate`
  - FAST `:345-350`: 同型(`failed → BUILD_FIXER` / `BUILD_FIXER success → VERIFICATION`)
  - STANDARD 実装完了経路 `:280-281`: `IMPLEMENTER success → VERIFICATION (when isTestGenExempt)` /
    `→ BITE_EVIDENCE`。bite-evidence `:284-285` が `passed|strategy-deferred → VERIFICATION`
- ループ予算 `src/core/pipeline/pipeline.ts` + `convergence-budget.ts`
  - verification は `loopNames` かつ `loopFixerPairs[VERIFICATION] = BUILD_FIXER`(registry.ts `:66/:153`)
  - 予算リセットは **paired fixer を経由した再入では発火しない**(`newEpisode = currentStep !== pairedFixer`,
    pipeline.ts `:522`)。build-fixer→verification は同一 fixer 経由なのでリセットされず、
    loop/fixer カウンタが積み上がり `VERIFICATION_RETRIES_EXHAUSTED`(types.ts `:195-199`)で止まる
  - **リセットが必要な経路**: conformance→verification 再検証は `currentStep=conformance ≠ pairedFixer`
    なので `resetLoopStep(verification).resetFixerStep(fixer)` が発火し fresh 予算で再検証する
    (project.md「verification が fresh な状態で再実行」の根拠)。これは **verification が paired fixer を
    持つこと**に依存する
- session 継続 `src/core/step/step-context-builder.ts:96` は `FIXER_STEP_NAMES.has(step.name)` の時のみ
  `resumeSessionId = getPreviousSessionId(state, step.name)` を渡す。adapter は
  `ctx.session.resumeSessionId ? { resume } : {}`(agent-runner.ts `:559-560`)で SDK に渡す
- 失敗文脈の注入: build-fixer は `enrichContext` で verification-result.md を先読みし
  `dynamicContext.verificationContent` に載せ、`buildFailureSection` で inline 展開していた
  (`extractVerificationFailures` は `src/core/verification/parse-result.ts`、本変更でも維持)
- `--from` 候補は `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]`(command-registry.ts `:209`、
  resolve-step.ts `:8/:21`)から導出。`AGENT_STEP_NAMES` は rules-new のバリデーション
  (rules-new.ts `:41`)や doctor の必須 agent 群にも波及する
- 過去 job state は `state.steps["build-fixer"]` に実行歴を持つ。`StepName = string`、`toStepName` は
  passthrough なので未知 step 名は projection/fold で保持されるが、resolve-step.ts `:100-106` の
  resumePoint 経路は **allowed 検証をせず** `resumePoint.step` をそのまま返す(build-fixer 復帰点は
  descriptor に step が無く "Step not found" になり得る)

## Goals / Non-Goals

**Goals**:

- `VERIFICATION failed → IMPLEMENTER`(再入)へ置換し、build-fixer step / prompt / 遷移 /
  `--from build-fixer` 候補を削除する
- 再入を直前 implementer session の継続として実行し、失敗 command と出力を message で渡す。
  継続元 session が無い場合は fresh session に fallback(エラーにしない)
- 再入指示は「検証の失敗を解消する」ことのみ。機械的修正限定・設計判断禁止・範囲限定は課さない
- `VERIFICATION_RETRIES_EXHAUSTED` の意味論(再入回数の歯)を維持する
- build-fixer 実行歴を含む既存 state の読み込み・fold・resume が壊れないこと

**Non-Goals**(request スコープ外):

- code-fixer の統合
- verification の判定内容・command 実行の変更
- regression-gate / conformance の挙動変更
- managed runtime での session 継続方式(local runtime の継続のみ対象)

## Decisions

### D1: verification の paired fixer を implementer にする(`loopFixerPairs[VERIFICATION] = IMPLEMENTER`)

`loopFixerPairs` から `VERIFICATION → BUILD_FIXER` を消し、`VERIFICATION → IMPLEMENTER` にする
(STANDARD / FAST 両 descriptor)。遷移も `VERIFICATION failed → IMPLEMENTER` に置換する。

**Rationale**: verification のループ予算・exhaustion・fresh-budget リセットは全て
`loopFixerPairs` の構造(paired fixer を経由した再入はリセットしない / 非 fixer からの再入は
リセットする)に依存している。build-fixer が占めていた「verification が失敗を渡す先」の座標に
implementer を置くと、この機構がそのまま働き、`VERIFICATION_RETRIES_EXHAUSTED` と
「conformance 再検証は fresh 予算」の両方が **無改造で維持**される。実装完了 verdict は
implementer も `"success"` なので `IMPLEMENTER success → VERIFICATION` の既存経路がそのまま
再検証に使える。

**Alternatives considered**:

- *verification を paired fixer 無しの自己ループにする*(conformance と同型の lifetime カウンタ) —
  却下。paired fixer が無いと `newEpisode` リセットが発火せず、conformance→verification 再検証が
  即 exhaustion で打ち切られる(project.md の fresh-budget 契約を壊す)。
- *loopFixerPairs 用の独立カウンタを新設* — 却下。既存機構の再発明。`loopFixerPairs` は
  role の宣言(registry.roles)とは独立した純構造マップで、値の role を fixer に限る検証は無い
  (pipeline.ts は `Object.values(loopFixerPairs)` の集合演算のみ)。implementer(role: creator)を
  値に置くのは機構上安全。

**副作用(no-op)**: `Object.values(loopFixerPairs)` に implementer が入るため、pipeline.ts の
"Approved verdict overturned by fixer budget" ブロック(`fixerNamesForReroute`)も implementer を
対象に含む。ただし STANDARD / FAST の全遷移表に `approved → implementer` への遷移は存在しない
ため、このブロックは implementer に対して発火しない(実質 no-op)。

### D2: 再入時の bite-evidence バイパス(`IMPLEMENTER success → VERIFICATION when verificationFailedLast`)

STANDARD の実装完了経路に、既存 `when: isTestGenExempt` 行の直後・`→ BITE_EVIDENCE` 行の前に
新行 `{ IMPLEMENTER, success, VERIFICATION, when: verificationFailedLast }` を追加する。
`verificationFailedLast(state)` = 「最新 verification run の verdict が `failed`」。

**Rationale(歯の維持に必須)**: build-fixer の回復ループは
`verification(fail) → build-fixer → verification` と密で、build-fixer は verification の
paired fixer なので `newEpisode=false`(リセット無し)で予算が積み上がった。implementer 経由でも
密ループにするには、回復再入の implementer 完了を **bite-evidence を挟まず** verification に
直帰させる必要がある。もし `implementer → bite-evidence → verification` を通すと、
`bite-evidence ≠ pairedFixer(implementer)` かつ bite-evidence は loopIntermediateSteps 非該当なので
`newEpisode=true` となり **回復サイクル毎に verification 予算がリセット**され、exhaustion が
永久に発火しない(無限ループ)。`verificationFailedLast` は「最新 verification が failed」= 回復中
のみ真で、初回(verification 未実行)・conformance 再入(直近 verification は passed)では偽なので、
それらは従来通り bite-evidence を通す。

**副作用の相殺(初回の off-by-one)**: implementer は creator 実行時も `isFixer=true` となり
`enterFixerStep(implementer)` でカウンタが 1 になるが、STANDARD 非 exempt 初回は
`implementer → bite-evidence → verification` を通り、bite-evidence→verification の `newEpisode=true`
リセットがこの +1 を打ち消す。結果、非 exempt STANDARD の exhaustion 回数は build-fixer 時代と
bit 一致する。exempt(chore 相当)/ FAST は bite-evidence が無いため +1 が残り、回復試行が
実質 1 回少なくなるが、**歯は発火し続ける**(回復不能検知の目的は達成)。exact 回数は要件でないため許容
(Risk R1 参照)。

**Alternatives considered**:

- *bite-evidence を loopIntermediateSteps に追加* — 却下寄り。1 行で spurious reset は消えるが、
  回復サイクル毎に bite-evidence(CLI gate)が再実行され、`failed → escalate` という **新しい
  escalation 経路とコスト**が回復ループに入る。build-fixer の密ループ意味論から乖離する。D2 は
  既存 `isTestGenExempt` と同じ「gate バイパス」パターンの再利用で、回復意味論を build-fixer と等価に保つ。

### D3: implementer の再入 message と session 継続(制約を持ち込まない)

- `verificationFailedLast(state)` が真のとき、implementer.buildMessage は回復用 message を返す:
  「verification(build/typecheck/lint/test)が失敗した。canon(test-cases.md / spec)と整合するよう
  実装・テストを直して失敗を解消せよ」+ 失敗 command と出力の `## Verification Failures` セクション。
  **機械的修正限定・設計判断禁止・範囲限定の文言は含めない**(implementer の通常権限で作業)。
- 失敗文脈は implementer に `enrichContext`(build-fixer から移設)を追加して verification-result.md を
  best-effort 先読みし `dynamicContext.verificationContent` に載せ、`buildFailureSection`
  (build-fixer から移設)で展開する。ファイル不在時は無害(初回・conformance 再入では未使用)。
- session 継続: step-context-builder の `resumeSessionId` 算出を拡張し、
  **implementer かつ `verificationFailedLast` のとき** `getPreviousSessionId(state, IMPLEMENTER)` を渡す。
  前回 sessionId が null/不在なら `undefined`(fresh)に倒れる — これが「継続元 session が無い場合は
  fresh に fallback、エラーにしない」の実装(build-fixer の継続機構と同じ null-合体パターン)。
  resume 時は前回文脈が session に残るため message は短縮版(失敗セクションのみ)、fresh fallback 時は
  `buildImplementerInitialMessage` ベース(branch 文脈 + tasks/spec 案内)に失敗セクションを付す。

**Rationale**: 「制約撤去は権威解体の一環」(architect 評価)。直すのが実装者本人なら設計判断は
本人の責務内で、機械的修正制約は問題解決能力の制限にしかならない。守るべき境界(canon を勝手に
変えない・scope 外を触らない)は既存の write-scope 機構(GUARDED_WRITE_STEPS に implementer は既存)
が担うため、実装権限のまま再入して安全。

**Alternatives considered**:

- *AgentStep に `resumeSessionId?()` フックを新設* — より疎結合だが Step interface を拡張する。
  step-context-builder には既に `FIXER_STEP_NAMES` による step 固有分岐が同一箇所にあり、
  そこへ implementer 条件を足すのが最小差分。定数 `STEP_NAMES.IMPLEMENTER` を使い文字列 literal を
  避けるため hardcode-guard(executor/executor-helpers のみ走査)にも抵触しない。
- *conformance→implementer も継続にする* — 却下(スコープ外)。`verificationFailedLast` gate により
  conformance 再入(直近 verification=passed)は従来通り fresh のまま。

### D4: build-fixer step の削除と後方互換

- **削除**: `src/core/step/build-fixer.ts`、`src/prompts/build-fixer-system.ts`、
  `AGENT_STEP_NAMES`/`AgentStepName`/`STEP_NAMES.BUILD_FIXER` の build-fixer、registry の step 登録と
  role、`IMPL_CODE_MUTATOR_STEPS`/`FIXER_STEP_NAMES`/`GUARDED_WRITE_STEPS` の build-fixer、
  doctor 3 チェックの必須 agent、managed.ts / config-effective.ts の登録。`--from build-fixer` 候補は
  `AGENT_STEP_NAMES` から build-fixer を消すことで自動的に消える。
- **互換(読み込み・fold)**: `StepName = string` / passthrough により、build-fixer 実行歴は
  projection/fold でそのまま保持され無視される(コード変更不要、テストで固定)。
- **互換(resume)**: resolve-step.ts に legacy alias `{"build-fixer": IMPLEMENTER}` を追加し、
  `from` と `resumePoint.step` に適用する。build-fixer に halt した旧 job の復帰点、および
  `--from build-fixer` を implementer に写す(build-fixer の後継が implementer である D1 と整合)。
  既存 `mapMemberToCoordinator` の別名解決と同じ場所・同じパターン。

**Rationale**: resumePoint 経路は allowed 検証をしないため、alias 無しでは build-fixer 復帰点が
"Step not found" になる。alias は最小の写像で「過去 step 名を無視し生きた後継へ流す」互換を成立させる。

**互換の既知の限界(許容)**: `IMPL_CODE_MUTATOR_STEPS` から build-fixer を消すため、
「build-fixer が最後のコード変更者」の legacy state では `codeChangedSinceLastVerification` が
当該変更を検出しない。このシナリオは実運用上発生困難であり(build-fixer は verification 成功後に
のみ次へ進み、halt した job は alias により implementer が代わりに実行されて mutator 履歴を
上書きする)、許容する。

## Risks / Trade-offs

- **[R1] chore/FAST 経路で回復試行が 1 回少なくなる(off-by-one)** — implementer の creator 実行が
  fixer カウンタを 1 進め、bite-evidence の無い経路ではそれが相殺されないため。→ Mitigation:
  歯(RETRIES_EXHAUSTED)は発火し続けるので回復不能検知の目的は達成。exact 回数は受け入れ基準に
  無い。exhaustion テストは「発火すること」を固定し回数に依存させない。
- **[R2] resume 復帰時に SDK session が実際には再開不能でも sessionId は残る** — → Mitigation:
  検出可能な「sessionId が null/不在」は fresh に倒す(要件の fallback)。runtime で resume が失敗する
  ケースは build-fixer と同じ既存挙動範囲で、本変更で新たな回帰は生じない(スコープ外の managed 継続
  とは切り分け)。
- **[R3] enrichContext が全 implementer 実行で verification-result.md を読む** — → Mitigation:
  best-effort(try/catch)で不在時は no-op。使用は `verificationFailedLast` 真時のみで、
  conformance 再入時の stale passed 結果は注入されない。
- **[R4] テスト更新の網羅漏れで「列挙外が非 green」になる** — → Mitigation: 本 design で更新対象を
  全列挙(下表)。実装後 `typecheck && test` を green にすることで網羅を確定する。

## Test 更新対象の全列挙(受け入れ基準: 遷移表・build-fixer 関連テストの更新対象を全列挙し根拠明示)

凡例: **DEL**=ファイル削除 / **UPD**=更新 / **ADD**=新規 / **NC**=無変更(green 維持、根拠付き)

### A. 削除シンボル import による compile 破綻 → UPD/DEL

| ファイル | 区分 | 根拠 |
|---|---|---|
| `tests/prompts/build-fixer-system.test.ts` | DEL | 削除 prompt 専用テスト |
| `src/prompts/__tests__/coverage-gate-prohibition.test.ts` | DEL | `BUILD_FIXER_SYSTEM_PROMPT` 専用テスト |
| `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` | UPD | `BUILD_FIXER_SYSTEM_PROMPT` import と creator/fixer prompt 一覧・TC-006 行を除去 |
| `src/prompts/__tests__/fragment-coverage.test.ts` | UPD | 同 prompt import と一覧行を除去 |
| `src/prompts/__tests__/artifact-hygiene-discipline.test.ts` | UPD | 同 prompt import と TC-040 build-fixer describe を除去 |
| `tests/unit/prompts/fragment-coverage.test.ts` | UPD | `BUILD_FIXER` 行 + import 除去 |
| `tests/unit/prompts/common-context-catch.test.ts` | UPD | `BUILD_FIXER` 行 + import 除去 |
| `tests/unit/rules-md.test.ts` | UPD | `["BUILD_FIXER", ...]` 行 + import 除去 |
| `tests/anthropic-step-model-refresh.test.ts` | UPD | `BuildFixerStep` import と関連 assertion 除去 |

### B. 遷移 / ループ予算 / exhaustion / 再入の assertion → UPD

| ファイル | 区分 | 根拠 |
|---|---|---|
| `tests/pipeline-integration.test.ts` | UPD | TC-064(verification/build-fixer pair)・TC-065(`resumePoint.step="build-fixer"`, VERIFICATION_RETRIES_EXHAUSTED)を implementer 再入へ。`resumePoint.step` 期待は `implementer`。`agents` fixture の build-fixer 行除去 |
| `tests/unit/core/pipeline/pipeline.reverification.test.ts` | UPD | TC-003/TC-004/exhaustion が build-fixer を fixer/mutator として使用。`makeStandardSteps` から build-fixer を除き implementer 再入で再検証・回復を表現 |
| `tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts` | UPD | 内容は revision-binding 収束(TC-013/TC-017)。mutator を build-fixer→implementer に差し替え(`IMPL_CODE_MUTATOR_STEPS` 変更に追随)。必要なら再命名 |
| `tests/error-path-integration.test.ts` | UPD | TC-T07「部分失敗 → build-fixer runs」を「→ implementer runs」へ。`agents` fixture 除去 |
| `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` | UPD | `:115` の `stepNames toContain BUILD_FIXER` を除去(descriptor から消える) |
| `src/core/step/__tests__/fixer-reviewer.test.ts` | UPD | build-fixer の source label テスト(`:96-103`)を除去 |
| `tests/core/step/fixer-helpers.test.ts` | UPD | `FIXER_STEP_NAMES.has("build-fixer")`(`:40-41`)・build-fixer source label(`:228-230`)を除去 |
| `tests/store/event-journal.test.ts` | UPD/ADD | build-fixer 実行歴を含む events の fold が壊れないことを固定(互換 AC)。既存はコメント言及のみ、fold 検証を追記 |

### C. doctor / registry / agent 定義の列挙 → UPD

| ファイル | 区分 | 根拠 |
|---|---|---|
| `tests/core/doctor/checks/agents/agents-registered.test.ts` | UPD | 必須 agent から build-fixer を除去 |
| `tests/core/doctor/checks/agents/definition-drift.test.ts` | UPD | 期待 agent 一覧から build-fixer を除去 |
| `tests/core/doctor/mock-context.ts` | UPD | mock config の build-fixer agent を除去 |
| `tests/unit/agent/registry.test.ts` | UPD | build-fixer agent の期待を除去 |
| `tests/unit/core/command/rules-new.test.ts` | UPD | `:272-278` が `"build-fixer"` を有効 step 前提。AGENT_STEP_NAMES から消えるため live step(例: `code-fixer`)へ差し替え |
| `tests/reviewer-activation-e2e.test.ts` / `tests/multi-layer-defense.test.ts` / `tests/custom-reviewers-e2e.test.ts` | UPD | `agents: {"build-fixer": ...}` fixture 行を除去(agent 削除に追随) |
| `tests/adapter/managed-agent/agent-runner.test.ts` / `agent-runner-verbose-log.test.ts` | UPD(要確認) | build-fixer を sample step/agent に使う箇所があれば live step へ差し替え |

### D. 新規テスト(受け入れ基準を固定) → ADD

| 対象 | 根拠(AC) |
|---|---|
| `VERIFICATION failed → IMPLEMENTER`(STANDARD / FAST 両遷移表) | verification 失敗時に implementer へ遷移(通常・chore 両経路) |
| implementer 再入 = 直前 session 継続 + 失敗 command/出力が message に含まれる | 再入が継続 session で起動し失敗内容が message に入る |
| 前回 sessionId 不在 → resumeSessionId undefined、message は失敗内容を含み error にならない | 継続元 session 無しの fresh fallback |
| 持続失敗で `VERIFICATION_RETRIES_EXHAUSTED` が発火(回数非依存で「発火」を固定) | ループ上限が再入方式でも機能 |
| build-fixer 実行歴を含む state の load/fold が壊れない + `resolveResumeStep("build-fixer") → implementer` | 既存 state 読み込みと resume が壊れない |
| 回復再入で bite-evidence をバイパスして verification 直帰(D2 の歯保証) | 予算が積み上がることの回帰防止 |

### E. build-fixer に言及するが無変更で green → NC

| ファイル | 根拠 |
|---|---|
| `src/core/lifecycle/__tests__/exit-guard.test.ts` | `step:"build-fixer"` は resumePoint の例示 string。削除シンボル非依存で exit-guard 挙動に無関係 → green |
| `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` | 自己完結の ad-hoc 遷移表(STANDARD 非依存)。build-fixer は literal → green |
| `tests/unit/core/command/usage-show-metrics.test.ts` | `stepName:"build-fixer"` は metric サンプルデータ → green |
| `tests/templates/step-output-templates.test.ts` | `"build-fixer"` を writeOutputTemplates に渡すと default→`[]`。switch case 非該当で従来通り → green |
| `tests/grep-no-step-name-hardcode.test.ts` | build-fixer は allowlist/regex の一部。走査対象(executor/helpers)に build-fixer literal は残らない → green |
| `tests/unit/core/pipeline/pipeline-roles.test.ts` / `pipeline.conformance-routing.test.ts` | build-fixer は自己完結 fixture の dead entry(routing 対象外)。削除シンボル非依存 → green(整理は任意) |
| `tests/helpers/pipeline-mock-client.ts` | producer 一覧コメントのみ → green |

> 実装後 `typecheck && test` の green を以て、上表の網羅と「列挙外は無変更」を確定する。

## Migration Plan

- コード変更のみのデプロイ。DB/ファイル形式の migration は無い。
- 既存 job state は無変換で互換(build-fixer 実行歴は保持・無視、resume は alias で implementer へ)。
- Rollback: 本変更の revert で旧 build-fixer 経路に戻る。state 形式は前方後方互換なので安全。

## Open Questions

- なし(request の architect 評価済み設計判断で分岐は解決済み)。ADR 化に値する判断(build-fixer 廃止と
  継続再入への置換)を含むため adr-gen 対象。具体 path は adr-gen に委ねる。
