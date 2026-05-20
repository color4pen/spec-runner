# Test Cases: rules-md-injection

## Overview

`specrunner/rules.md` 新設 + change folder コピー + identity priming による全 agent への規律注入。
ADR 配置事故（PR #339/#343/#344）の構造的再発防止が主目的。

テストは全て **静的 unit test（LLM 呼び出しなし、文字列 assert）** で検証する。

---

## Category: rules-md-content — specrunner/rules.md のファイル内容

### TC-01: rules.md ファイルが存在する

- **Priority**: must
- **Source**: T-01, AC#1

```
GIVEN: spec-runner プロジェクトルート配下がある
WHEN:  `specrunner/rules.md` のパスに fs.access を実行する
THEN:  ファイルが存在し、アクセス可能である
```

---

### TC-02: rules.md — System Context セクションが存在する

- **Priority**: must
- **Source**: T-01（システム概観）, AC#1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  `## spec-runner: System Context` または同等のセクションヘッダーが含まれ、
       pipeline 構成（step 数 / 独立 session + artifact 経由連携）の説明が存在する
```

---

### TC-03: rules.md — 思想原則セクションが存在する

- **Priority**: must
- **Source**: T-01（思想原則）, AC#1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  思想原則セクション（agent は semantic content のみ担当、
       path / format は tool / CLI が決定 等）が含まれる
```

---

### TC-04: rules.md — 責任範囲セクションが存在する

- **Priority**: must
- **Source**: T-01（責任範囲）, AC#1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  各 step の touch 可能 / 禁止領域テーブルが含まれる
```

---

### TC-05: rules.md — System Facts セクションが存在する

- **Priority**: must
- **Source**: T-01（System Facts）, AC#1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  ADR / Authority spec / Delta spec / Change folder 等の正規 path 一覧セクションが含まれる
```

---

### TC-06: rules.md — ADR 配置の特記セクションが存在する

- **Priority**: must
- **Source**: T-01（ADR 配置の特記）, AC#1, regression prevention

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  ADR 配置を明示するセクションが含まれ、
       「業界慣習 MADR」「採用しない」「adr-gen 以外」等のキーワードが存在する
```

---

### TC-07: rules.md — spec authority lifecycle セクションが存在する

- **Priority**: must
- **Source**: T-01（AUTHORITY_SPEC_GUARD 移植）, AC#1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  spec authority lifecycle セクション（正規経路 / 書く側の規律 / 見る側の規律）が含まれる
```

---

### TC-08: rules.md — delta spec 記法セクションが存在する

- **Priority**: must
- **Source**: T-01（DELTA_SPEC_FORMAT 移植）, AC#1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  delta spec 記法セクション（セクションヘッダー / ルール / ファイル配置）が含まれる
```

---

### TC-09: rules.md — 正規 ADR path 文字列が含まれる

- **Priority**: must
- **Source**: T-01 ADR セクション, T-07, AC#8

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ファイル内容を読む
THEN:  `specrunner/adr/` を含む正規 path 文字列（例: `specrunner/adr/{YYYY-MM-DD}-{slug}.md`）が含まれる
```

---

### TC-10: rules.md — docs/adr/ 形式の不採用が明記されている

- **Priority**: must
- **Source**: T-01 ADR 特記, design.md D1, regression prevention（PR #339/#343/#344）

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ADR 配置の特記セクションを読む
THEN:  `docs/adr/` の MADR 形式を採用しないことが明記されている
```

---

### TC-11: rules.md — adr-gen 以外での ADR path 記載禁止が明記されている

- **Priority**: must
- **Source**: T-01 ADR 特記, request.md 要件 #1

```
GIVEN: `specrunner/rules.md` が存在する
WHEN:  ADR 配置の特記セクションを読む
THEN:  「adr-gen 以外の step では ADR path を記載しない」旨の規律が含まれる
```

---

### TC-12: rules.md — 既存 SPEC_RUNNER_COMMON_CONTEXT の内容が漏れなく移植されている

- **Priority**: should
- **Source**: T-01, D2（fragments.ts 内容の移植完全性）

```
GIVEN: `specrunner/rules.md` と `src/prompts/fragments.ts`（削除後）が存在する
WHEN:  rules.md の内容を確認する
THEN:  旧 SPEC_RUNNER_COMMON_CONTEXT に含まれていた Pipeline Structure / 思想原則 /
       責任範囲テーブル / System Facts が rules.md に存在する
