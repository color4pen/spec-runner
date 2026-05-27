# resume --prompt 使用時に CLI 警告を表示する

## Meta

- **type**: spec-change
- **slug**: resume-prompt-injection-warning
- **base-branch**: main
- **adr**: false
- **issue**: #428

## 背景

`specrunner job resume --prompt` の値は `<resume-context>` タグで agent prompt に注入される（`src/adapter/claude-code/agent-runner.ts:151-152`）。agent は `bypassPermissions` + Bash 許可で動作するため、`--prompt "$(curl ...)"` のような shell expansion 経由で外部入力が混入すると prompt injection になりうる。

one-shot consumption（最初の1 step で消費後 undefined 化）で影響範囲は限定されるが、その1 step で十分にリスクがある。

## 対象ファイル

- `src/cli/command-registry.ts` — resume handler 内で `--prompt` / `--prompt-file` が指定された場合、`stderrWrite()` で「Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください」を表示する。`stderrWrite()` は log level に関係なく常時出力されるため `--quiet` でも表示される

## 設計判断

- 入力サニタイズや文字制限は行わない。理由: resume --prompt は escalation 後にユーザーが手動で追加指示を送る機能であり、自由記述が本来の用途。制限すると本来の利便性を損なう
- 警告は `stderrWrite()` で stderr に1行で表示する。`logWarn()` は `--quiet` で抑制されるため使わない

## スコープ外

- `<resume-context>` タグのエスケープ処理
- --prompt の入力値バリデーション / 文字制限
- agent-runner.ts 側の構造変更

## 受け入れ基準

- `--prompt` または `--prompt-file` 指定時に stderr に「--prompt の内容は agent prompt に直接注入」を含む警告メッセージが表示されること
- `--quiet` モードでも警告が表示されること（`stderrWrite()` 使用のため）
- `--prompt` 未指定時は警告が表示されないこと
