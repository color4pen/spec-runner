# config schema の手書きバリデータを zod ベースに移行する

## Meta

- **type**: refactoring
- **slug**: config-schema-zod-migration
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/config/schema.ts` の validateConfig は 500 行超の手書きバリデーションで、config にフィールドを追加するたびに型定義と検証ロジックを手動で同期する必要があり、検証漏れのリスクがある。zod は既存依存（report_result tool schema で zod/v4-mini を使用中）であり、config 検証への採用は依存を増やさない。

## 要件

1. validateConfig の検証ロジックを zod/v4-mini スキーマベースに置き換え、型定義とバリデーションの情報源を一本化する
2. エラー契約の維持: 既存の ERROR_CODES / exit code / hint の体系を維持する。zod の素の検証エラーメッセージをユーザーにそのまま露出させず、現行どおり機械可読コード + 人向け hint の形式に変換する
3. スキーマで表現できない複雑条件（byRequestType の nested 禁止等）は、スキーマ検証後の独立した後段チェックとして分離し、validateConfig 内の if-then 連鎖に戻さない
4. config の読み込み・migration（legacy field 削除）経路の既存挙動を変えない

## 外部制約

- zod/v4-mini は `array` / `object` / `union` / `literal` / `optional` と `toJSONSchema` をサポートしている（report-tool.ts で使用実績あり）
- `src/core/port/report-result.ts` の parseInput は tree-shaking 安定性のため意図的に手書き（no zod parse/refine）とされている。この方針は report_result 側に限定されたものであり、config 検証への zod parse 採用とは独立

## スコープ外

- report_result parseInput の zod 化（手書き方針を維持）
- config スキーマへのフィールド追加・仕様変更
- config ファイルのフォーマット変更・migration 追加

## 受け入れ基準

- [ ] validateConfig の手書き型チェック連鎖が zod スキーマ検証に置き換わっている
- [ ] 既存の config validation テストが（エラーコード・exit code・hint を含めて）変更なしで green
- [ ] 不正 config 入力に対するエラーメッセージの形式が現行と互換である
- [ ] スキーマに無いフィールドの検出・必須フィールドの欠落検出が現行と同等以上である
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- zod 使用を tool schema に限定してきた従来方針からの変更にあたるため adr: true とする。判断根拠は「検証ロジックの手動同期コスト > 依存追加コスト（ゼロ: 既存依存）」
