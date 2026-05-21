# Code Review Feedback — rules-md-injection — iteration 002

- **verdict**: approved
- **date**: 2026-05-20
- **reviewer**: code-review agent

---

## Summary

iteration 1 で指摘された HIGH 2件（runtime コピーロジックの自動テスト未実装、dead reference）および MEDIUM 4件（Vitest 固有 assertion、step 数表記、helper 抽出、コード重複）はいずれも適切に解消されている。`src/util/copy-artifacts.ts` の新設で local/managed の rules.md コピーロジックが共通化され、`src/util/paths.ts` に `rulesSourcePath()` / `rulesDestPath()` ヘルパーが追加され重複ハードコードが排除された。runtime コピーロジックには TC-LR-014 / TC-LR-017 / TC-MR-005 / TC-MR-006 の 4 件の新規 test が追加され、test-cases.md の must 40 件はすべて構造的に covered。

実装は仕様と整合し、`bun run typecheck` および `bun run test`（2450 件）はすべて green。設計の核（acquired information vs given への移行）は一貫しており、修正を要する critical / major 指摘はない。

承認すると判断する。残存する minor の指摘（下記 #1〜#3）は本 PR で必須ではないが将来の改善候補として記録する。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/prompts/request-generate-system.ts:4, src/prompts/request-review-system.ts:13 | `request-generate` と `request-review` agent の Read 指示は `specrunner/changes/<slug>/rules.md` を指しているが、この 2 agent は change folder が作成される前（slug が存在する前）に実行される。実際には `specrunner/rules.md` を直接 Read する必要があるが、現状の指示文だと agent が存在しない path を探して fail するか、Read を skip する。`request-generate` と `request-review` の機能には ADR / delta-spec 規律はほぼ影響しないため runtime 障害にはならないが、identity priming の効果が不確実になる。 | 2 agent prompt の Read 指示を「`specrunner/rules.md`（プロジェクトルート配下）」に書き換える、または「change folder が存在しない場合は `specrunner/rules.md` を直接 Read」と明記する。task T-03 の table が「全 11 agent に同一 template」と前提しているため、template を agent ごとに分岐させる設計に変更が必要。 |
| 2 | MEDIUM | testing | tests/unit/rules-md.test.ts, tests/unit/prompts/common-context-catch.test.ts | 同一 assertion（rules.md 存在 + ADR キーワード + canonical path + 全 11 agent prompt の Read 指示）が 2 ファイルに重複している。test-cases.md でも TC-37〜TC-40 が common-context-catch.test.ts に、TC-41〜TC-46 が rules-md.test.ts にほぼ重複定義されている。実害は test 二重実行のみだが、将来 ADR キーワードや path を変更する際に 2 ファイルの追従が必要。iteration 1 review #8（LOW）と同件で本 iter でも未対応。 | (a) どちらかに集約（rules-md.test.ts に統合し common-context-catch.test.ts は PR #339 prevention の structural guard のみ残す）、(b) 共通 helper（`assertRulesMdAdrDiscipline()` / `assertAllAgentsContainRulesMdReadInstruction()`）を切り出して両 test で再利用、のいずれか。今 PR で対応不要。 |
| 3 | LOW | architecture | specrunner/changes/rules-md-injection/specs/prompt-fragment-registry/spec.md | 新規 Requirement「rules.md の存在と構造的保証」が `prompt-fragment-registry` capability に追加されているが、本 capability の本来の責務は prompt fragment の登録・inject であり、外部 markdown file（rules.md）の存在保証は本来別の責務領域に属する。design.md には拡張根拠の明示がない。iteration 1 review #7（LOW）と同件で本 iter でも未対応。 | (a) capability 名を `prompt-disciplines` 等に rename、(b) 別 capability `pipeline-rules` を新設、(c) design.md に「fragment registry の責務に外部 rules artifact 管理を含む」旨を加筆、のいずれか。今 PR で対応不要だが将来 rules artifact が増える際は再検討が必要。 |
| 4 | LOW | maintainability | src/prompts/fragments.ts:10-12, tests/unit/prompts/builder.test.ts:8-10, tests/unit/prompts/fragments.test.ts:7-10, tests/unit/prompts/fragment-coverage.test.ts:7-10 | 削除済み fragment 名（`SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT`）が 4 ファイルの comment に残存している。code としては問題ないが、将来のメンテナーが grep して「削除済みのはず」と確認する手間が増える。spec-review-result-002 の Finding（前回 Finding #7: grep が 0 になることを期待）の根拠から見ると残置は意図的（過渡的 migration note）と判断できるが、適切な期限（例: 1 release 後に削除）の明示はない。 | (a) 現状維持（migration note として明示）、(b) すべての NOTE comment を 1 release 後の cleanup PR で削除、のどちらか方針を design.md に追記する。 |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 8 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.25

