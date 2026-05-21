# Code Review Feedback — rules-md-injection — iteration 001

- **verdict**: needs-fix
- **date**: 2026-05-20
- **reviewer**: code-review agent

---

## Summary

`specrunner/rules.md` を source of truth として導入し、worktree setup で change folder へ copy、全 11 agent system prompt の冒頭に identity priming + Read 指示を追加する変更。`fragments.ts` から `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` を削除し、`buildSystemPrompt` は base + fragments の単純 join に簡素化されている。静的 unit test (`tests/unit/rules-md.test.ts`、`common-context-catch.test.ts` の書き換え) で構造的 guard を新設している。全 2446 件のテストは green、typecheck も通過。

設計の核（acquired > given への移行）と実装は一貫しており、test-cases.md の must 47 件のうち静的 prompt / file 内容に関するものは概ね covered。一方で **runtime コピーロジック (T-02)** に対する自動テスト (TC-13 / TC-14 / TC-17 / TC-18 = must 4 件) が一切実装されておらず、ENOENT ガードの動作も静的検証されていない。プロンプト本文に dead reference が 2 箇所残存している点と合わせて、修正後に再レビューが必要。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | testing | tests/unit/core/runtime/local.test.ts, tests/unit/core/runtime/managed.test.ts | test-cases.md の must 4 件 (TC-13 / TC-14 / TC-17 / TC-18) が未実装。`local.ts` / `managed.ts` の `setupWorkspace` における rules.md コピー処理と ENOENT ガードに対する自動テストが存在しない。`Grep rules\.md tests/unit/core/runtime/` が 0 件。手動 dogfood 以外の構造的検証が無いため、ENOENT ガードの regression や git-add 失敗時の non-fatal 挙動が CI で検出できない。 | local.test.ts / managed.test.ts に以下を追加: (a) rules.md が source に存在する場合、change folder にコピーされ git add される (b) rules.md が source に存在しない場合、throw せず warning ログのみで続行する。既存の request.md コピー test と同じ mock 構造 (spawnFn / fs) を流用すれば実装可能。 |
| 2 | HIGH | maintainability | src/prompts/design-system.ts:88, src/prompts/spec-fixer-system.ts:38 | 「詳細ルールは末尾の Delta Spec Format セクション参照」という dead reference が残存している。`DELTA_SPEC_FORMAT` fragment は T-04 で削除済みのため、「末尾セクション」はもはや prompt に append されない。agent が末尾を探しても該当セクションが存在せず、誤誘導となる。design-system.ts の self-review checklist は inline 化されているが、参照文だけが旧構造を指している。 | 両ファイルで参照文を「詳細ルールは `specrunner/changes/<slug>/rules.md` の `delta spec 記法` セクション参照」に書き換える。または参照文ごと削除し、agent が冒頭の Read 指示で rules.md を取得済みであることに依拠する。 |
| 3 | MEDIUM | testing | tests/unit/rules-md.test.ts, tests/unit/prompts/common-context-catch.test.ts | テストアサーションが Vitest 固有の挙動 (`fs.access(...).resolves.toBeUndefined()`) に依存し、Bun の test runner で実行すると `Received: null` で fail する。プロジェクト標準 runner は vitest なので CI は green だが、`bun test` で個別実行する開発者が踏む。 | `.resolves.toBeUndefined()` を `.resolves.not.toThrow()` または `await fs.access(RULES_MD_PATH)` を try/catch せず単に呼ぶ形に書き換える（resolve すれば green の意図はそのまま）。 |
| 4 | MEDIUM | consistency | specrunner/rules.md:15 | rules.md の System Context セクションが「11 step の state machine」と記載しているが、spec-review-result-002.md の Finding（前回 spec-review #5）では「9 agent step + 2 CLI step」または「11 step (うち 2 つは CLI step、agent なし)」と書き直す suggestion が出ていた。現状は「11 step」と書きつつ verification (step 6) と pr-create (step 11) が `(CLI step — agent なし)` と注釈付きで列挙されており、CLI step が混在することは読めるが、`agent` という単語を冒頭の「11 step」だけ読むと誤解する。 | rules.md L15 を「11 step (うち 9 agent step + 2 CLI step) の state machine」に明示するか、step リストの注釈に依存させる旨を冒頭に書く。 |
| 5 | MEDIUM | maintainability | src/core/runtime/local.ts:236-253, src/core/runtime/managed.ts:131-148 | rules.md の source path `specrunner/rules.md` と dest path `changeFolderPath(slug)/rules.md` が 2 ファイルに重複ハードコードされている。将来 rules.md の path を移動すると drift する。spec-review-result-002.md の Finding #6 でも minor として残課題化されている。 | `src/util/paths.ts` に `rulesSourcePath()` / `rulesDestPath(slug)` ヘルパーを追加し、両 runtime で再利用する。`changeFolderPath(slug)` と同じ pattern。 |
| 6 | MEDIUM | maintainability | src/core/runtime/local.ts:235-253, src/core/runtime/managed.ts:130-148 | local.ts / managed.ts の rules.md コピー処理 (about 18 行) がほぼ同一実装でコピペされている。fs.access → fs.cp → git add → warning ログのフローと文言まで重複。同じく request.md の change folder コピー処理も重複しているが、本変更で重複箇所が増えた。 | 共通ヘルパー (例: `copyArtifactToChangeFolder(srcPath, slug, cwd, spawnFn, gitAddLabel)`) に切り出すか、最低限 `copyRulesToChangeFolder()` だけでも util に出す。 |
| 7 | LOW | architecture | specrunner/changes/rules-md-injection/specs/prompt-fragment-registry/spec.md | delta spec 内の Requirement「rules.md の存在と構造的保証」が prompt-fragment-registry capability に追加されているが、本 capability の名前は「fragment registry」であり、rules.md (= prompt fragment ではなく外部 markdown file) の存在保証が同 capability に乗るのは責務がずれている。本変更で fragment 登録の責務範囲が拡張されたとも読めるが、design.md にはその旨の記述がなく、将来別の rules artifact が追加されたときに分割しづらい。 | (a) capability 名を `prompt-disciplines` 等に rename する、(b) 別 capability `pipeline-rules` を新設して rules.md を分離する、(c) 現状維持して design.md に「fragment registry の責務に外部 rules artifact 管理を含む」旨を加筆する、のいずれか。今 PR で対応不要だが ADR / design に記録する。 |
| 8 | LOW | testing | tests/unit/rules-md.test.ts, tests/unit/prompts/common-context-catch.test.ts | 同種の assertion (rules.md 存在 + ADR キーワード + 正規 path + 全 11 prompt の Read 指示) が 2 ファイルに重複している。test-cases.md でも TC-37 〜 TC-46 のうち TC-41 〜 TC-46 が rules-md.test.ts に、TC-37 〜 TC-40 が common-context-catch.test.ts に分かれて重複検証される構造。 | どちらかに集約するか、共通の helper (`assertRulesMdContent`, `assertReadInstructionInAllPrompts`) を切り出す。コストが test 二重実行に出る種類なので将来的に整理推奨。 |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 6 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 7.4

