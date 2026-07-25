# Design: test-cases.md の Result YAML の所有権を test-case-gen に固定する

## Context

test-cases.md テンプレートは末尾に Result YAML ブロック（`result: completed | partial | failed` /
`total` / `automated` / `manual` / `must` / `should` / `could` / `blocked_reasons`）を要求する。
しかし `result` が「何の結果か」をテンプレート・prompt のどこも定義していない。実態は test-case-gen による
**テストケース生成の結果記録**であり、生成時に一度だけ書かれる確定値である。

意味が未定義のため、`result: completed | partial | failed` という語彙は後続ステップから
**ライフサイクルフィールド**（作業が進んだら更新すべき状態欄）に見える。実運用（外部 repo、
specrunner 0.4.x）で test-materialize の agent がテスト実装完了後に Result ブロックを `completed` へ更新しようとし、
write-scope 検証（test-materialize は test-cases.md への合法な書込を持たない）で halt した。ガードは設計どおり
働いたが、誤読を誘発する意味の欠落が canon 側に残っている。

現状の前提（本設計で確認済み）:

- `src/templates/step-output-templates.ts:117-163` — `TEST_CASES_TEMPLATE`。Result YAML ブロックを末尾に
  要求するが、所有者・書込時点・enum 値の意味は未定義。
- `src/templates/step-output-templates.ts:109-116` — docstring が `Machine-parsed fields:` として
  `Result YAML block (all keys)` を主張するが、pipeline のいかなるコードも Result YAML を parse しない。
- `src/core/verification/test-coverage.ts` — test-cases.md の machine-parse は `extractMustTcIds` が担い、
  対象は `## TC-NNN` / `### TC-NNN` heading と `**Priority**: must` / `**Category**: manual` のみ。
  Result YAML・Summary は parse しない。
- `src/core/step/test-case-gen.ts:89-99` — `resultFilePath` は null、`parseResult` は `NULL_PARSE_RESULT`。
  Result YAML の内容検査はなく、出力契約は test-cases.md の存在（produced）のみ。
- `src/prompts/test-case-gen-system.ts` — Result YAML の配置指示と `blocked_reasons` の記録形式はあるが、
  `result` の enum 意味と確定時点の定義がない。
