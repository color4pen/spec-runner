# test-case-gen に繰り返し実行・冪等性の導出軸を追加する

## Meta

- **type**: spec-change
- **slug**: repeat-invocation-test-axis
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

「1 回目の呼び出しは成功するが 2 回目で壊れる」型の欠陥（例: module スコープの server/client に毎回 connect して 2 回目で失敗する handler、資源の二重初期化、状態残留による冪等性の破れ）は、テストスイートが単発呼び出ししか検証しない場合に verification / code-review を含む全ゲートを素通りする。runtime の再実行性を静的レビューで確実に予見するのは難しく、最も安価な対策はテストケース導出の段階で「繰り返し実行」の観点を機械的に要求し、テスト自体に 2 回目の呼び出しを含めさせることである。

現状の test-case-gen prompt には繰り返し実行・冪等性の観点を要求する記述が存在しない（grep 0 件）。観点の適用可否を agent の暗黙判断に任せると漏れの根になるため、全 request で検討を強制し、該当しない場合も「該当なし」を明示させる。

なお本 request は分布改善（テストが導出される確率を上げる）であり機械保証ではない。実行の事実の保証は lcov 変更行ゲート（別 request）、プロセス起動を伴う smoke 検証が必要な repo は既存の `verification.commands` で宣言可能（CLI 変更不要）という分担を前提とする。

## 現状コードの前提

- `src/prompts/test-case-gen-system.ts` が test-cases.md の導出を指示する。「冪等 / 繰り返し / 再実行 / repeat / idempot」に該当する記述は無い（grep 0 件）。
- `src/prompts/request-generate-system.ts` が request template（受け入れ基準ガイダンスを含む）の生成を指示する。
- `src/prompts/implementer-system.ts:42` implementer は test-cases.md の must TC を全て実装する契約。従って test-case-gen が must TC として導出すれば、テストコードへの反映は既存契約で担保される。

## 要件

1. **test-case-gen の導出軸追加**: test-case-gen prompt に「繰り返し実行・冪等性」の観点を追加する。全 request でこの観点の検討を強制し、該当が無い場合は test-cases.md に「該当なし」を明示させる（無言の省略を許さない）。server / handler / 接続 / 初期化 / 資源管理系の成果物に該当する場合は、同一操作の連続呼び出し（2 回目以降）を検証する **must** TC として導出させる。
2. **request template への追記**: request template の受け入れ基準ガイダンスに、繰り返し実行・冪等性の観点（該当する成果物では 2 回目の呼び出しを受け入れ基準に含めること）を追記する。
3. **既存契約の不変**: test-cases.md の形式・TC-ID 契約・must/should 区分の意味は変えない。

## スコープ外

- verification でのプロセス起動 smoke test 機構の新設（必要な repo は既存 `verification.commands` で `2 回実行するコマンド` を宣言可能。CLI 変更は不要）。
- concurrency（並行実行・競合）の観点（別軸。将来）。
- 既存 request / 既存テストへの遡及適用。
- テストが実際に実行されたかの機械検証（lcov 変更行ゲートの領分）。

## 受け入れ基準

- [ ] test-case-gen prompt に繰り返し実行・冪等性の導出軸と「該当なし」明示の指示が含まれることを、既存の prompt テスト規約に従いテストで固定する。
- [ ] request template の出力に同観点のガイダンスが含まれることをテストで固定する。
- [ ] 既存テストが無変更で green（test-cases.md の形式・既存契約に影響しない）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- 観点の適用可否を agent 判断に残さず、全 request で検討を強制して「該当なし」を明示させる形にする（判断場面を消す原則。無言の省略と「検討した上で該当なし」を区別可能にする）。
- must TC 化により、テストコードへの反映は implementer の既存契約（must 全実装）に載せる。新しい機構を作らない。

**却下**

- 「server 型の request のときだけ軸を適用する」判定を agent に委ねる案: 判断場面が残り、適用漏れの根になる。
- CLI に smoke 実行機構（N 回実行等）を新設する案: 既存 `verification.commands` で表現可能であり、製品面の拡大に見合わない。
- reviewer に「再実行性を読む」観点を足す案: runtime プロパティの静的予見は不確実で、保証にならない。