correctness は仕様通りの実装で機能している（typecheck + test green、全 11 agent の prompt 更新も網羅）が、Finding #2 の dead reference が prompt 出力の品質を下げるため -1。testing は静的 prompt 内容の guard が新設された一方で runtime コピーロジック (T-02 の must scenario 4 件) が未テストのため減点。maintainability は重複コードと dead reference の合計で 6。

CRITICAL: 0 件、HIGH: 2 件のため **needs-fix**。HIGH を修正後に再レビューで approved 判定可能な水準。

---

## Scenario Coverage (test-cases.md must scenarios)

test-cases.md には must 40 件が定義されている。

### Covered (35 件)

- rules-md-content (TC-01〜11): tests/unit/rules-md.test.ts + tests/unit/prompts/common-context-catch.test.ts で網羅
- agent-prompt (TC-19〜23): rules-md.test.ts と common-context-catch.test.ts で網羅
- fragments-cleanup (TC-25〜30, TC-32〜33): fragment-coverage.test.ts + 静的 import 確認で網羅
- test-update (TC-34〜46): 各テストファイルの自己検証として網羅
- build (TC-47, TC-48): bun run typecheck + bun run test green を確認済み
- regression (TC-49〜51): rules-md.test.ts の docs/adr/ 不存在 assertion で網羅

### Not Covered (5 件 — Finding #1)

- **TC-13** (local runtime — rules.md が change folder にコピーされる) — must
- **TC-14** (managed runtime — rules.md が change folder にコピーされる) — must
- **TC-17** (local runtime — rules.md 不在時は throw せず warning で続行する) — must
- **TC-18** (managed runtime — rules.md 不在時は throw せず warning で続行する) — must

これら 4 件はいずれも **must 優先度** であり、runtime コピーロジックの中核保証である。

### Should/Could (参考)

- TC-15 (rules.md と request.md が同一 commit) / TC-16 (staging area 確認) — should、未実装。CI dogfood で実態は確認可能だが構造 test は無い。

---

## Improvements over previous iteration

spec-review-result-001.md → 002.md で Finding #1 (HIGH: ENOENT ガード) と Finding #2 (MEDIUM: ## Removed 形式) は解消済み。design.md の Risks に静的 test の限界 (Finding #3) と change folder 上書きリスク (Finding #4) も明記され、設計判断としての受容が記録されている。spec 側の round 1→2 改善は健全。

---

## Notes

- 設計の核 (acquired information vs given) は実装と一貫しており、変更の正当性に異論なし。
- prompt-fragment-registry の delta spec は新規約 (`## Requirements` 単一ヘッダー) に完全準拠。
- `fs.cp` の ENOENT ガード実装 (local.ts:238-253 / managed.ts:133-148) は適切。
- COMMIT_DISCIPLINE と PIPELINE_RULES を残す判断は妥当（前者は振る舞いルール、後者は review 専用 scoring rule で identity priming と独立）。
- 本 review は静的解析と test 結果のみに基づく。実 LLM session で identity priming の効果がどの程度発揮されるかは別途 dogfood 必要。

