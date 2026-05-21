# Test Cases: merged-to-archive-consolidation

## TC-MA-001: checkSlugCollision — merged 経路が消えている

- **Category**: store / slug collision
- **Priority**: must
- **Source**: requirements §1, tasks Task 1

**GIVEN** store.ts がビルド済みの状態  
**WHEN** `MERGED_SUBDIR` 文字列を store.ts ソースで grep する  
**THEN** マッチなし (= 完全消失)

---

## TC-MA-002: checkSlugCollision — drafts 経路で重複を検出

- **Category**: store / slug collision
- **Priority**: must
- **Source**: requirements §1, tasks Task 1

**GIVEN** `specrunner/drafts/my-slug.md` が存在する  
**WHEN** `checkSlugCollision("my-slug")` を呼ぶ  
**THEN** `SLUG_COLLISION` エラーを throw する

---

## TC-MA-003: checkSlugCollision — changes/archive 経路で重複を検出

- **Category**: store / slug collision
- **Priority**: must
- **Source**: requirements §1, tasks Task 1

**GIVEN** `specrunner/changes/archive/my-slug/` ディレクトリが存在する  
**WHEN** `checkSlugCollision("my-slug")` を呼ぶ  
**THEN** `SLUG_COLLISION` エラーを throw する

---

## TC-MA-004: checkSlugCollision — 重複なしは正常終了

- **Category**: store / slug collision
- **Priority**: must
- **Source**: requirements §1, tasks Task 1

**GIVEN** `drafts/` にも `changes/archive/` にも対象 slug が存在しない  
**WHEN** `checkSlugCollision("new-slug")` を呼ぶ  
**THEN** エラーなしで正常終了する

---

## TC-MA-005: checkSlugCollision — requests/merged 経路は走査しない

- **Category**: store / slug collision
- **Priority**: must
- **Source**: requirements §1, tasks Task 1, Task 9 (regression)

**GIVEN** `specrunner/requests/merged/my-slug.md` が（仮に）存在する状態をモックする  
**WHEN** `checkSlugCollision("my-slug")` を呼ぶ  
**THEN** エラーを throw しない (= merged 経路は走査対象外)

---

## TC-MA-006: 静的 assertion — store.ts に MERGED_SUBDIR が含まれない

- **Category**: regression / static assertion
- **Priority**: must
- **Source**: requirements §10, tasks Task 9

**GIVEN** リポジトリのソースファイル `src/core/request/store.ts`  
**WHEN** ファイル内容を読み込み `"MERGED_SUBDIR"` 文字列を検索する  
**THEN** 0 件 (= dead code が残存しない)

---

## TC-MA-007: 静的 assertion — store.ts に requests/merged パスが含まれない

- **Category**: regression / static assertion
- **Priority**: must
- **Source**: requirements §10, tasks Task 9

**GIVEN** リポジトリのソースファイル `src/core/request/store.ts`  
**WHEN** ファイル内容を読み込み `"requests/merged"` 文字列を検索する  
**THEN** 0 件

---

## TC-MA-008: RequestState 型が削除されている

- **Category**: types / dead code removal
- **Priority**: must
- **Source**: requirements §2, tasks Task 2

**GIVEN** `src/core/request/types.ts` が編集後の状態  
**WHEN** `RequestState` の型定義を grep する  
**THEN** 0 件 (= 型ごと消えている)

---

## TC-MA-009: manager.ts の state field が削除されている

- **Category**: manager / dead code removal
- **Priority**: must
- **Source**: requirements §3, tasks Task 3

**GIVEN** `src/core/request/manager.ts` が編集後の状態  
**WHEN** `list()` の戻り値オブジェクトを確認する  
**THEN** `state` field を含まない (`{ slug, type }` のみ)

---

## TC-MA-010: manager.ts に RequestState import が残らない

- **Category**: manager / dead code removal
- **Priority**: must
- **Source**: requirements §3, tasks Task 3

**GIVEN** `src/core/request/manager.ts`  
**WHEN** `RequestState` import 文を grep する  
**THEN** 0 件

---

## TC-MA-011: request-list.ts の STATE 列が削除されている

- **Category**: request-list / display
- **Priority**: must
- **Source**: requirements §4, tasks Task 4

**GIVEN** `src/core/command/request-list.ts` が編集後の状態  
**WHEN** ヘッダ文字列を確認する  
**THEN** `"STATE"` 列が含まれず `"SLUG"` と `"TYPE"` のみ

---

