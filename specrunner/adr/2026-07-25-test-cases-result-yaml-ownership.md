# ADR: test-cases.md の Result YAML の所有権を test-case-gen に固定し、意味を canon で確定する

- **Date**: 2026-07-25
- **Status**: Accepted
- **Slug**: test-cases-result-yaml-ownership

## Context

`test-cases.md` の末尾には Result YAML ブロック（`result: completed | partial | failed` / `total` / `automated` / `manual` / `must` / `should` / `could` / `blocked_reasons`）が存在する。しかし `result` が「何の結果か」を template・prompt のどこも定義していなかった。

実態は **test-case-gen によるテストケース生成の結果記録**であり、生成時に一度だけ書かれる確定値である。しかし意味が未定義のため、後続ステップの agent から見ると**ライフサイクルフィールド**（作業が進んだら更新すべき状態欄）に見える。

実運用（外部 repo、specrunner 0.4.x）で test-materialize の agent が実装完了後に Result ブロックを `result: completed` へ更新しようとし、write-scope 検証（test-materialize は `test-cases.md` への合法な書込を持たない）で halt した。ガードは設計どおり機能したが、**誤読を誘発する意味の欠落が canon 側に残っていた**。

加えて、`TEST_CASES_TEMPLATE` 直前の docstring が `Result YAML block (all keys)` を `Machine-parsed fields:` の一つとして主張していたが、pipeline のいかなるコードも Result YAML を parse しない（`src/core/verification/test-coverage.ts` の `extractMustTcIds` が machine-parse するのは TC-NNN heading と `Priority` / `Category` フィールドのみ）。docstring の虚偽の契約が誤読をさらに助長していた。

## Decision

意味の確定を、次の 3 つの canon 表面への文言追加のみで行う。コードの挙動（write-scope・schema・coverage 検査）は変更しない。

1. **`TEST_CASES_TEMPLATE` の Result ブロック要求コメント** — 所有者（test-case-gen）・書込時点（生成時に一度）・enum 意味を明記する。
2. **`TEST_CASE_GEN_SYSTEM_PROMPT`** — enum 意味の定義と「生成完了時点で確定し、後続ステップは書き換えない」確定規則を追記する。
3. **`TEST_MATERIALIZE_SYSTEM_PROMPT`** — Result YAML は生成時の記録であり、テスト実装の完了状態を反映するフィールドではなく、実装完了後も更新しない旨を追記する。

`result` の enum 意味は次の 1 つの定義に統一し、上記 3 表面で一致させる:

- `completed` = 全 TC の設計が完了し `blocked_reasons` が空
- `partial` = 一部 TC が設計不能で `blocked_reasons` に記録あり
- `failed` = 生成自体が成立しなかった

また `TEST_CASES_TEMPLATE` docstring の `Result YAML block (all keys)` を machine-parsed とする記述を除去し、実態（TC-NNN heading と Priority / Category が machine-parse 対象）に整合させる。

## Design Decisions

### D1: 意味の確定は 3 つの canon 表面への文言追加のみで行う（コード挙動は不変）

**選択**: `step-output-templates.ts`・`test-case-gen-system.ts`・`test-materialize-system.ts` の文言のみ変更する。write-scope ガード・Result YAML schema・test-coverage 検査は変更しない。

**理由**: 事故の根は「意味の欠落」であり、機構の欠陥ではない。write-scope ガードは正しく halt した。agent が判断を迫られる場面（「この Result 欄は更新すべきか？」）を、判定を要さない明文で消すのが最小かつ根本の対策。parser / schema / 権限のいずれを触っても agent の誤読は消えず、複雑さだけが増える。

**却下案**:

