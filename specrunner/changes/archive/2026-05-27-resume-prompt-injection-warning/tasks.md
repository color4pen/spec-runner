# Tasks: resume --prompt 使用時に CLI 警告を表示する

## [x] T1: resume handler に stderrWrite 警告を追加

- **file**: `src/cli/command-registry.ts`
- **action**: resume handler 内、`resolvedPrompt` 確定後（`} else { resolvedPrompt = promptText; }` ブロックの直後、`const logLevel = resolveLogLevel(...)` の直前）に以下を追加:
  ```typescript
  if (resolvedPrompt !== undefined) {
    stderrWrite("Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。");
  }
  ```
- **note**: `stderrWrite` は既に import 済み（L33）

## [x] T2: delta spec を追加

- **file**: `specrunner/changes/resume-prompt-injection-warning/specs/cli-resume-command/spec.md`
- **action**: `cli-resume-command` baseline に対する delta spec を作成。以下の requirement を追加:
  - `--prompt` または `--prompt-file` 指定時に stderr に「--prompt の内容は agent prompt に直接注入」を含む警告メッセージを表示する
  - `--quiet` モードでも警告が表示される（`stderrWrite()` 使用）
  - `--prompt` 未指定時は警告が表示されない

## [x] T3: テスト追加

- **file**: 既存の resume 関連テストファイル、または新規テストファイル
- **action**: 以下のケースをテスト:
  1. `--prompt` 指定時に stderr に警告文が含まれること
  2. `--prompt-file` 指定時に stderr に警告文が含まれること
  3. `--prompt` 未指定時に警告文が含まれないこと
