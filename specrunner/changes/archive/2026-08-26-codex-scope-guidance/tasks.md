# Tasks: Codex provider scope discipline guidance

実装順序は T-01 → T-06。T-01/T-02 が実装、T-03〜T-05 がテスト、T-06 が最終検証。

## T-01: guidance 定数モジュールを Codex adapter に追加する

- [x] `src/adapter/codex/scope-guidance.ts` を新規作成する（既存 `src/adapter/codex/completion-report-prompt.ts` と同じ「小さな prompt 定数モジュール」様式に揃える）
- [x] module 冒頭の JSDoc に「Codex provider 実行時のみ適用される provider-level scope discipline guidance であること」「design D1/D3/D7 由来であること」「Claude / managed adapter から参照してはならないこと」を書く
- [x] `export const CODEX_SCOPE_GUIDANCE: string` を定義し、値を以下と一字一句同じ文字列にする（先頭・末尾に余分な改行を付けない）:

```text
SpecRunner execution guidance:

- Do not invent requirements beyond the supplied request/spec/reviewer criteria.
- Prioritize issues that materially affect correctness or normal supported execution.
- Do not promote merely theoretical, extremely unlikely, or speculative edge cases to blocking findings.
- A finding must explain the concrete user/runtime impact that justifies changing the implementation.
- If an issue is technically possible but does not justify blocking completion, report it as an observation or omit it.
- Do not broaden the scope in order to make the implementation more defensive or general.
```

- [x] このモジュールには定数 1 つだけを置く（config 読み取り・step 判定・provider 判定のロジックを入れない）

**Acceptance Criteria**:
- `src/adapter/codex/scope-guidance.ts` が存在し、`CODEX_SCOPE_GUIDANCE` を export している
- 定数の値が上記 6 行（見出し行 + 空行 + 6 bullet）と完全一致する
- 当該ファイルが他モジュールを import していない（純粋な定数モジュール）
- `bun run typecheck` が通る

## T-02: Codex adapter の main-turn prompt に guidance を注入する

- [x] `src/adapter/codex/agent-runner.ts` で `CODEX_SCOPE_GUIDANCE` を `./scope-guidance.js` から import する
- [x] `promptRulesSection` の定義付近に `const scopeGuidanceSection = \`\n\n${CODEX_SCOPE_GUIDANCE}\`;` 相当（常に非空）を追加する
- [x] `fullPrompt` の組み立てを `baseFullPrompt` → `promptRulesSection` → `scopeGuidanceSection` → （`reportTool` がある場合のみ）`\n\n${buildMainTurnCompletionInstruction()}` の順に変更する（現在 407-431 行付近の三項式 2 分岐の双方に guidance が入ること）
- [x] 挿入位置の意図（design D2: completion 指示を終端に保つ）を 1〜2 行のコメントで残す
- [x] follow-up 経路（`buildCompletionRetryPrompt` / `ctx.policy.postWorkPrompts` / `outputVerification.buildPrompt`）には **一切手を入れない**（design D4）
- [x] `src/adapter/shared/prompt-builder.ts`、`src/adapter/claude-code/**`、`src/adapter/managed-agent/**`、`src/prompts/**`、`src/core/**` を変更しない
- [x] `CODEX_SCOPE_GUIDANCE` を `agent-runner.ts` から re-export しない（テストは `../scope-guidance.js` を直接 import する）

**Acceptance Criteria**:
- main work turn の prompt に guidance が常に含まれる（`reportTool` の有無・`promptRules` の有無・resume の有無を問わない）
- `reportTool` がある場合、prompt 内で guidance が completion 指示より前に現れる
- resume 経路（`resumeThread` および resume 失敗時の fresh-thread fallback）でも同じ `fullPrompt` が使われるため guidance が含まれる
- follow-up / retry / repair prompt の文字列生成コードに diff がない
- `git diff --name-only` に `src/adapter/shared/`, `src/adapter/claude-code/`, `src/adapter/managed-agent/`, `src/prompts/`, `src/core/` 配下のファイルが 1 つも現れない
- `bun run typecheck` / `bun run lint` が通る

## T-03: guidance 注入の unit test を追加する

- [x] `src/adapter/codex/__tests__/scope-guidance-injection.test.ts` を新規作成する
- [x] 既存 `src/adapter/codex/__tests__/prompt-rules-injection.test.ts` の mock 様式を踏襲する（`makeCapturingMockThread` / `makeMockCodexInstance` / `makeJobState` / `makeConfig` / `mkdtemp` した空の `testCwd`。実 fs や実 SDK を触らない）
- [x] 期待文面は `../scope-guidance.js` の `CODEX_SCOPE_GUIDANCE` を import して使う（literal を再掲しない）
- [x] test: `reportTool` あり・`promptRules` あり・resume あり の context で、main turn prompt が `CODEX_SCOPE_GUIDANCE` を含む
- [x] test: 同 context で index 比較により `promptRules` の位置 < guidance の位置 < `buildMainTurnCompletionInstruction()` の位置 が成立する
- [x] test: `reportTool` なし・`promptRules` なしの context でも guidance を含み、`COMPLETION_REPORT_MEANS` は含まない
- [x] test: step 名を変えた 2 ケース（reviewer 相当の step 名と producer 相当の step 名、例: `custom-reviewer` と `implementer`）で、同一の guidance 文字列が注入される（step による出し分けがないことの固定）
- [x] test: `session.resumeSessionId` + `session.resumePrompt` を与えた resume 経路でも guidance が含まれる
- [x] test: `reportTool` ありで main turn が JSON でない応答を返すケースを組み、2 回目の呼び出し prompt（completion retry）が `CODEX_SCOPE_GUIDANCE` を含まないこと（design D4）
- [x] 各 test の見出しコメントに対応する spec Requirement 名を書く