- `src/prompts/test-materialize-system.ts` — 「test-cases.md は変更禁止」(#880) は Contract の write-set に
  明記済みだが、Result ブロック・result 欄への個別言及がない。
- `src/core/step/write-scope.ts` — test-materialize は `GUARDED_WRITE_STEPS`、test-cases.md は
  `protectedCanonPaths`。宣言なしの test-cases.md 書込は write-scope violation（halt）になる。

欠けているのは「result が何の結果か」という意味の定義のみ。ガード自体は正しく機能している。

## Goals / Non-Goals

**Goals**:

- Result YAML の所有権（test-case-gen）・書込時点（生成時に一度）・`result` の enum 意味を、
  canon（テンプレート + gen prompt + materialize prompt）の明文で確定する。
- docstring を machine-parse の実態（Result YAML は非 parse、machine-parse 対象は TC-NNN heading と
  Priority / Category）に整合させる。
- agent が「この Result 欄は更新すべきか？」と判断する場面を canon の明文で消し、materialize の
  誤更新 → write-scope halt という事故クラスを再発させない。

**Non-Goals**（request のスコープ外を継承）:

- Result YAML の機械 parser の新設（消費者がいない。意味の確定が先）。
- Result YAML の schema 変更（キーの追加・削除・rename。既存 repo の test-cases.md との互換を維持）。
- test-materialize への test-cases.md 書込許可（canon 保護の逆行。#880 を維持）。
- write-scope 検証の挙動変更（ガードは設計どおり機能した）。
- Summary セクションの形式変更。

## Decisions

### D1: 意味の確定は 3 つの canon 表面への文言追加のみで行う（コード挙動は不変）

Result YAML の所有権と意味を、次の 3 表面に文言として明記する:

1. `TEST_CASES_TEMPLATE` の Result ブロック要求コメント（HTML コメント内）— 所有者・書込時点・enum 意味。
2. `TEST_CASE_GEN_SYSTEM_PROMPT` — enum 意味 + 確定規則（生成完了時点で確定、後続は書き換えない）。
3. `TEST_MATERIALIZE_SYSTEM_PROMPT` — Result YAML は生成時の記録であり実装完了後も更新しない。

- Rationale: 事故の根は「意味の欠落」であり、機構の欠陥ではない。write-scope ガードは正しく halt した。
  agent が判断を迫られる場面（更新すべきか？）を、判定を要さない明文で消すのが最小かつ根本の対策。
  parser / schema / 権限のいずれを触っても事故クラスは消えず、複雑さだけが増える。
- Alternatives considered:
  - Result ブロックの削除 — 却下。`blocked_reasons` は設計不能 must TC の唯一の記録経路であり、
    削除すると生成の不完全性が無言化する。既存 repo の test-cases.md との互換も壊れる。
  - test-materialize に Result 更新を許可 — 却下。「test-cases.md は test-case-gen の正典」(#880) の逆行。
    materialize の完了状態は verification / coverage 検査が機械的に判定するものであり、canon への
    自己申告欄を作る必要がない。
  - Result YAML の機械 parse 導入による整合検査 — 却下。消費者のいない parser の新設は複雑化のみ。

### D2: enum の意味は 1 箇所の定義を 3 表面で共有する（文言の一致を固定）

`result` の enum は次の 1 つの定義に統一し、テンプレートと gen prompt で同一の意味を持たせる:

- `completed` = 全 TC の設計が完了し `blocked_reasons` が空
- `partial` = 一部 TC が設計不能で `blocked_reasons` に記録あり
- `failed` = 生成自体が成立しなかった

- Rationale: テンプレートと prompt で enum の意味が食い違うと、再び誤読の余地が生まれる。request 要件 1・2 は
  「同一の enum 意味」を要求している。テストで両表面に同じ enum 意味が存在することを固定する。
- Alternatives considered: gen prompt から定数を import してテンプレートへ注入する DRY 化 — 却下。
  テンプレート（`src/templates/`）と prompt（`src/prompts/`）は別レイヤであり、片方向 import を増やすと
  leaf 構造が濁る。文言重複はテストで一致を担保すれば足りる（この規模では過剰な抽象化を避ける）。

### D3: docstring は machine-parse の実態を反映する（Result YAML を machine-parsed から外す）

`TEST_CASES_TEMPLATE` 直前の docstring の `Machine-parsed fields:` 列挙から
`Result YAML block (all keys)` を除去し、実態に合わせる: machine-parse 対象は
`### TC-NNN` heading と `**Priority**` / `**Category**` フィールド（test-coverage 検査が消費する）である。
Result YAML は pipeline で parse されない旨を注記する。

- Rationale: `test-coverage.ts` の `extractMustTcIds` が唯一の test-cases.md machine-parser であり、
  読むのは TC heading と Priority / Category のみ。docstring の現記述は実態と食い違う虚偽の契約であり、
  誤読の温床になる。request 要件 4 が明示的に整合を求めている。
- Alternatives considered: Summary を machine-parsed のまま残す — 却下。`extractMustTcIds` は Summary も
  parse しない。実態は「TC heading + Priority / Category」のみであり、docstring はそれに正確に一致させる。

### D4: 検証はテンプレート文言テスト + prompt contract テストで固定し、既存テストは無改変で保つ

新規テストで次を固定する（既存テストファイルは改変しない = 新規ファイルで追加する）:

- テンプレート: Result ブロックコメントに所有者・書込時点・enum 意味が含まれる。
- テンプレート docstring: source テキストから docstring を抽出し、`Result YAML block (all keys)` を
  machine-parsed とする記述が残っていない／TC-NNN・Priority・Category が machine-parse 対象として記載されている。
- gen prompt: enum 意味 + 確定規則が含まれる。
- materialize prompt: Result YAML を実装完了後も更新しない旨が含まれる。

- Rationale: 変更対象が canon 文言そのものなので、文言テストが唯一の適切な歯（tooth）になる。
  docstring は runtime 値ではなくコメントなので、source ファイルを `readFileSync` で読んで検査する
  （既存の `prompt-skeleton-drift-guard.test.ts` TC-027 と同じ手法）。
- Alternatives considered: 既存の `step-output-templates.test.ts` / `test-case-gen-system.test.ts` に
  `it` を追記 — 却下寄り。受け入れ基準「既存テストが無変更で green」を厳密に満たすため、新規テストは
  別ファイルに置く（既存ファイルの diff を出さない）。既存 repo でも `test-materialize-manual-scope-contract.test.ts`
  が同パターンで新設されている。

## Risks / Trade-offs

- [Risk] テンプレート／prompt の新規文言が、`prompt-skeleton-drift-guard.test.ts` TC-012 の禁止文字列
  （`Category determination:` / `Priority determination:` / `result determination:`）に一致して既存テストを赤にする
  → Mitigation: enum 意味は日本語の散文（例:「`result` の値の意味:」）で記述し、禁止済みの
  `... determination:` 文字列を使わない。tasks の Acceptance Criteria に禁止文字列を明示する。

- [Risk] テンプレートへの追記で既存の Result YAML キー行を誤って改変し、
  `step-output-templates.test.ts` の「contains Result YAML keys」テストを赤にする
  → Mitigation: 既存の Result YAML キー（`result:` / `total:` / … / `blocked_reasons:`）を保持し、
  追記は HTML コメント内の説明文に限定する。schema は不変。

- [Risk] materialize prompt への追記が `## Method` に新規 h2 を持ち込み、既存の 5 節骨格テストを赤にする
  → Mitigation: 追記は既存の `## Contract` 節の write-set 行（`test-cases.md は変更禁止`）の注記として置き、
  新規 h2 を作らない。5 節見出しと順序を保つ。

- [Risk] docstring 検査テストが `Result YAML` の全出現を禁止すると、実態注記（「Result YAML は parse されない」）
  まで巻き込んで矛盾する
  → Mitigation: テストは inaccurate な claim（`Result YAML block (all keys)` を machine-parsed とする記述）
  のみを禁止対象とし、実態を説明する注記は許容する。tasks で禁止対象文字列を厳密に指定する。

## Open Questions

なし。スコープ・enum 意味・検証手段はいずれも request と現状コードで確定している。