## TC-MA-012: request-list の出力に state 値が含まれない

- **Category**: request-list / display
- **Priority**: must
- **Source**: requirements §4, tasks Task 4

**GIVEN** `specrunner/drafts/` に 1 件の request が存在する  
**WHEN** `request ls` を実行する  
**THEN** 出力行に `active` という文字列が含まれない

---

## TC-MA-013: request-migrate-flat.ts が削除されている

- **Category**: file deletion / dead code removal
- **Priority**: must
- **Source**: requirements §5, tasks Task 5

**GIVEN** リポジトリのファイルツリー  
**WHEN** `src/core/command/request-migrate-flat.ts` のパスを確認する  
**THEN** ファイルが存在しない

---

## TC-MA-014: request-migrate-flat.test.ts が削除されている

- **Category**: file deletion / dead code removal
- **Priority**: must
- **Source**: requirements §5, tasks Task 5

**GIVEN** リポジトリのファイルツリー  
**WHEN** `tests/unit/core/command/request-migrate-flat.test.ts` のパスを確認する  
**THEN** ファイルが存在しない

---

## TC-MA-015: store.test.ts から TC-ST-006 が削除されている

- **Category**: test update
- **Priority**: must
- **Source**: requirements §9, tasks Task 6

**GIVEN** `tests/unit/core/request/store.test.ts`  
**WHEN** `TC-ST-006` または `requests/merged` を grep する  
**THEN** 0 件

---

## TC-MA-016: slugify.test.ts — TC-SL-006b のテスト名が更新されている

- **Category**: test update
- **Priority**: should
- **Source**: requirements §9, tasks Task 7

**GIVEN** `tests/unit/util/slugify.test.ts`  
**WHEN** TC-SL-006b のテスト名を確認する  
**THEN** `"drafts/ and archive/ directories do not exist"` という文字列を含む

---

## TC-MA-017: slugify.test.ts — TC-SL-006d が削除されている

- **Category**: test update
- **Priority**: must
- **Source**: requirements §9, tasks Task 7

**GIVEN** `tests/unit/util/slugify.test.ts`  
**WHEN** `"merged/"` または `TC-SL-006d` を grep する  
**THEN** 0 件

---

## TC-MA-018: finish-orchestrator.test.ts の merged mock 分岐が削除されている

- **Category**: test update
- **Priority**: must
- **Source**: requirements §9, tasks Task 8

**GIVEN** `tests/finish-orchestrator.test.ts`  
**WHEN** `p.includes("merged")` を grep する  
**THEN** 0 件

---

## TC-MA-019: 再現 test — MERGED_SUBDIR 不在 assertion が存在する

- **Category**: regression / static assertion
- **Priority**: must
- **Source**: requirements §10, tasks Task 9

**GIVEN** `tests/unit/core/request/store.test.ts`  
**WHEN** `"Regression: MERGED_SUBDIR removed"` describe ブロックを確認する  
**THEN** 2 件の assertion test が存在する (MERGED_SUBDIR 不在 + requests/merged 不在)

---

## TC-MA-020: request-patterns — 151 件 archive エントリを収集できる

- **Category**: request-patterns / coverage
- **Priority**: must
- **Source**: requirements §思想, acceptance criteria, tasks Task 9b

**GIVEN** `specrunner/changes/archive/` 配下に 151 件のディレクトリが存在する  
**WHEN** `getRequestPatterns()` (または対応関数) を呼ぶ  
**THEN** 151 件分のパターンエントリが返される

---

## TC-MA-021: request-patterns — requests/merged を走査しない

- **Category**: request-patterns / no dead path
- **Priority**: must
- **Source**: requirements §思想, tasks Task 9b

**GIVEN** `specrunner/requests/merged/` ディレクトリが存在しない状態  
**WHEN** `getRequestPatterns()` を呼ぶ  
**THEN** ENOENT エラーが発生しない (= silent skip or 走査なし)

---

## TC-MA-022: typecheck が通る

- **Category**: build / typecheck
- **Priority**: must
- **Source**: acceptance criteria, tasks Task 11

**GIVEN** 全 src ファイルが編集後の状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラー 0 件で終了

---

## TC-MA-023: test suite が green

- **Category**: build / test
- **Priority**: must
- **Source**: acceptance criteria, tasks Task 11

**GIVEN** 全 src / test ファイルが編集後の状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass (= 0 failures)

---

## TC-MA-024: delta spec — cli-commands に request new の path 更新が含まれる