```

---

## Category: worktree-copy — worktree setup での rules.md コピー

### TC-13: local runtime — rules.md が change folder にコピーされる

- **Priority**: must
- **Source**: T-02, AC#2

```
GIVEN: `specrunner/rules.md` が worktree 内に存在し、
       local runtime の setupWorkspace が実行される（slug = "test-slug"）
WHEN:  setupWorkspace の処理が完了する
THEN:  `<worktreePath>/specrunner/changes/test-slug/rules.md` が生成されている
```

---

### TC-14: managed runtime — rules.md が change folder にコピーされる

- **Priority**: must
- **Source**: T-02, AC#2

```
GIVEN: `specrunner/rules.md` が存在し、
       managed runtime の setupWorkspace が実行される（slug = "test-slug"）
WHEN:  setupWorkspace の処理が完了する
THEN:  `specrunner/changes/test-slug/rules.md` が生成されている
```

---

### TC-15: local runtime — rules.md コピーが request.md と同一 commit に含まれる

- **Priority**: should
- **Source**: T-02（commit 同期の仕様）

```
GIVEN: local runtime の setupWorkspace が実行される
WHEN:  setup 完了後の git log を確認する
THEN:  `specrunner/changes/<slug>/rules.md` が request.md と同一 commit に含まれる
```

---

### TC-16: local runtime — rules.md が staging area に追加される

- **Priority**: should
- **Source**: T-02（git add 処理）

```
GIVEN: local runtime の setupWorkspace で rules.md コピーが実行される
WHEN:  git status を確認する
THEN:  `specrunner/changes/<slug>/rules.md` が staged state にある
```

---

### TC-17: local runtime — rules.md 不在時は throw せず warning で続行する

- **Priority**: must
- **Source**: T-02 ENOENT ガード, AC#2

```
GIVEN: `specrunner/rules.md` が存在しない状態で
       local runtime の setupWorkspace が呼び出される
WHEN:  setupWorkspace を実行する
THEN:  例外が throw されず、warning ログが出力され、後続処理が続行する
```

---

### TC-18: managed runtime — rules.md 不在時は throw せず warning で続行する

- **Priority**: must
- **Source**: T-02 ENOENT ガード, AC#2

```
GIVEN: `specrunner/rules.md` が存在しない状態で
       managed runtime の setupWorkspace が呼び出される
WHEN:  setupWorkspace を実行する
THEN:  例外が throw されず、warning ログが出力され、後続処理が続行する
```

---

## Category: agent-prompt — agent system prompt の identity priming + Read 指示

### TC-19: 全 11 agent — identity priming 文が system prompt の冒頭に含まれる

- **Priority**: must
- **Source**: T-03, AC#3

対象ファイルと step name:

| ファイル | step name |
|---------|-----------|
| `src/prompts/design-system.ts` | design |
| `src/prompts/spec-review-system.ts` | spec-review |
| `src/prompts/spec-fixer-system.ts` | spec-fixer |
| `src/prompts/test-case-gen-system.ts` | test-case-gen |
| `src/prompts/implementer-system.ts` | implementer |
| `src/prompts/build-fixer-system.ts` | build-fixer |
| `src/prompts/code-review-system.ts` | code-review |
| `src/prompts/code-fixer-system.ts` | code-fixer |
| `src/prompts/adr-gen-system.ts` | adr-gen |
| `src/prompts/request-generate-system.ts` | request-generate |
| `src/prompts/request-review-system.ts` | request-review |

```
GIVEN: 上記 11 ファイルが存在する
WHEN:  各ファイルの BASE 文字列の先頭を確認する
THEN:  「あなたは spec-runner pipeline のステップ agent（{step name}）です。」
       またはそれと同等の identity priming 文が含まれる
