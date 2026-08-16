# Regression Gate Result — Iteration 2

## Summary

All 6 findings from the ledger have been resolved. No regressions detected.

---

## F1 (MEDIUM): PROVIDER_READINESS_HINTS の hint-existence テストがサブコマンドを検証しない

**Status: FIXED**

`tests/hint-command-existence.test.ts` に `extractCommandVerbSubs` 関数（line 29–32）と TC-005 ブロック内の subcommand 検証テスト（line 80–99）が追加された。`PROVIDER_READINESS_HINTS` 内の `specrunner <verb> <sub>` パターンを抽出し、`COMMANDS[verb].subcommands[sub]` の存在を assert する。

---

## F2 (MEDIUM): PROVIDER_READINESS_HINTS のサブコマンド検証が T-10 スコープ外

**Status: FIXED**

F1 と同一修正。`tests/hint-command-existence.test.ts` の TC-005 ブロックが subcommand レベルまで検証するよう拡張された（line 80–99）。`PROVIDER_READINESS_HINTS` の `auth-missing` / `auth-invalid` hint がともに `specrunner credentials set claude-code` を参照し、`credentials` コマンドの `set` サブコマンドが登録されていることが機械検証される。

---

## F3 (LOW): T-03 が readSecret の Ctrl-C 中断時の raw mode 後処理を未規定

**Status: FIXED**

`tasks.md` line 42 に「`\x03`(Ctrl-C) 中断時のいずれでも `setRawMode(false)` を呼んでから確定/中断すること（端末破壊防止）」が明記された。`src/util/secret-input.ts` の `readTTY` 実装では `cleanup()` 関数（line 72–86）が Ctrl-C 検出時（line 119）と Enter/EOT 確定時（line 127）の両方で呼ばれ、`setRawMode(false)` を確実に実行する。

---

## F4 (LOW): EventEmitter を node:stream から非標準インポート

**Status: FIXED**

`tests/credentials.test.ts` line 15 が `import { EventEmitter } from "node:events";` に変更された。`node:stream` への非標準インポートは解消済み。

---

## F5 (MEDIUM): TTY raw mode not restored on SIGTERM during `credentials set` input

**Status: FIXED**

`src/util/secret-input.ts` の `readTTY` に `onSigterm()` ハンドラ（line 93–97）が追加された。`cleanup()` を呼んで raw mode を解除した後、`process.kill(process.pid, "SIGTERM")` でシグナルを再送出する。`process.once("SIGTERM", onSigterm)` は raw mode 有効化直後に登録（line 106）され、`cleanup()` 内で `process.off("SIGTERM", onSigterm)` により解除される（line 75）。SIGTERM で端末が raw mode のままになる問題は解消された。

---

## F6 (MEDIUM): TC-014 hint regex silently skips `credentials set` verification in 5 doctor hints with inner single quotes

**Status: FIXED**

`tests/hint-command-existence.test.ts` の TC-014 ブロック（line 129–133, 159–163）が、旧来の複合文字クラス regex `hint\s*:\s*["'\`]([^"'\`]+)["'\`]` から、引用符種別ごとの 3 パターンに分割された:

```
/hint\s*:\s*"([^"]*)"/g
/hint\s*:\s*`([^`]*)`/g
/hint\s*:\s*'([^']*)'/g
```

これにより、`"...run 'specrunner credentials set anthropic-api-key'..."` のように内側に単一引用符を含む hint（5 ファイル: `managed-key-present.ts`, `managed-key-valid.ts`, `agent-provider-alive.ts`, `environment-provider-alive.ts`, `claude-code-token-present.ts`）が正しく全文抽出される。`specrunner credentials set` の verb-sub ペアが TC-014 の subcommand 検証で確認される経路が担保された。

---

## Evidence

- Checked: 6 findings
- Skipped: 0
- Unverified: 0