**Acceptance Criteria**:
- 新規テストファイルが上記 6 ケースを含み、`bun run test` で green
- guidance の期待値がテスト内で literal 再掲されていない（定数 import のみ）
- T-02 の注入を取り除くとこのテストが赤くなる（注入に噛んでいること）

## T-04: 既存の byte-identity ベースライン（TC-015）を guidance 込みへ更新する

- [x] `src/adapter/codex/__tests__/resume-prompt-injection.test.ts:163` の期待式を `${baseMessage}\n\n${additionalInstructions}\n\n${CODEX_SCOPE_GUIDANCE}` に更新する（`toBe` の厳密一致を維持。`toContain` へ緩めない、テストを削除しない）
- [x] `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts:171` の期待式を同様に更新する
- [x] 両ファイルで `CODEX_SCOPE_GUIDANCE` を `../scope-guidance.js` から import する
- [x] 当該 test の説明コメント（TC-015 の意図）に「guidance section は仕様として常に付くため baseline に含む。それ以外の section が付かないことを引き続き厳密一致で守る」旨を追記する
- [x] `src/adapter/codex/__tests__/touched-files-injection.test.ts:176`（Codex prompt 同士の比較）と `prompt-rules-injection.test.ts`（順序不等式）は変更しない — 変更が必要になった場合は注入位置が design D2 とずれている疑いとして見直す

**Acceptance Criteria**:
- 更新後も両テストが `toBe`（厳密一致）で assertion している
- `bun run test src/adapter/codex` 相当が green
- `touched-files-injection.test.ts` と `prompt-rules-injection.test.ts` に diff がない

## T-05: provider 分離の guard test を追加する

- [x] `tests/adapter/codex/scope-guidance-provider-isolation.test.ts` を新規作成する（既存の grep 型 guard test、例: `tests/dead-guidance.test.ts` の走査ヘルパ様式を踏襲）
- [x] test: `src/` 配下の非テスト `.ts` ファイルを再帰走査し、`src/adapter/codex/` 配下以外のファイルが `CODEX_SCOPE_GUIDANCE` / `scope-guidance` / guidance 見出し行 `SpecRunner execution guidance:` のいずれも含まないことを検証する（違反時は file:line を列挙して失敗させる）
- [x] test (TC-012): `src/adapter/codex/scope-guidance.ts` ファイルを読み込み、import STATEMENT（行頭 `import`/`require` で始まる行）が存在しないことをファイル走査で検証する（コメント内の語句は除外、違反時は行番号と内容を列挙して失敗させる）。これにより「pure constant module with no imports」不変条件を automated assertion で固定する
- [x] test: `buildAdditionalInstructions` / `buildResumeSection`（`src/adapter/shared/prompt-builder.ts`）の戻り値に guidance が含まれないことを、代表的な ctx で検証する
- [x] test: 新規 provider config protocol が生えていないことの固定として、`src/core/port/agent-runner.ts` の policy 型に guidance / provider 関連フィールドが追加されていないことをソース走査で確認する（`scope-guidance` / `providerGuidance` の文字列不在で足りる）

**Acceptance Criteria**:
- guard test が green で、`src/adapter/claude-code/agent-runner.ts` に guidance 文字列を仮に足すと赤くなる性質を持つ
- TC-012 の import 不在アサーションが green で、`scope-guidance.ts` に `import` 行を仮に追加すると赤くなる性質を持つ
- guard test が実 SDK・network・実 job state に依存しない
- `bun run test` 全体が green

## T-06: 全体検証と禁止領域の diff 確認

- [x] `bun run typecheck` を実行して green を確認する
- [x] `bun run test` を実行して green を確認する (839 test files, 12540 tests passed, 0 failed)
- [x] `bun run lint` を実行して green を確認する
- [x] `git diff --name-only main...HEAD` を確認し、変更ファイルが次の集合に収まっていることを確認する: `src/adapter/codex/scope-guidance.ts`, `src/adapter/codex/agent-runner.ts`, `src/adapter/codex/__tests__/scope-guidance-injection.test.ts`, `src/adapter/codex/__tests__/resume-prompt-injection.test.ts`, `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts`, `tests/adapter/codex/scope-guidance-provider-isolation.test.ts`, `specrunner/changes/codex-scope-guidance/**`
- [x] 特に `src/core/pipeline/**`（`pipeline.ts` / `convergence-budget.ts` を含む）、`specrunner/reviewers/**`、`.specrunner/config.json` に diff が無いことを確認する
- [x] `tasks.md` の checkbox を実施済みに更新する

**Acceptance Criteria**:
- typecheck / test / lint がすべて green
- 変更ファイル一覧が上記の許可集合に収まっている
- `src/core/pipeline/`, `specrunner/reviewers/`, `.specrunner/config.json` に diff が 0 件
- request の受け入れ基準 5 項目すべてに対応する検証結果が揃っている