```

---

### TC-20: 全 11 agent — rules.md への Read 指示が system prompt の冒頭に含まれる

- **Priority**: must
- **Source**: T-03, AC#3, T-06 新 assertion, T-07

```
GIVEN: 上記 11 ファイルが存在する
WHEN:  各ファイルの BASE 文字列を確認する
THEN:  `specrunner/changes/<slug>/rules.md` を Read tool で読む旨の指示文字列が含まれる
       （例: 「rules.md（= `specrunner/changes/<slug>/rules.md`）を Read tool で読み」）
```

---

### TC-21: design agent — docs/adr/ への明示的言及が含まれない

- **Priority**: must
- **Source**: T-07（業界慣習の発動防止）, regression prevention（PR #339/#343）

```
GIVEN: `src/prompts/design-system.ts` が存在する
WHEN:  ファイル内容を読む
THEN:  `docs/adr/` の文字列が含まれない
```

---

### TC-22: code-review agent — docs/adr/ への明示的言及が含まれない

- **Priority**: must
- **Source**: T-07, regression prevention

```
GIVEN: `src/prompts/code-review-system.ts` が存在する
WHEN:  ファイル内容を読む
THEN:  `docs/adr/` の文字列が含まれない
```

---

### TC-23: code-fixer agent — docs/adr/ への明示的言及が含まれない

- **Priority**: must
- **Source**: T-07, regression prevention

```
GIVEN: `src/prompts/code-fixer-system.ts` が存在する
WHEN:  ファイル内容を読む
THEN:  `docs/adr/` の文字列が含まれない
```

---

### TC-24: delta-spec-validation — identity priming の適用対象外である

- **Priority**: should
- **Source**: T-03 対象外注記（kind: cli、agent session なし）

```
GIVEN: delta-spec-validation step は kind: cli で agent session を持たない
WHEN:  delta-spec-validation の設定を確認する
THEN:  system prompt ファイルが存在せず、identity priming の適用対象外である
```

---

## Category: fragments-cleanup — fragments.ts 整理 + buildSystemPrompt 簡素化

### TC-25: fragments.ts — SPEC_RUNNER_COMMON_CONTEXT export が削除されている

- **Priority**: must
- **Source**: T-04, AC#4

```
GIVEN: `src/prompts/fragments.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `SPEC_RUNNER_COMMON_CONTEXT` の export が存在しない
```

---

### TC-26: fragments.ts — AUTHORITY_SPEC_GUARD export が削除されている

- **Priority**: must
- **Source**: T-04, AC#4

```
GIVEN: `src/prompts/fragments.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `AUTHORITY_SPEC_GUARD` の export が存在しない
```

---

### TC-27: fragments.ts — DELTA_SPEC_FORMAT export が削除されている

- **Priority**: must
- **Source**: T-04, AC#4

```
GIVEN: `src/prompts/fragments.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `DELTA_SPEC_FORMAT` の export が存在しない
```

---

### TC-28: fragments.ts — COMMIT_DISCIPLINE が残存している

- **Priority**: must
- **Source**: T-04（残す fragment）

```
GIVEN: `src/prompts/fragments.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `COMMIT_DISCIPLINE` の export が存在する
```

---

### TC-29: fragments.ts — PIPELINE_RULES が残存している

- **Priority**: must
- **Source**: T-04（残す fragment）

```
GIVEN: `src/prompts/fragments.ts` が存在する
WHEN:  ファイル内容を確認する
THEN:  `PIPELINE_RULES` の export が存在する
```

---

### TC-30: buildSystemPrompt — SPEC_RUNNER_COMMON_CONTEXT の import と prepend ロジックが削除されている

- **Priority**: must
- **Source**: T-04, AC#5, design.md D2

```
GIVEN: `src/prompts/builder.ts` が存在する
WHEN:  buildSystemPrompt 関数の実装を確認する
THEN:  `SPEC_RUNNER_COMMON_CONTEXT` の import 文が存在せず、
       prepend ロジック（`[SPEC_RUNNER_COMMON_CONTEXT, base, ...]`）も存在しない
