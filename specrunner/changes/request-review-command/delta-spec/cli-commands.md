# Delta Spec: cli-commands

Baseline: `specrunner/specs/cli-commands/spec.md`

## ADDED

### R-request-review-command: `specrunner request review <file>` subcommand

- `specrunner request review <file>` サブコマンドを提供する
- `<file>` は request.md ファイルへのパス（必須 positional 引数）
- `--json` フラグ（boolean）を受け付ける
- コマンド実行前に `parseRequestMdContent()` でフォーマット検証を行い、不正なファイルは stderr にエラーを出力して exit 1 で終了する
- フォーマット検証通過後、Claude Agent SDK の `query()` を直接呼び出して architect レビューを実行する
- レビュー結果の verdict は `approve` / `needs-discussion` / `reject` の 3 値のいずれかで返す
- exit code: `approve` → 0, `needs-discussion` → 0, `reject` → 1
- デフォルト（`--json` なし）出力: エージェントの full markdown テキストを stdout に書き出す
- `--json` 出力: 以下のスキーマの JSON を stdout に書き出す:
  ```json
  {
    "verdict": "approve | needs-discussion | reject",
    "findings": [
      { "severity": "HIGH | MEDIUM | LOW", "category": "string", "description": "string" }
    ],
    "summary": "string"
  }
  ```
- Pipeline machinery（StepExecutor / AgentStep / JobState）を使用しない stateless な one-shot コマンドである
- ファイル出力なし、状態管理なし、worktree 不要
