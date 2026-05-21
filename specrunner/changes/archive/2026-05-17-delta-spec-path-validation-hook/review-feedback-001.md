# Code Review Feedback — delta-spec-path-validation-hook (iter 1)

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-17

## Summary

実装は設計に高い忠実度で従っており、validator / CliStep / AgentStep / 共通定数 / 遷移表更新 / counter 独立化 / unit + integration tests が一通り揃っている。`bun run test` は 1977 件 PASS、`bun run typecheck` も通っており regression は確認されない。

ただし step-execution-architecture spec の ADDED Requirement「DeltaSpecValidationStep and DeltaSpecFixerStep are excluded from AgentStepName」が未充足のため needs-fix とする。`src/state/schema.ts:22` の `AgentStepName` Exclude 句に `STEP_NAMES.DELTA_SPEC_VALIDATION` を追加すれば解消できる軽微な漏れだが、型レベルで `config.agents` 誤登録を防ぐ「派生 Exclude 句更新」の規律 (review-lessons でも繰り返し指摘されている既知パターン) に該当するため major 扱い。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | major | spec-conformance | src/state/schema.ts:22 | step-execution-architecture spec の ADDED Requirement「`AgentStepName` SHALL exclude `"delta-spec-validation"`」が未実装。現状 `AgentStepName = Exclude<StepName, VERIFICATION \| PR_CREATE>` のみで、`"delta-spec-validation"` (CliStep) が `AgentStepName` に含まれてしまう。同じ Requirement の Scenario「`"delta-spec-validation"` is NOT assignable to `AgentStepName`」も担保されていない。 | `AgentStepName` の Exclude 句に `\| typeof STEP_NAMES.DELTA_SPEC_VALIDATION` を追加。コメントも `(verification, pr-create, delta-spec-validation)` に更新。型レベル assertion テスト (例: `const _check: AgentStepName extends "delta-spec-validation" ? never : true = true` 相当) を追加すると Scenario が完全に検証される。 |
| 2 | minor | code-quality | src/core/pipeline/types.ts:48 | `LOOP_ERROR_CODES[DELTA_SPEC_VALIDATION].hint` が `(_nnn) => ...` と引数を握り潰している。他 entry (`SPEC_REVIEW` / `VERIFICATION` / `CODE_REVIEW`) は iteration suffix を文字列に埋め込んでいるが、delta-spec-validation の result file は `delta-spec-validation-result.md` (iter 番号なし) のため意図的。コメントで「result file does not include iteration suffix because it is overwritten each iteration」と明示しておくと、後の reviewer が `_nnn` を typo と疑わない。 | hint 行の手前にコメントを 1 行追加するだけで十分。 |
| 3 | minor | test-coverage | tests/unit/core/spec/delta-spec-validator.test.ts | test-cases.md TC-V-10 (`delta-spec.md` + `delta-spec/cap.md` の 2 件同時違反) が独立 describe として存在しない (TC-V-08 の 2 件目で legacy-flat-file は確認するが、複数 reason の同時報告は明示テストなし)。validator の挙動上は確実に動くが、must 指定の TC が抜けている。 | 既存 TC-V-07 を拡張するか、新たに「multiple violations are reported in a single result」TC を追加。実装変更は不要なので 1 テスト追加で対応可。 |
| 4 | minor | test-coverage | tests/pipeline-integration.test.ts | test-cases.md TC-P-06「観測例 (`managed-reset-status-stale-guard` 相当) — `## ADDED` (suffix 無し) + `delta-spec/<cap>.md` の双方の違反を 1 cycle で修正して spec-review まで完走する E2E」が独立 TC として実装されていない。TC-DSV-INT-02 が legacy-flat-file 1 件のシナリオは網羅しているが、observed regression の reproduction としては不十分。 | TC-DSV-INT-02 と同形だが mock の violations に `legacy-flat-dir` と `missing-requirements-section` の 2 件を含める TC を追加。 |
| 5 | nit | consistency | src/core/step/delta-spec-fixer.ts:64-79 | 継続 prompt が delta-spec-fixer 独自関数 `buildDeltaSpecFixerContinuationMessage` を持つ。spec-fixer / build-fixer / code-fixer は `fixer-helpers.ts` の `buildContinuationMessage` を共有しているが、delta-spec-fixer は source 種別を「verification / reviewer」二択にできない（実体は delta-spec-validation 結果）ため独立化は妥当な判断。ただしコメントで「共有 helper を使えない理由 = validation source は reviewer でも verification でもない」と書いておくと future reviewer が DRY violation と誤解しない。 | `buildDeltaSpecFixerContinuationMessage` の JSDoc に shared helper を使わない理由を 1 行追加するだけ。 |
| 6 | nit | doc-drift | src/core/step/delta-spec-fixer.ts:88 | コメント `Design D4: completionVerdict="approved" → DeltaSpecFixerStep → DeltaSpecValidationStep (loop). counter is independent from spec-review loop (see loopFixerPairs in run.ts).` の `loopFixerPairs` 参照は実態と乖離している。実際 counter 独立化を担保しているのは `Pipeline.loopNames` の expansion であり、`loopFixerPairs` は #269 のための placeholder (eslint-disable された未使用 field)。実装 D3 と一致するコメントに修正したほうが正確。 | `(see loopNames in run.ts)` または `(via per-loop counter in Pipeline.loopIters)` に変更。 |