```

---

### TC-31: buildSystemPrompt — base + fragments の単純 join のみを行う

- **Priority**: should
- **Source**: T-04, design.md D2（簡素化後の仕様）

```
GIVEN: `src/prompts/builder.ts` の buildSystemPrompt が存在する
WHEN:  関数の実装を確認する
THEN:  出力は `[base, ...fragments].join(...)` またはそれと同等の結合のみであり、
       自動 prepend / append ロジックを含まない
```

---

### TC-32: AUTHORITY_SPEC_GUARD を使用していた 6 ファイルから import と参照が削除されている

- **Priority**: must
- **Source**: T-04（影響ファイル: design, spec-fixer, code-fixer, implementer, spec-review, code-review）

```
GIVEN: 以下の 6 ファイルが存在する:
       design-system.ts / spec-fixer-system.ts / code-fixer-system.ts /
       implementer-system.ts / spec-review-system.ts / code-review-system.ts
WHEN:  各ファイルの import 文と buildSystemPrompt の fragments 引数を確認する
THEN:  `AUTHORITY_SPEC_GUARD` の import と fragments 配列への参照が全て削除されている
```

---

### TC-33: DELTA_SPEC_FORMAT を使用していた 4 ファイルから import と参照が削除されている

- **Priority**: must
- **Source**: T-04（影響ファイル: design, spec-fixer, code-fixer, implementer）

```
GIVEN: 以下の 4 ファイルが存在する:
       design-system.ts / spec-fixer-system.ts / code-fixer-system.ts / implementer-system.ts
WHEN:  各ファイルの import 文と buildSystemPrompt の fragments 引数を確認する
THEN:  `DELTA_SPEC_FORMAT` の import と fragments 配列への参照が全て削除されている
```

---

## Category: test-update — テストファイルの更新

### TC-34: fragment-coverage.test.ts — 削除 fragment の assertion が存在しない

- **Priority**: must
- **Source**: T-05, AC#6

```
GIVEN: `tests/unit/prompts/fragment-coverage.test.ts` が更新されている
WHEN:  テストファイルの内容を確認する
THEN:  SPEC_RUNNER_COMMON_CONTEXT / AUTHORITY_SPEC_GUARD / DELTA_SPEC_FORMAT への
       import と assertion が存在しない
```

---

### TC-35: fragment-coverage.test.ts — EXPECTED 対応表が tasks.md 仕様と一致する

- **Priority**: must
- **Source**: T-05 EXPECTED 対応表

```
GIVEN: `tests/unit/prompts/fragment-coverage.test.ts` が更新されている
WHEN:  テストの EXPECTED 対応表を確認する
THEN:  以下の対応が成立している:
       - IMPLEMENTER: [COMMIT_DISCIPLINE] のみ
       - DESIGN: []
       - SPEC_FIXER: [COMMIT_DISCIPLINE]
       - CODE_FIXER: [COMMIT_DISCIPLINE]
       - BUILD_FIXER: [COMMIT_DISCIPLINE]
       - ADR_GEN: [COMMIT_DISCIPLINE]
       - SPEC_REVIEW: [PIPELINE_RULES]
       - CODE_REVIEW: [PIPELINE_RULES]
       - TEST_CASE_GEN: []
       - REQUEST_GENERATE: []
       - REQUEST_REVIEW: []
