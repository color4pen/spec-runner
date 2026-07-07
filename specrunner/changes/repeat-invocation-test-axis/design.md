# Design: test-case-gen に繰り返し実行・冪等性の導出軸を追加する

## Context

「1 回目の呼び出しは成功するが 2 回目で壊れる」型の欠陥（module スコープの server/client への
再 connect、資源の二重初期化、状態残留による冪等性の破れ）は、テストスイートが単発呼び出ししか
検証しない場合、verification / code-review を含む全ゲートを素通りする。runtime の再実行性を
静的レビューで確実に予見するのは難しい。最も安価な対策は、テストケース導出の段階で
「繰り返し実行」の観点を機械的に要求し、テスト自体に 2 回目の呼び出しを含めさせることである。

現状:
- `src/prompts/test-case-gen-system.ts` の `TEST_CASE_GEN_BASE` に、繰り返し実行・冪等性
  （冪等 / 繰り返し / 再実行 / repeat / idempot）に該当する導出軸の記述は無い（grep 0 件）。
- `specrunner request template`（`src/core/command/request.ts` の `buildScaffoldTemplate`）が
  出力する scaffold の `## 受け入れ基準` ガイダンス（HTML コメント）にも同観点は無い。
- `src/prompts/implementer-system.ts` の実装手順で、implementer は test-cases.md の must TC を
  全て実装する契約（`- test-cases.md が存在する場合、must のテストケースは全て実装する`）。
  したがって test-case-gen が must TC として導出すれば、テストコードへの反映は既存契約で担保される。

本変更は **分布改善**（テストが導出される確率を上げる）であり、機械保証ではない。
実行の事実の保証は lcov 変更行ゲート（別 request）、プロセス起動を伴う smoke 検証は既存
`verification.commands` で宣言可能（CLI 変更不要）という分担を前提とする。

## Goals / Non-Goals

**Goals**:

- test-case-gen prompt に繰り返し実行・冪等性の導出軸を追加し、全 request で検討を強制、
  非該当時は「該当なし」明示を要求する（無言の省略を許さない）。
- `specrunner request template` の受け入れ基準ガイダンスに同観点を追記する。
- 上記 2 点を、既存の prompt / template テスト規約に従うテストで固定する。

**Non-Goals**:

- verification でのプロセス起動 smoke test 機構の新設（既存 `verification.commands` で表現可能）。
- concurrency（並行実行・競合）の観点（別軸・将来）。
- 既存 request / 既存テストへの遡及適用。
- テストが実際に実行されたかの機械検証（lcov 変更行ゲートの領分）。
- `TEST_CASES_TEMPLATE` の機械 parse 形式・TC-ID 契約・must/should 区分の意味の変更。
- `src/prompts/request-generate-system.ts`（request generator agent）の変更（D3 参照）。

## Decisions

### D1: 軸の適用可否を agent 判断に残さず、全 request で検討を強制し「該当なし」を明示させる

prompt には「全 request でこの観点を検討する」ことを無条件で書き、該当時は must TC を導出、
非該当時は test-cases.md に「該当なし」を明示させる。これにより「無言の省略」と
「検討した上で該当なし」を区別可能にする。

- Rationale: 判断場面を消す原則。適用可否を agent の暗黙判断に委ねると適用漏れの根になる。
- Alternatives considered:
  - 「server 型の request のときだけ軸を適用する」判定を agent に委ねる案 → 判断場面が残り、
    適用漏れの根になるため却下（architect 却下済み）。

### D2: must TC 化で implementer の既存契約に載せ、新しい機構を作らない

繰り返し実行 TC を **must** として導出させる。implementer は must TC を全て実装する既存契約を
持つため、テストコードへの反映は追加機構なしで担保される。

- Rationale: 既存の contract chain（test-case-gen must TC → implementer 全実装）に載せるのが
  最小コスト。新機構は保守面の負債になる。
- Alternatives considered:
  - CLI に smoke 実行機構（N 回実行等）を新設する案 → 既存 `verification.commands` で
    `2 回実行するコマンド` を宣言でき、製品面の拡大に見合わないため却下（architect 却下済み）。
  - reviewer に「再実行性を読む」観点を足す案 → runtime プロパティの静的予見は不確実で
    保証にならないため却下（architect 却下済み）。

