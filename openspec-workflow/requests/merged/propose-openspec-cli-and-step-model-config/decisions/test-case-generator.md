# Test Case Generator Decisions

## TC-001〜006: AgentStep.maxTurns と ClaudeCodeRunner の振る舞いを unit テストとして分離する :: maxTurns の伝達は型定義（types.ts）と実行（agent-runner.ts）の 2 レイヤーに分かれており、それぞれ独立してテスト可能。integration テストより失敗箇所の特定が容易

## TC-004〜005: 設計/レビューと実装/修正の model 設定を 2 つの TC に分割する :: 対称的な要件（Opus vs Sonnet）であり、一方が壊れてもう一方が通る状況を検出するために分ける。1 つにまとめると失敗箇所が不明瞭になる

## TC-007〜009: openspec CLI の 3 コマンドを個別の TC に分割する :: `openspec new change`, `openspec status --json`, `openspec instructions` はそれぞれ独立した system prompt の記述要件。1 コマンドの記述が欠落しても他は通る可能性があり、分割することで欠落を特定できる

## TC-010〜011: path-fence と完了条件を独立した TC にする :: system prompt の大幅書き換えで既存の安全装置（path-fence / 完了条件）が消える regression リスクがある。design.md T4.1 が「維持する」と明示しているため、must 領域の regression 検出として独立させる

## TC-013〜014: delta spec 省略防止と openspec CLI 実行確認を manual TC にする :: agent の実際の行動（Bash ツール呼び出しのログ）を自動テストで検証する手段がない。E2E テストフレームワークで agent セッションのログを解析する仕組みが現時点で存在しないため manual とする

## TC-013〜014 を must にする :: pipeline-context.md の must-areas に「openspec CLI integration in propose」が指定されており、これが core 機能。自動テストで担保できない部分であっても must の priority を付け、manual で確認義務を明示する

## TC-020: maxTurns 上限到達時のエラーハンドリングを should にする :: design.md の Risks に記載された既知のリスクだが、既存のエラーハンドリングで処理される旨が設計で言及されている。中核機能ではなく防御的なカバレッジであるため should とする

## TC-022 を should・manual にする :: step ごとの model がログで確認できるかは「設定値が正しいこと」（TC-004〜005 が担保）とは別の観察軸だが、実行環境依存のためユニットテストでは検証不可。should にして manual 確認の項目として残す

## TC-023〜025 を could にする :: openspec CLI 未インストール、maxTurns の turn 数充足性、パイプライン全体の副作用は重要なリスクだが、中核機能の成否に直接影響しない観察項目。初期実装では省略可能と判断する
