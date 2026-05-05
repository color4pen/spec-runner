# code-fixer decisions: add-local-runtime-agentrunner-port

## Fix #1 (HIGH) — state management lifted into StepExecutor for local runtime path

`StepExecutor.runAgentStep` の fallback ブランチ（`_updatedState` なし）に、`JobStateStore` を使った state 永続化を追加する :: managed adapter は自分で state を管理して `_updatedState` を返すが、`ClaudeCodeRunner` は port の公式フィールドのみを返す設計であり、fallback ブランチが `jobState` をそのまま返すのは silent state drop になる。managed adapter に手を入れず、local runtime が `_updatedState` なしで動けるよう executor 側で補完するのが最小変更かつ安全。

Option (a)（managed adapter からも state 管理を剥がして executor に集約）は正しい方向だが、managed adapter の全エラーパス・session lifecycle を同時に動かすのは大規模リファクタになり regression リスクが高い。review は「either (a) or (b)」としており、local runtime の bug を潰すには (b) 相当のアプローチで十分。

## Fix #2 (HIGH) — integration test TC-146 追加

`tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` を新規作成 :: must シナリオが全て unit 分離レベルで書かれており、executor ↔ runner の wiring が壊れていても検出できなかった。integration boundary を 1 本通す回帰テストが欠けていた。成功パス・エラーパスの両方を追加。

## Fix #4 (MEDIUM) — --runtime 不正値で fail-fast

`bin/specrunner.ts` の `--runtime=` パーサーで、`"managed"` / `"local"` 以外の値を受け取ったら `process.exit(2)` する :: typo（例: `--runtime=manage`）が silent に managed として動いてしまう。`finish` サブコマンドの unknown-flag 処理と同じパターンで一貫性を持たせる。

## Fix #6 (MEDIUM) — ENOENT エラーにユーザー向け hint を付加

`ClaudeCodeRunner.runSubprocess` の catch で `cause` を保存し、ENOENT 時は `claude CLI not found` の hint を付与 :: spawn error の `code` が `CLAUDE_CODE_SUBPROCESS_FAILED` に包まれて消えており、ユーザーが PATH 問題か実行権限問題かを判断できなかった。`cause` を error オブジェクトに残し、ENOENT の場合は `CLAUDE_BIN` 設定手順を hint として提示する。