- Result ブロックの削除 — `blocked_reasons` は設計不能 must TC の唯一の記録経路であり、削除すると生成の不完全性が無言化する。既存 repo の `test-cases.md` との互換も壊れる。
- test-materialize に Result 更新を許可 — 「test-cases.md は test-case-gen の正典」(#880) の逆行。materialize の完了状態は verification / coverage 検査が機械的に判定するものであり、canon への自己申告欄を追加する必要がない。
- Result YAML の機械 parser 導入による整合検査 — 消費者のいない parser の新設は複雑化のみ。誤読の排除には parse ではなく意味の明文化が必要。

### D2: enum の意味は 1 箇所の定義として 3 表面で共有する（文言の一致をテストで固定）

**選択**: テンプレートと gen prompt で同一の enum 意味を持たせ、prompt contract テストで両表面に同じ定義が存在することを固定する。実装上は各ファイルに同一の散文を記述する（import での DRY 化はしない）。

**理由**: テンプレートと prompt で enum の意味が食い違うと再び誤読の余地が生まれる。文言の重複はテストで一致を担保すれば足りる。テンプレート（`src/templates/`）と prompt（`src/prompts/`）は別レイヤであり、片方向 import を増やすと leaf 構造が濁る。この規模では過剰な抽象化を避ける。

### D3: docstring は machine-parse の実態を反映する（Result YAML を machine-parsed から外す）

**選択**: `TEST_CASES_TEMPLATE` 直前 docstring の `Machine-parsed fields:` 列挙から `Result YAML block (all keys)` と `Summary section (4 items)` を除去し、実態（machine-parse 対象は `### TC-NNN` heading と `**Priority**` / `**Category**` フィールド）に合わせる。`Result YAML block is NOT machine-parsed` の注記を追加する。

**理由**: `test-coverage.ts` の `extractMustTcIds` が唯一の machine-parser であり、読むのは TC heading と Priority / Category のみ。現記述は実態と食い違う虚偽の契約であり誤読の温床になる。実態と一致する docstring が最も信頼できるドキュメントになる。

### D4: 検証はテンプレート文言テスト + prompt contract テストで固定（既存テストは無改変）

**選択**: 新規テストファイル（`tests/unit/prompts/result-yaml-ownership.test.ts`）で文言テストを追加する。既存テストファイルは改変しない。

**理由**: 変更対象が canon 文言そのものであるため、文言テストが唯一の適切な歯（tooth）になる。docstring は runtime 値でなくコメントなので、source ファイルを `readFileSync` で読んで検査する（既存の `prompt-skeleton-drift-guard.test.ts` と同じ手法）。新規テストを別ファイルに置くことで「既存テストが無改変で green」を厳密に保証する。

## Alternatives Considered

### Alternative 1: Result ブロック自体を削除する

`test-cases.md` の末尾から Result YAML ブロック全体（`result` / `total` / `automated` / `manual` / `must` / `should` / `could` / `blocked_reasons`）を削除し、誤読の源を物理的に取り除く案。

- **Pros**: 誤読の余地が完全になくなる。フォーマットが単純になる。
- **Cons**: `blocked_reasons` は設計不能な must TC の唯一の記録経路であり、削除すると生成の不完全性が無言化する。既存 repo の `test-cases.md` との後方互換も壊れる。
- **Why not**: 記録経路の消去は「問題を見えなくする」だけで根本解決にならない。`blocked_reasons` の情報価値は保持する必要があり、互換コストも許容できない。

### Alternative 2: test-materialize に Result YAML の更新を許可する

test-materialize の write-scope に `test-cases.md` の Result YAML 部分への書込を追加し、実装完了後に agent が `result: completed` へ更新できるようにする案。

- **Pros**: agent の自然な行動（実装完了 → 完了状態を記録）と一致する。halt が起きなくなる。
- **Cons**: 「test-cases.md は test-case-gen の正典」(#880) の逆行。materialize の完了状態は verification / coverage 検査が客観的に判定するものであり、canon への agent の自己申告欄を作ると信頼性が下がる。write-scope の保護を部分的に緩めると他ステップも同様の例外を求める前例になる。
- **Why not**: 完了状態の正典は verification gate であり agent の自己申告ではない。canon 保護を逆行させることなく、意味の欠落を埋める方が根本解決になる。

### Alternative 3: Result YAML の機械 parser を導入して整合検査する

pipeline に Result YAML の parser を追加し、`result` の値が enum 定義と一致するかを検証する案。

- **Pros**: 不正な `result` 値を機械的に検出できる。enum の意味が実装レベルで強制される。
- **Cons**: 現時点で Result YAML を消費する処理が存在しない（消費者のいない parser の新設）。実装・維持コストが生まれ、複雑さが増す。parser を追加しても agent が「どのステップが更新すべきか」という誤読をする場面は消えない。
- **Why not**: 意味の欠落という根本原因は parser で解消できない。消費者がいない段階での parser 新設は複雑化のみであり、意味の明文化が先決。

## Consequences

- `TEST_CASES_TEMPLATE` の Result ブロックコメントが所有者・書込時点・enum 意味を明記し、agent が「更新すべきか？」と判断する場面が消える。
- test-materialize の agent は Result YAML が生成時の記録であることを prompt から直接理解できる。materialize の完了状態との混同による halt クラスが再発しなくなる。
- docstring が machine-parse の実態（TC-NNN heading + Priority / Category のみ）と一致し、誤った前提でのコード追加が起きにくくなる。
- Result YAML のキー集合・write-scope・coverage 検査の挙動はすべて不変。既存 repo の `test-cases.md` との互換を維持する。
- 「agent が判断する場面を canon の明文で消す」アプローチが確立し、同様の誤読パターンへの対処方針として参照できる。

## References

- Request: `specrunner/changes/test-cases-result-ownership/request.md`
- Design: `specrunner/changes/test-cases-result-ownership/design.md`
- Related ADR: `specrunner/adr/2026-06-02-test-case-gen-scenario-primary-source.md`（test-case-gen が test-cases.md の primary 生成者である決定）
- Related ADR: `specrunner/adr/2026-06-07-protected-paths-merge-guard.md`（test-cases.md を canon protected path として保護する決定）
- #880: test-cases.md は変更禁止（test-materialize の Contract に明記）