```

---

### TC-36: fragment-coverage.test.ts — SPEC_RUNNER_COMMON_CONTEXT injection の describe ブロックが削除されている

- **Priority**: must
- **Source**: T-05（injection describe ブロック削除）

```
GIVEN: `tests/unit/prompts/fragment-coverage.test.ts` が更新されている
WHEN:  テストファイルを確認する
THEN:  `SPEC_RUNNER_COMMON_CONTEXT` injection に関する describe ブロック全体が存在しない
```

---

### TC-37: common-context-catch.test.ts — rules.md Read 指示の assertion が存在する

- **Priority**: must
- **Source**: T-06, AC#7

```
GIVEN: `tests/unit/prompts/common-context-catch.test.ts` が更新されている
WHEN:  テストの assertion を確認する
THEN:  全 11 agent prompt が `specrunner/changes/<slug>/rules.md` への
       Read 指示文字列を含むことをアサートする describe / test ブロックが存在する
```

---

### TC-38: common-context-catch.test.ts — rules.md 本文の ADR キーワード assertion が存在する

- **Priority**: must
- **Source**: T-06, AC#7

```
GIVEN: `tests/unit/prompts/common-context-catch.test.ts` が更新されている
WHEN:  テストの assertion を確認する
THEN:  `specrunner/rules.md` の ADR 配置規律キーワード
       （「業界慣習 MADR」「採用しない」「adr-gen 以外」等）の存在をアサートする
       describe / test ブロックが存在する
```

---

### TC-39: common-context-catch.test.ts — rules.md 内の正規 ADR path assertion が存在する

- **Priority**: must
- **Source**: T-06, AC#7

```
GIVEN: `tests/unit/prompts/common-context-catch.test.ts` が更新されている
WHEN:  テストの assertion を確認する
THEN:  rules.md 内に `specrunner/adr/` を含む正規 path 文字列が存在することを
       アサートする describe / test ブロックが存在する
```

---

### TC-40: common-context-catch.test.ts — TC-31 の構造テスト（11 agents / tuple 形式）が維持されている

- **Priority**: should
- **Source**: T-06（既存テスト維持）

```
GIVEN: `tests/unit/prompts/common-context-catch.test.ts` が更新されている
WHEN:  テストファイルを確認する
THEN:  11 agents を tuple 形式で列挙する構造テストが残存している
```

---

### TC-41: rules-md.test.ts — ファイルが新規作成されている

- **Priority**: must
- **Source**: T-07, AC#8

```
GIVEN: 実装が完了している
WHEN:  `tests/unit/rules-md.test.ts` のパスを確認する
THEN:  ファイルが存在する
```

---

### TC-42: rules-md.test.ts — specrunner/rules.md 存在確認の assertion

- **Priority**: must
- **Source**: T-07, AC#8

```
GIVEN: `tests/unit/rules-md.test.ts` が存在する
WHEN:  テストを実行する
THEN:  `specrunner/rules.md` の存在をアサートする test ケースが green になる
```

---

### TC-43: rules-md.test.ts — ADR 配置の特記セクション存在の assertion

- **Priority**: must
- **Source**: T-07, AC#8, regression prevention

```
GIVEN: `tests/unit/rules-md.test.ts` が存在する
WHEN:  テストを実行する
THEN:  rules.md に「業界慣習 MADR」「採用しない」「adr-gen 以外」等の
       キーワードが含まれることをアサートする test ケースが green になる
```

---

### TC-44: rules-md.test.ts — 正規 ADR path 文字列含有の assertion

- **Priority**: must
- **Source**: T-07, AC#8

```
GIVEN: `tests/unit/rules-md.test.ts` が存在する
WHEN:  テストを実行する
THEN:  rules.md 内に `specrunner/adr/` を含む path 文字列が存在することを
       アサートする test ケースが green になる
```

---

### TC-45: rules-md.test.ts — 全 11 agent Read 指示の文字列 contains assertion

- **Priority**: must
- **Source**: T-07, AC#3, AC#8

```
GIVEN: `tests/unit/rules-md.test.ts` が存在する
WHEN:  テストを実行する
THEN:  全 11 agent system prompt が `specrunner/changes/<slug>/rules.md` を含む
       Read 指示を持つことをアサートする test ケース群が green になる
