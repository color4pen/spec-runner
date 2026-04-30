# Module Architect Decisions — implementer-verify-buildfix

`src/core/verification/` ディレクトリを新設し runner.ts / phases.ts / (任意) result-writer.ts を配置する :: 機能単位 subdirectory（agent / pipeline / port / event）の既存パターンに合わせ cohesion を保つため
`src/core/step/verification.ts` は Step interface adapter として薄く保ち shell 実行ロジックを `src/core/verification/runner.ts` に分離する :: SRP（Step interface 適合 vs shell 実行）の責務を一致させ、runner を CI 等から再利用可能にするため
`buildGitPushInstruction(branch: string): string` を `src/prompts/git-push-instruction.ts` に切り出す :: spec-fixer / implementer / build-fixer の 3 step で同型の commit+push 指示が重複するため（reusability）
`NULL_PARSE_RESULT` const を `src/core/step/types.ts` に追加し agent-less verdict step 4 箇所（propose / spec-fixer / implementer / build-fixer）で共有する :: 同一 boilerplate が 4 ファイルで複製されるため（reusability + readability）
AgentDefinition の factory 化は行わず Step ファイル内 const として co-locate を維持する :: Step の自己完結性（Pattern #2）と factory による cohesion 低下を比較し、co-location を優先するため
`AgentStepName = Exclude<StepName, "verification">` を `src/state/schema.ts` に追加する :: AgentRegistry / config schema が agent-less step を型レベルで除外できるようにし、design D8 の filter を型で強制するため
`step.kind === "agent" | "cli"` discriminator 分岐は構造的分岐とし step 名 hardcode 分岐は禁止する :: PR #31 の executor-step 非依存原則を維持するため
tasks.md 8.3 の「step 名 hardcode 分岐 grep CI test」を必須とする :: D1 の discriminator が将来 anti-pattern 化することを構造的に防ぐため
verification の verdict 規約は `^## Verdict: (passed|failed)$` 単一 regex に統一する :: spec-review の verdict parser と同形にし parseResult の責務を最小化するため（SRP）
verification phase 名 → script 名 mapping は `src/core/verification/phases.ts` に config 化する :: runner.ts が実行責務と設定責務を兼ねないようにするため（SRP）
`Pipeline.handleExhausted` の loop name / error code mapping を transition table 由来の lookup に汎用化する :: SPEC_REVIEW_RETRIES_EXHAUSTED の hardcode を残すと verification ↔ build-fixer cycle に同形の hardcode が増えるため（coupling）
`runProposeStyleStep` / `runPollingStyleStep` の `step.toolHandlers` による暗黙分岐は本 PR ではそのまま残す :: D1 discriminator 導入と同時に変更すると変更範囲が肥大するため、本 PR は kind 分岐の追加のみに絞る（後続 PR で kind ベース統一）
verification の `<user-request>` 包囲テンプレ helper（`wrapUserRequest`）は本 PR では導入しない :: 過抽出による cohesion 低下リスクと implementer 判断委譲の bias 維持を優先するため
verification CLI runner の独立 timeout 設計は本 PR では導入せず後続 request に委ねる :: design Open Question 1 で明示されており、本 PR スコープ外のため
build-fixer の deferred メモ運用は導入せず loop guard exhaustion = escalation で吸収する :: design Open Question 3 の方針に準拠（spec-fixer の deferred は spec 修正不能の表明だが build-fixer は verification 結果が次 iteration で判定するため不要）
