# Decision Log: test-case-generator

## Decisions

- must priority を pipeline-context.md の 7 must-areas すべてに割り当てる :: 各 must-area は中核機能の振る舞い不変を証明するものであり、欠落すると refactoring の acceptance 基準を満たせないため

- 旧 schema normalization テスト (TC-001〜TC-004) を unit と integration に分ける :: TC-001/TC-002 は `JobStateStore.load()` 単体の純粋ロジック検証、TC-003/TC-004 は fixture ファイルから disk への round-trip を含む I/O 統合検証であり、観点が異なるため分離する

- 既存 161 テスト全 PASS を TC-030 として integration / must で単独ケース化する :: proposal.md が "meta-must" と明示しており、すべての must-area を上回る最上位 acceptance criterion であるため独立したケースとして記録する

- CLI stdout フォーマット 3 パターン (TC-027〜TC-029) を別々のテストケースとして記述する :: approved / needs-fix / exhausted の各 stdout 文字列は bit-for-bit 一致を要求しており、1 ケースにまとめると assertion 失敗時の特定が困難になるため個別に定義する

- モジュール境界 grep テスト (TC-033〜TC-035) を integration / must とする :: `grep` コマンドはソースツリー全体を走査する統合的な検証であり、ビルド成果物の依存方向を直接確認するため integration カテゴリとする。また module-boundary spec の中核要件であるため must とする

- ファイルレイアウト確認 (TC-032, TC-036〜TC-038, TC-053, TC-054) を manual カテゴリとする :: これらはビルドアーティファクトやディレクトリ構造の目視確認であり、CI の grep/ls で代替可能だが spec では自動化の実装方法を規定しないため manual に分類する

- EventBus の subscriber 0 動作 (TC-021) を must とする :: v1 で subscriber を持たないまま merge するため、emit 時に例外が発生しないことがすべての pipeline lifecycle emit の前提条件となるため

- error code テストを TC-022〜TC-026 の 5 + 1 構成とする :: 個別エラーコード 5 件はそれぞれ独立した trigger 条件を持ち、まとめテスト (TC-026) は "5 種すべて" を integration レベルで横断確認する観点が異なるため重複とみなさない

- register_branch input_schema の不変確認を TC-012 として must とする :: pipeline-context.md の test-cases must-areas に "register_branch tool input_schema unchanged" が明示されており、Custom Tool 同居化の副作用で schema が変わる最大リスク箇所であるため

- StepExecutor の constructor injection unit test (TC-040) を should とする :: SDK mock の代替可能性は重要だが、TC-013/TC-014 の lifecycle テストが振る舞い不変を直接検証するため中核 must には含めない