```

---

### TC-46: rules-md.test.ts — design/code-review/code-fixer が docs/adr/ 言及なしの assertion

- **Priority**: must
- **Source**: T-07, AC#8, regression prevention（PR #339/#343/#344）

```
GIVEN: `tests/unit/rules-md.test.ts` が存在する
WHEN:  テストを実行する
THEN:  design / code-review / code-fixer の system prompt が `docs/adr/` を
       含まないことをアサートする test ケース群が green になる
```

---

## Category: build — typecheck + test green

### TC-47: typecheck が green になる

- **Priority**: must
- **Source**: T-08, AC#9

```
GIVEN: 全ての変更（T-01〜T-07）が適用されている
WHEN:  `bun run typecheck` を実行する
THEN:  型エラーが 0 件で終了する
```

---

### TC-48: bun run test が green になる

- **Priority**: must
- **Source**: T-08, AC#9

```
GIVEN: 全ての変更（T-01〜T-07）が適用されている
WHEN:  `bun run test` を実行する
THEN:  全テストが green で終了する（fragment-coverage / common-context-catch /
       rules-md の各テストを含む）
```

---

## Category: regression — PR #339/#343/#344 同型ケースの構造的 catch

### TC-49: 静的テストで PR #339 同型ケースの構造 guard が成立する（docs/adr/NNN- 形式）

- **Priority**: must
- **Source**: T-07, request.md 背景（PR #339）, AC#8

```
GIVEN: rules-md.test.ts が存在し、design-system.ts に docs/adr/ が含まれない
WHEN:  bun run test を実行する
THEN:  PR #339 で発生した `docs/adr/001-...` 誤配置パターンが
       design prompt の静的テストで catch される（docs/adr/ 言及なし assertion が green）
```

---

### TC-50: 静的テストで PR #343 同型ケースの構造 guard が成立する（docs/adr/NNN- 形式 + code-review）

- **Priority**: must
- **Source**: T-07, request.md 背景（PR #343）, AC#8

```
GIVEN: rules-md.test.ts が存在し、code-review-system.ts に docs/adr/ が含まれない
WHEN:  bun run test を実行する
THEN:  PR #343 で発生した `docs/adr/002-...` 誤配置パターンが
       code-review prompt の静的テストで catch される（docs/adr/ 言及なし assertion が green）
```

---

### TC-51: 静的テストで rules.md の ADR 規律セクション存在 guard が成立する

- **Priority**: must
- **Source**: T-07, request.md 背景（PR #344）, AC#8

```
GIVEN: rules-md.test.ts が存在し、rules.md に ADR 配置の特記セクションが存在する
WHEN:  bun run test を実行する
THEN:  ADR 規律の source of truth が rules.md に存在することが
       静的テストで検証され、将来の事故に対する構造 guard として機能する
```

---

### TC-52: 全 agent が rules.md Read 指示を持つことで acquired information 機構が機能する

- **Priority**: should
- **Source**: T-07, design.md D3（identity priming の効果）, AC#3/#8

```
GIVEN: 全 11 agent system prompt の Read 指示 assertion が green になっている
WHEN:  任意の agent が rules.md を Read tool で取得する
THEN:  acquired information として rules.md の ADR 規律が context に入り、
       given（static injection）より高い認知重みで業界慣習 MADR を上書きできる
       （静的テストで仕組みの存在を確認。実際の挙動は確率的改善であり 100% 保証ではない）
```

---

## Summary

| Category | must | should | could | 合計 |
|----------|------|--------|-------|------|
| rules-md-content | 9 | 1 | 0 | 10 |
| worktree-copy | 4 | 2 | 0 | 6 |
| agent-prompt | 5 | 1 | 0 | 6 |
| fragments-cleanup | 7 | 1 | 0 | 8 |
| test-update | 10 | 1 | 0 | 11 |
| build | 2 | 0 | 0 | 2 |
| regression | 3 | 1 | 0 | 4 |
| **合計** | **40** | **7** | **0** | **47** |