correctness は機能としては仕様通りだが、request-generate / request-review の Read 指示の path 不整合（Finding #1）で -2。iteration 1 で指摘した HIGH の dead reference / runtime テスト未実装は両方とも解消されているため、architecture / maintainability / testing はそれぞれ +1 / +2 / +3 改善した。

CRITICAL: 0 件、HIGH: 0 件、MEDIUM: 2 件、LOW: 2 件 で **approved** 判定。total 8.25 は pass threshold 7.0 を超過。

---

## Scenario Coverage (test-cases.md must scenarios)

test-cases.md には must 40 件が定義されている。**全 40 件が covered**。

### Covered (40/40 件 = 100%)

- rules-md-content (TC-01〜11, 9 件 must): tests/unit/rules-md.test.ts + tests/unit/prompts/common-context-catch.test.ts で網羅
- worktree-copy (TC-13/14/17/18, 4 件 must): tests/unit/core/runtime/local.test.ts (TC-LR-014, TC-LR-017) + tests/unit/core/runtime/managed.test.ts (TC-MR-005, TC-MR-006) で網羅 ✓ **iteration 1 で未実装だった 4 件をすべて実装**
- agent-prompt (TC-19〜23, 5 件 must): rules-md.test.ts と common-context-catch.test.ts で網羅
- fragments-cleanup (TC-25〜30, TC-32〜33, 7 件 must): fragment-coverage.test.ts + 静的 import 確認で網羅
- test-update (TC-34〜39, TC-41〜46, 10 件 must): 各テストファイルの自己検証として網羅
- build (TC-47, TC-48, 2 件 must): bun run typecheck + bun run test green を確認済み
- regression (TC-49〜51, 3 件 must): rules-md.test.ts の docs/adr/ 不存在 assertion + rules.md ADR section 存在 assertion で網羅

### Not Covered (0 件)

なし。

### Should/Could (参考)

- TC-15 (rules.md と request.md が同一 commit) / TC-16 (staging area 確認) / TC-24 (delta-spec-validation kind:cli の構造確認) / TC-31 (11 agent tuple 構造) / TC-40 (TC-31 構造 test 維持) / TC-52 (acquired information 機構): 一部は実装済み（TC-31 / TC-40 は common-context-catch.test.ts で確認可）、その他は could/should で本 PR では非必須。

---

## Acceptance Criteria Check

| Criterion | Status |
|-----------|--------|
| `specrunner/rules.md` 新設（System Context / 思想原則 / 責任範囲 / System Facts / ADR 配置の特記 / spec authority lifecycle / delta spec 記法 の 7 セクション） | ✓ |
| worktree setup で rules.md → change folder へコピー（local + managed） | ✓ |
| 全 11 agent prompt 冒頭に identity priming + Read 指示 | ✓（partial: Finding #1 = request-generate/request-review の path が不一致） |
| fragments.ts から旧 fragment 削除（SPEC_RUNNER_COMMON_CONTEXT / AUTHORITY_SPEC_GUARD / DELTA_SPEC_FORMAT） | ✓ |
| `buildSystemPrompt` の強制 prepend 整理 | ✓ |
| `fragment-coverage.test.ts` update + green | ✓ |
| `common-context-catch.test.ts` update + green | ✓ |
| `rules-md.test.ts` 新設 + PR #339/#343/#344 同型 catch | ✓ |
| `bun run typecheck && bun run test` green | ✓ (2450/2450) |
| ADR に「rules.md 集約方式の採用」「change folder copy + Read 強制」「identity priming + acquired information」「MADR 不採用」記録 | ✓（adr-gen step は PR pipeline 後段で実行されるため未確認だが、`adr: true` meta は設定済み） |

