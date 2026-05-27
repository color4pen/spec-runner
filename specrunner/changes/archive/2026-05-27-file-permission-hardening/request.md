# 永続化ファイルの permission を 0o600 に統一し O_EXCL を適用する

## Meta

- **type**: bug-fix
- **slug**: file-permission-hardening
- **base-branch**: main
- **adr**: false

## 背景

`credentials-io.ts` は `atomicWriteJson` に `{ mode: 0o600 }` を渡して credentials を保護しているが、同じ `atomicWriteJson` を使う `job-state-store.ts` は mode 未指定で呼び出しており `.specrunner/jobs/*.json` が 0o644 で作成される。verbose log (`stdout.ts`) も `openSync(path, "a")` で mode 未指定。また `atomic-write.ts` の `writeFile` で O_EXCL を使っていないため symlink race の余地がある。

Closes #425

## 要件

1. `src/util/atomic-write.ts` の `atomicWriteJson()` でデフォルト mode を `0o600` にする（`options?.mode ?? 0o600`）
2. `src/util/atomic-write.ts` の tmp file 書き込みを `fs.writeFile(tmpPath, json, { flag: "wx", mode })` に変更して O_EXCL を適用する
3. `src/logger/stdout.ts:92` の `openSync(currentLogPath, "a")` を `openSync(currentLogPath, "a", 0o600)` に変更
4. `src/store/job-state-store.ts` は atomic-write のデフォルト変更で自動的に 0o600 になるため変更不要

## スコープ外

- credentials-io.ts の変更（既に正しく 0o600 を明示指定しており影響なし）
- session-log-writer.ts の変更（既に `openSync(logPath, "w", 0o600)` で正しい）
- 既存ファイルの権限修正（新規作成時のみ適用）

## 受け入れ基準

- [ ] `atomicWriteJson` が mode 未指定時に 0o600 で書き込む
- [ ] `atomicWriteJson` が tmp file に O_EXCL (`wx`) フラグを使う
- [ ] verbose log が 0o600 で作成される
- [ ] `credentials-io.ts` の明示 `{ mode: 0o600 }` 指定は引き続き機能する（デフォルト変更の影響なし）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

`atomicWriteJson` のデフォルト mode を 0o600 に変更することで、全消費者（job-state-store、将来の新規呼び出し）が自動的に保護される。credentials-io.ts の明示指定は冗長になるが、意図の明示として残す。
