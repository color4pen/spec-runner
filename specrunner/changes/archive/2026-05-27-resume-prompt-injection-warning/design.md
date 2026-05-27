# Design: resume --prompt 使用時に CLI 警告を表示する

## 変更概要

`specrunner job resume --prompt` または `--prompt-file` が指定された場合、agent prompt への直接注入リスクを警告するメッセージを stderr に表示する。

## 対象ファイル

- `src/cli/command-registry.ts` — resume handler 内に `stderrWrite()` による警告を追加

## 設計

### 警告の挿入位置

`command-registry.ts` の resume handler 内で `resolvedPrompt` が確定した直後（L432 付近）、`resolvedPrompt !== undefined` の場合に `stderrWrite()` で警告を出力する。

```typescript
if (resolvedPrompt !== undefined) {
  stderrWrite("Warning: --prompt の内容は agent prompt に直接注入されます。外部入力をそのまま渡さないでください。");
}
```

### stderrWrite を使う理由

- `logWarn()` は `--quiet` で抑制される（`isLevelEnabled("default")` チェック）
- `stderrWrite()` は log level に関係なく常時 stderr に出力される
- セキュリティ警告は `--quiet` でも表示すべきなので `stderrWrite()` が適切

### スコープ外（request.md 記載通り）

- `<resume-context>` タグのエスケープ処理
- `--prompt` の入力値バリデーション / 文字制限
- `agent-runner.ts` 側の構造変更

## Delta spec

baseline `cli-resume-command` に要件を追加する。配置: `specrunner/changes/resume-prompt-injection-warning/specs/cli-resume-command/spec.md`