---

## Improvements over iteration 1

iteration 1 review (review-feedback-001.md) の指摘の解消状況:

| # | iter 1 finding | severity | iter 2 状態 |
|---|----------|----------|----|
| 1 | runtime コピーロジックの自動テスト未実装 (TC-13/14/17/18) | HIGH | **解消** ✓ TC-LR-014/TC-LR-017/TC-MR-005/TC-MR-006 を tests/unit/core/runtime/ に新設 |
| 2 | dead reference「末尾の Delta Spec Format セクション」 | HIGH | **解消** ✓ design-system.ts:88 / spec-fixer-system.ts:38 で「`specrunner/changes/<slug>/rules.md` の `delta spec 記法` セクション参照」に書き換え |
| 3 | Vitest 固有の `resolves.toBeUndefined()` 依存 | MEDIUM | **解消** ✓ rules-md.test.ts:49-50 等で `await fs.access(...)` 直接呼び出しに書き換え |
| 4 | rules.md の step 数表記不整合 (10/11 混在) | MEDIUM | **解消** ✓ rules.md:15 が「11 step (うち 9 agent step + 2 CLI step) の state machine」に明示 |
| 5 | rules.md path のハードコード重複 | MEDIUM | **解消** ✓ src/util/paths.ts に `rulesSourcePath()` / `rulesDestPath(slug)` を新設、両 runtime で使用 |
| 6 | rules.md コピー処理の重複コード | MEDIUM | **解消** ✓ src/util/copy-artifacts.ts に `copyRulesToChangeFolder()` を新設、両 runtime で再利用 |
| 7 | prompt-fragment-registry capability の責務拡張 | LOW | **未解消** (本 iter Finding #3 として再記録) |
| 8 | test assertion の二重定義 | LOW | **未解消** (本 iter Finding #2 に MEDIUM 昇格として再記録 — 重複規模が visible になったため) |

### Regressions

なし。

### Unchanged Issues

- Finding #2（test 二重定義）と Finding #3（capability 責務拡張）は iter 1 LOW のまま残置。本 PR で必須ではないが将来の cleanup 候補。

---

## Notes

- `specrunner/rules.md` の内容は spec/design の必須セクションをすべて含み、ADR 配置に関する明確な禁止規律も明記されている（業界慣習 MADR 不採用、`docs/adr/` への言及禁止、adr-gen 以外での path 記載禁止）。
- `src/util/copy-artifacts.ts:36-38` の ENOENT ガードは `fs.access` で存在確認した後 `fs.cp` を実行する設計で、catch も try block 全体を覆っているため `fs.cp` の他の失敗（permission 等）も silently warning 化される。これは「rules.md の copy 失敗で pipeline を halt させない」設計判断と一致するため許容範囲。
- COMMIT_DISCIPLINE と PIPELINE_RULES を残す判断は妥当（前者は振る舞いルール、後者は review 専用 scoring rule で identity priming と独立）。
- `tests/unit/core/runtime/local.test.ts:591-631`（TC-LR-014）は worktree 内に `specrunner/rules.md` を実ファイルとして配置してから setupWorkspace を呼ぶ統合的なシナリオで、実装と一致する想定で書かれている。
- 本 review は静的解析・test 結果・spec/design 整合性確認に基づく。実 LLM session で identity priming + acquired information の効果がどの程度発揮されるかは別途 dogfood で計測が必要（design.md の Risks 「100% 保証ではない (93-97%)」と整合）。
- Finding #1（request-generate/request-review の Read path 不一致）は HIGH ではなく MEDIUM とした。理由: これら 2 agent は change folder を扱わず ADR / delta spec 規律もほぼ無関係のため、Read 失敗が機能的影響をほとんど与えない。ただし「全 agent に identity priming」という設計意図と乖離しているため、修正が望ましい。
