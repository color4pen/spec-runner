# test-case-generator 決定ログ

## 優先度・カテゴリ判断

- TC-001〜TC-006 (runLoopUntil 4 分岐) を must にする :: pipeline-context.md の must-areas 1 番目「iteration loop primitive (runLoopUntil) — body/evaluator/maxIterations/onExceeded の各分岐」に直接対応するため
- TC-007〜TC-009 (history status / stdout フォーマット) を should にする :: ループ挙動の補足検証であり中核機能には影響しないが品質に寄与する
- TC-010〜TC-016 (runPipeline integration) を must にする :: pipeline-context.md の must-areas 2 番目「spec-review needs-fix → spec-fixer → 再 spec-review の自動連鎖」と 3 番目「retry 上限到達時の escalation + SPEC_REVIEW_RETRIES_EXHAUSTED」に対応するため
- TC-017〜TC-018 (stdout フォーマット) を should にする :: ログ出力は中核機能ではなく UX 品質の領域
- TC-019〜TC-023 (JobState 配列化) を must にする :: pipeline-context.md の must-areas 4 番目「JobState.steps[stepName] の配列化」に直接対応するため
- TC-024〜TC-026 (getAgentId) を must にする :: pipeline-context.md の must-areas 5 番目「config 拡張と backward compat」に対応するため
- TC-027〜TC-031, TC-035 (spec-fixer Agent / step の核心部) を must にする :: pipeline-context.md の must-areas 6 番目「spec-fixer Agent の Custom Tools 不在」と 2 番目の連鎖実装に対応するため
- TC-036〜TC-037 (config schema maxRetries) を must にする :: pipeline-context.md の must-areas 5 番目「config 拡張」に含まれる maxRetries の基本動作
- TC-039 (specrunner init 両 Agent 記録) を must にする :: pipeline-context.md の must-areas 5・6 番目の init 実装を統合的に検証するため
- TC-028 (buildSpecFixerSystemPrompt キーワード) を must にする :: spec-fixer Agent の system prompt は Custom Tools 不在と並ぶ must-area 6 の中核であるため
- TC-029, TC-030 (runSpecFixerStep 正常完了・セッションパラメータ) を must にする :: must-area 6「Custom Tools 不在」と must-area 2「自動連鎖」の検証に不可欠
- TC-032〜TC-034 (runSpecFixerStep エラー/メッセージ) を should にする :: 異常系・詳細動作で中核機能には影響しないが信頼性に寄与する
- TC-038 (maxRetries 上限外) を should にする :: 範囲外のバリエーションは must ではなく補足検証
- TC-040〜TC-043 (init 冪等性詳細) を should にする :: specrunner init の全ケースは TC-039 の must でカバー済み。詳細ケースは should
- TC-044, TC-046 (spec-review step 配列対応) を must にする :: must-area 4「配列化」の step 側実装検証
- TC-045 (iter=2 メッセージのファイル名) を should にする :: iteration ごとのファイル名は TC-044 の must でカバー。詳細は should
- TC-047〜TC-050 を should にする :: 配列化の補足・ps コマンド・step 遷移は中核機能の安定後に検証する品質領域
- TC-051〜TC-052 (session-runner) を should にする :: session-runner は spec-review/spec-fixer step の内部抽象であり、step 単位の must テストでカバーされる
- TC-053 (循環 import) を could にする :: 実装規約の検証であり機能には影響しない。静的解析で代替可能
- TC-054, TC-065 (manual: post-init 実 API) を manual にする :: 実際の Anthropic API 接続が必要で自動化不可
- TC-055〜TC-056 (E2E) を should にする :: 統合検証として重要だが E2E 環境依存があり must とはしない
- TC-057, TC-059 (E2E 補足) を could にする :: E2E の補足ケースで TC-055〜TC-056 のサブセット的内容
- TC-058 (manual: init config 確認) を should/manual にする :: 実際の API 環境での確認が必要
- TC-060〜TC-062 を could にする :: 詳細動作・deferred メモ・push 失敗委任は仕様の補足的側面で初期実装では省略可能
- TC-063 (CLI verdict 出力 RETRIES_EXHAUSTED) を should にする :: エラーコードの CLI 出力は must-area のエラーコード記録とは別軸の UX 検証
- TC-064 (maxIterations=1 の境界値) を could にする :: maxIterations=1 はエッジケースであり中核のシナリオは TC-004 でカバー済み
- TC-066, TC-067 を should にする :: state.step フィールド更新と config 同期書き込みは品質向上のための補足テスト

## テストファイル配置

- tasks.md 規約「テストファイル配置: ユニットテストは `test/` 直下に `<source-file-path>.test.ts`」と既存テストの `tests/` 配置が混在していることを確認 :: 既存テストは `tests/` ディレクトリ（複数形）を使用している。新規テストも既存規約に合わせ `tests/` 配下に配置することで一貫性を保つ。tasks.md の `test/` 記述は typo または旧規約と判断

## ID 採番

- TC-001 から採番する（既存テストの TC-016〜TC-049 との衝突を避けるため TC-001 スタートが正しいか確認） :: pipeline-integration.test.ts には TC-025〜TC-030、spec-review-step.test.ts には TC-016〜TC-021, TC-041, TC-042, TC-049 が存在する。本 test-cases.md は変更セット固有の番号体系で採番し、既存ファイルの TC 番号は実装時に実際のファイル内のコメントを参照することで対応する。オーケストレーターは本ファイルの TC-001 から TC-067 を新規テストケースとして扱う