### D3: 要件 2 の適用箇所は `buildScaffoldTemplate`（request.ts）であり、request-generate-system.ts ではない

要件 2 の「request template の受け入れ基準ガイダンス」は、`src/core/command/request.ts` の
`buildScaffoldTemplate`（`specrunner request template` / `request new` の scaffold 出力）を指す。
その `## 受け入れ基準` セクションには受け入れ基準の書き方ガイダンス（`<!-- コツ: 機械検証できる
文にする… -->`）が既に存在し、ここが追記対象である。

- Rationale: 受け入れ基準 2「**request template の出力**に同観点のガイダンスが含まれることを
  テストで固定する」の「request template の出力」は `specrunner request template` の stdout 出力
  （`executeTemplate` → `buildScaffoldTemplate`）を一意に指す。request.md の現状前提は
  `request-generate-system.ts` を挙げるが、これは自由文 → request.md を生成する
  **request generator agent** であって「request template」ではない。受け入れ基準（機械検証可能な
  正典）が適用箇所を確定させる。
- Alternatives considered:
  - `request-generate-system.ts` を変更する案 → それは request generator であり "request template"
    ではない。受け入れ基準 2 の対象外であり、スコープ拡大になるため却下。
  - 両方（scaffold + generator prompt）を変更する案 → 受け入れ基準に無い変更でスコープが広がる。
    要件 2 は単一の template ガイダンスを対象とするため却下。

### D4: 「該当なし」明示は自由記述の注記で表現し、test-cases.md の形式契約を変えない

繰り返し実行・冪等性の軸の結果（導出した must TC-ID もしくは「該当なし」）は、test-cases.md 内の
自由記述の注記として書かせる。`TEST_CASES_TEMPLATE` の機械 parse 対象（`### TC-{NNN}` heading、
Summary の 4 項目、Result YAML キー、TC-ID 形式、must/should/could の意味）は一切変更しない。

- Rationale: 要件 3（既存契約の不変）を満たす。機械 parse される新フィールドを追加すると
  既存 template テストや downstream parser に影響しうる。prose 注記なら形式に非侵襲。
- Alternatives considered:
  - `TEST_CASES_TEMPLATE` に専用の機械 parse セクションを追加する案 → 形式契約の変更にあたり、
    要件 3 と受け入れ基準 3（既存テスト無変更 green）に反するため却下。

### D5: prompt 文字列 / template 出力のテストで固定する

固定対象は「prompt / template の文言に導出軸ガイダンスが含まれること」。これは既存の
prompt テスト（例: `tests/prompts/test-case-gen-system.test.ts`、
`tests/unit/core/command/request.test.ts`）と同じく文字列 assertion で表現する。
agent が実際に TC を導出する runtime 挙動は LLM 実行の領分で、既存 prompt rule により
vitest の対象外（分布改善であって機械保証ではない）。

- Rationale: この request の機械検証可能な成果は「指示が prompt/template に存在すること」であり、
  それを既存規約に沿って固定するのが honest かつ regression 検知に十分。
- Alternatives considered:
  - 生成された test-cases.md 出力を検証する e2e テスト → LLM 呼び出しを伴い、既存 prompt rule
    （LLM 呼び出しは vitest 化しない）に反するため却下。

## Risks / Trade-offs

- [Risk] 分布改善に留まり、agent が誤って「該当なし」と判定して漏れる
  → Mitigation: 検討を全 request で強制し「該当なし」を明示させることで、無言の省略と区別でき、
  レビューで可視化される。実行の事実の機械保証は lcov 変更行ゲート（別 request）の領分。
- [Risk] `buildScaffoldTemplate` への追記で `parseRequestMdContent` が壊れる／既存 request.test.ts が
  fail する → Mitigation: 追記は既存の `## 受け入れ基準` の HTML コメント内に閉じ、checkbox を
  増やさない。セクション順序・見出しは変えない。
- [Risk] prompt の肥大化 → Mitigation: 追加は簡潔な 1 セクションに限定する。
- [Risk] 既存 test-case-gen-system.test.ts の負の assertion（`not.toContain("e2e")`、
  ``not.toContain("greps `tests/`")``）に抵触する文言を追記してしまう
  → Mitigation: 追記文言に `e2e` や ``greps `tests/`` を含めない。

## Open Questions

None（architect 評価済み。採用・却下は request の「architect 評価済みの設計判断」に記録済み）。
