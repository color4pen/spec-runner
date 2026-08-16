# Cross-Boundary Invariants Review — Iteration 2

**Reviewer**: cross-boundary-invariants  
**Date**: 2026-08-16  
**Scope**: diff に変更されていない既存コードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないかの検出

---

## Iteration 1 Findings の解消確認

### [resolved] TTY raw mode not restored on SIGTERM

`src/util/secret-input.ts` の `readTTY` 関数は `process.once("exit", onExit)` と `process.once("SIGTERM", onSigterm)` を raw mode 有効化の直後に登録し、`cleanup()` 内で `process.off()` により解除する。  
SIGTERM 経路: `onSigterm → cleanup() → process.kill(process.pid, "SIGTERM")` で raw mode を復元してから default handler で終了。  
正常完了経路: resolve/reject 前に `cleanup()` を呼び両 handler を除去。

**確認したテスト**:
- `tests/credentials.test.ts` TC-SIGTERM-001: Enter 後に SIGTERM listener 数が `beforeCount` に戻る ✓  
- `tests/credentials.test.ts` TC-SIGTERM-002: `process.emit("SIGTERM")` が `setRawMode(false)` を呼び `process.kill(pid, "SIGTERM")` を再送出する ✓

→ **解消済み**

### [resolved] `--provider github` gives incorrect migration guidance

`src/cli/command-registry.ts` line 489–496 のメッセージ関数が値別に分岐する:
- `"github"` → `"...no longer needed. Run: specrunner login"` (claude-code 案内なし)  
- `"claude"` → `"...To store a Claude Code token...credentials set claude-code"`  
- その他 → 一般案内

**確認したテスト**:
- `tests/unit/cli/removed-commands.test.ts`: `--provider github` が `"no longer needed"` を含み `"To store a Claude Code token"` を含まないことを確認 ✓  
- `tests/unit/cli/removed-commands.test.ts`: `--provider claude` が `"credentials set claude-code"` と `"To store a Claude Code token"` を含むことを確認 ✓

→ **解消済み**

---

## Iteration 2 Findings

### [medium / fixable] TC-014 hint verification regex が inner single quote で切れ、5つのdoctor hint 内の `credentials set` 参照を機械検証できていない

**該当ファイル**: `tests/hint-command-existence.test.ts` lines 128–143 (subcommand check)  
**影響範囲**: 下記5ファイルの hint 文字列

TC-014 のヒント抽出正規表現:
```js
const hintMatches = [...content.matchAll(/hint\s*:\s*["'`]([^"'`]+)["'`]/g)];
```

この正規表現はキャプチャグループを `[^"'\`]+` (ダブル・シングル・バッククォートを含まない文字列) で定義しているため、ヒント文字列の内部にシングルクォート `'` が含まれると、そこで打ち切られる。

**具体例** (`managed-key-present.ts` line 22):
```
hint: "Set SPECRUNNER_API_KEY env var, or run 'specrunner credentials set anthropic-api-key' to save it to credentials.json.",
```

正規表現が切り出す内容: `Set SPECRUNNER_API_KEY env var, or run ` (シングルクォートの直前まで)  
→ `specrunner credentials set anthropic-api-key` は**抽出されない** → registry 突合をスキップ

**影響を受ける5ファイル**:

| ファイル | line | hint 内のコマンド参照 |
|---|---|---|
| `src/core/doctor/checks/config/managed-key-present.ts` | 22 | `specrunner credentials set anthropic-api-key` |
| `src/core/doctor/checks/auth/managed-key-valid.ts` | 22 | `specrunner credentials set anthropic-api-key` |
| `src/core/doctor/checks/agents/agent-provider-alive.ts` | 33 | `specrunner credentials set anthropic-api-key` |
| `src/core/doctor/checks/agents/environment-provider-alive.ts` | 24 | `specrunner credentials set anthropic-api-key` |
| `src/core/doctor/checks/config/claude-code-token-present.ts` | 28 | `specrunner credentials set claude-code` |

**現在の状態**: `credentials set` は `COMMANDS` に登録済みであり、全ヒントが正しいコマンドを参照している。  
アクティブな dead guidance は存在しない。

**問題の本質**: 受け入れ基準「doctor の hint に CLI コマンドが含まれる場合、それが現行 CLI に実在することを機械検証する」において、機械ゲート (TC-014) がこれら5ヒントに対して発火していない。dead guidance が再導入された場合に検出できない。

**修正案 (いずれか)**:
1. 正規表現を修正して `hint` 行から `specrunner \w+` パターンを raw 抽出する（区切り文字に依存しない方法）
2. hint 文字列内のコマンド参照をシングルクォートで囲まない形式に変更する（例: バッククォート `` `specrunner credentials set anthropic-api-key` `` を使用する）

---

## 確認済み不変条件（問題なし）

- **flag-parser deprecated 機能拡張**: `FlagDef.deprecated.message` が `string | Function` に拡張された。既存 `FlagDef` は `deprecated` を持たないため後方互換。`parseFlags` は `def.deprecated` が `undefined` の場合を通常通り処理する。✓
- **`credentials` parent command の repo-free 実行**: `credentials.set` に `requiresRepo` なし。dispatch コードは subcommand の `requiresRepo` が未設定の場合にリポジトリ外での実行を許可する。資格情報の保存はリポジトリ不要であり、設計どおり。✓  
- **`formatHuman` の readiness 出力追加**: `fail === 0` 時に `"Ready to run."` と次のステップが追記される。既存テスト (TC-058, TC-077) は `toContain` による部分一致のみで、新しい行の追加でも通過する。✓  
- **`credentials set --help` dispatch 経路**: pre-scan が `--help` を検出して `emitHelp(subDef.usage)` を呼び `parseFlags` に到達しないため、handler の `parsed.positional!` non-null assertion に安全に到達しない。✓  
- **SIGTERM 後のプロセス状態**: `onSigterm` 内で `cleanup()` が exit handler を先に解除してから `process.kill` で re-raise する。`process.kill` は process.kill spy によりテスト内で mock 済みであり、promise の未解決による unhandled rejection は `.catch(() => {})` で抑制される。✓

---

## Evidence

- checked: 47 (主要変更ファイル + テストファイル + 既存テストスイートの assertions)
- skipped: 0
- unverified: 0