- **Category**: delta spec / baseline alignment
- **Priority**: must
- **Source**: requirements §6, tasks Task 10b

**GIVEN** `specrunner/changes/merged-to-archive-consolidation/delta-specs/cli-commands/spec.md`  
**WHEN** `request new` に関する Requirement ブロックを確認する  
**THEN** `specrunner/drafts/<slug>.md` パスの記述が含まれ、`requests/active/` 言及がない

---

## TC-MA-025: delta spec — request rm が "drafts 配下" に更新されている

- **Category**: delta spec / baseline alignment
- **Priority**: must
- **Source**: requirements §6, tasks Task 10d

**GIVEN** `specrunner/changes/merged-to-archive-consolidation/delta-specs/cli-commands/spec.md`  
**WHEN** `request rm` に関する Requirement ブロックを確認する  
**THEN** タイトルと本文が "drafts 配下" を指し、`requests/active/` 言及がない

---

## TC-MA-026: delta spec — checkSlugCollision が 2 経路記述になっている

- **Category**: delta spec / baseline alignment
- **Priority**: must
- **Source**: requirements §6, tasks Task 10b

**GIVEN** delta spec の `request new` Requirement ブロック  
**WHEN** slug 重複チェックのステップを確認する  
**THEN** "drafts + changes/archive の 2 経路" と記述されており、`merged` への言及がない

---

## TC-MA-027: 静的 assertion — cli-commands/spec.md に requests/merged パス言及がない (finish 後)

- **Category**: regression / static assertion (spec)
- **Priority**: must
- **Source**: requirements §10, acceptance criteria

**GIVEN** `specrunner/specs/cli-commands/spec.md` (= finish 後の baseline)  
**WHEN** `requests/merged/` 文字列を全行 grep する  
**THEN** 0 件 (= 完全消失)

---

## TC-MA-028: 静的 assertion — cli-commands/spec.md の requests/active 言及が意図外箇所にない (finish 後)

- **Category**: regression / static assertion (spec)
- **Priority**: should
- **Source**: design.md fallback path 設計判断, acceptance criteria

**GIVEN** `specrunner/specs/cli-commands/spec.md` (= finish 後の baseline)  
**WHEN** `requests/active/` 文字列を全行 grep する  
**THEN** L710-717, L739, L756-761 相当の deprecation fallback 記述のみにヒットし、command 仕様本文にはヒットしない

---

## TC-MA-029: doctor workflow-structure が requests/merged を期待しない

- **Category**: doctor / no-op check
- **Priority**: should
- **Source**: requirements §7, tasks Task (confirmation only)

**GIVEN** `src/core/doctor/checks/repo/workflow-structure.ts`  
**WHEN** `requests/merged` を grep する  
**THEN** 0 件 (= PR #347 での更新済み状態を維持)

---

## TC-MA-030: ADR が生成されている

- **Category**: documentation / ADR
- **Priority**: should
- **Source**: requirements §adr: true, acceptance criteria, tasks Task 12

**GIVEN** `specrunner/changes/merged-to-archive-consolidation/` ディレクトリ  
**WHEN** `adr.md` の存在とその内容を確認する  
**THEN** 「merged → archive 統合」「44 件救済」「archive 経路一本化」「PR #347 baseline 漏れの是正」「LLM 不確定性の構造観察」の 5 点が記録されている

---

## TC-MA-031: specrunner/requests/merged/ ディレクトリが存在しない

- **Category**: physical state / acceptance
- **Priority**: must
- **Source**: acceptance criteria (PR #348 完了済み状態の維持)

**GIVEN** リポジトリのファイルツリー  
**WHEN** `specrunner/requests/merged/` のパスを確認する  
**THEN** ディレクトリが存在しない

---

## TC-MA-032: changes/archive/ 配下に 151 件のディレクトリが存在する

- **Category**: physical state / acceptance
- **Priority**: must
- **Source**: acceptance criteria (PR #348 完了済み状態の維持)

**GIVEN** リポジトリのファイルツリー  
**WHEN** `specrunner/changes/archive/` 配下のディレクトリ数を数える  
**THEN** 151 件以上 (= PR #348 完了時の状態が維持されている)

---

## TC-MA-033: request-migrate-flat への import が他ファイルに残らない

- **Category**: dead code removal / regression
- **Priority**: must
- **Source**: requirements §5

**GIVEN** リポジトリの全 TypeScript ソースファイル  
**WHEN** `request-migrate-flat` 文字列を grep する  
**THEN** 0 件 (= src / tests 双方に参照なし)