## Positive

- **Design fidelity**: D1-D9 が実装に 1:1 で写像されている。VerificationStep + BuildFixerStep pair と同型の構造で、Step as data / Executor as behavior の原則 (project.md) に整合。
- **Validator の DI**: `DeltaSpecValidatorFs = { readdir, readFile }` が FinishFs と subset 整合し、unit test で純粋な mock が成立 (実 fs アクセスなし)。
- **共通定数 (DELTA_SPEC_FORMAT_RULES)**: design-system / spec-fixer-system 双方で template literal 補間しており、prompt 文言の単一 source 化に成功。スナップショット比較テスト (TC-PR-04) 相当が verification phase test pass で間接的に担保されている。
- **遷移表完全性**: STANDARD_TRANSITIONS が 28 行に拡張され、design → DSV / spec-fixer → DSV / DSV ↔ delta-spec-fixer の全 5 行が追加されている。`tests/unit/core/pipeline/pipeline.transitions.test.ts` の TC-030 で行数 assertion を追加しており、追加忘れを catch する regression guard が機能している。
- **Counter 独立性検証**: TC-DSV-INT-04 が delta-spec-validation 3 回 + spec-review 2 回を maxRetries:4 で並走させ、独立 counter であることを定量的に検証している。
- **二重防衛維持**: `src/core/finish/spec-merge.ts:474` の semantic empty delta check が削除されていない (TC-R-01 相当)。
- **fixer-helpers の拡張**: `FIXER_STEP_NAMES` に `DELTA_SPEC_FIXER` が追加されており、将来 fixer 共通処理が増えたとき自動的に対象になる。
- **prompt injection 防御**: delta-spec-fixer の initial / continuation message が `<user-request>` タグで包まれており、SPEC_FIXER_SYSTEM_PROMPT のセキュリティ規約と整合。

## Security

- validator は filesystem read-only (path pattern + content regex のみ)。書き込みは result file のみで、path は cwd + slug derived のため directory traversal risk なし。
- delta-spec-fixer の agent は spec-fixer と同一 toolset (`AGENT_TOOLSET_TYPE`) / 同一 system prompt のため、新規攻撃面なし。
- 新規ハードコード secret / 認証バイパス / プロトタイプ汚染なし。

## Scenario Coverage (test-cases.md vs実装)

| Category | Must TC | 実装 | 備考 |
|----------|---------|------|------|
| validator | TC-V-01〜TC-V-10 (10) | 8 件直接 + 2 件 (additional describe) | TC-V-10 (複数 reason 同時) が独立 describe としては未実装 (finding #3) |
| validator (should) | TC-V-11〜TC-V-13 (3) | TC-V-11/V-12 該当する describe あり、TC-V-13 は makeFsMock 経由で全 TC が DI を行使 | 実質充足 |
| step-validation | TC-S1-01〜TC-S1-04 (4 must) | TC-DSV-01〜TC-DSV-03 で 4 件カバー | 充足 |
| step-fixer | TC-S2-01〜TC-S2-03 (3 must) | TC-DSF-01〜TC-DSF-03 で 4+ 件カバー | 充足。TC-S2-04/05 (should) も「`maxTurns`/`requiresCommit`」「継続 prompt 短縮」テストで対応 |
| pipeline | TC-P-01〜TC-P-06 (6 must) | TC-DSV-INT-01〜TC-DSV-INT-04 (4 件) | TC-P-03 (spec-fixer → DSV 経路) と TC-P-06 (managed-reset 観測例) が独立 TC 未実装 (finding #4) |
| prompt | TC-PR-01〜TC-PR-03 (3 must) | import 由来でコンパイル時に担保 | 実装側で literal 重複なし確認済み |
| constants | TC-C-01, TC-C-02 (2 must) | STEP_NAMES 参照と LOOP_ERROR_CODES エントリで充足 | |
| regression | TC-R-01〜TC-R-03 (3 must) | spec-merge:474 保持、bun run test pass、typecheck pass | 充足 |
| paths-helper | TC-H-01 (1 must) | paths.ts:106 で定義、複数テストで使用 | 充足 |

must TC 27 件中 25 件が直接 or 間接的に充足。残る 2 件 (TC-V-10 / TC-P-06) は finding #3 / #4 で指摘。

## Conclusion

実装は設計通り高品質で、新パターン (CliStep + AgentStep pair の独立 loop) が既存基盤に違和感なく統合されている。typecheck / test / build いずれも PASS で regression なし。

ただし、step-execution-architecture spec で ADDED された「AgentStepName excludes delta-spec-validation」Requirement が schema.ts に未反映のため、spec authority と実装の整合が崩れている。これは review-lessons でも繰り返し指摘されている「type union 拡張時の派生 Exclude 句更新」パターンの再発事例。Exclude 句に 1 リテラル追加するだけの最小修正で needs-fix を解消できる。

finding #2-#6 はいずれも optional だが、特に finding #3 / #4 は test-cases.md の must TC を直接欠いているため可能なら同 PR で対応すると completeness が高い。
