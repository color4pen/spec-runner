# Design: file-permission-hardening

## Summary

`atomicWriteJson` のデフォルト mode を `0o600` にし、tmp file 書き込みに O_EXCL (`wx`) フラグを適用する。verbose log の `openSync` にも `0o600` を明示する。

## Background

`credentials-io.ts` は `atomicWriteJson` に `{ mode: 0o600 }` を渡して credentials を保護しているが、他の消費者（`job-state-store.ts`, `usage/store.ts`）は mode 未指定で呼び出しており、ファイルが `0o644` で作成される。verbose log (`stdout.ts`) も `openSync(path, "a")` で mode 未指定。また `atomic-write.ts` の `writeFile` で O_EXCL を使っていないため symlink race の余地がある。

## Architecture Decision

### D1: atomicWriteJson のデフォルト mode を 0o600 にする

現状の `atomicWriteJson` は `options?.mode` が undefined のとき OS デフォルト (umask 依存、通常 0o644) でファイルを作成する。これを `options?.mode ?? 0o600` に変更し、mode 未指定時でも 0o600 で書き込む。

**影響範囲** (mode 未指定の消費者):
- `src/store/job-state-store.ts` — `.specrunner/jobs/*.json` が 0o600 になる
- `src/core/usage/store.ts` — usage.json が 0o600 になる

**影響なし** (mode 明示指定済み):
- `src/core/credentials/credentials-io.ts` — `{ mode: 0o600 }` 明示済み。デフォルト変更と同値なので動作不変
- `src/config/store.ts` — `{ mode: CONFIG_MODE }` (= 0o600) 明示済み。同上

credentials-io.ts の明示指定は冗長になるが、意図の明示として残す。

### D2: tmp file 書き込みに O_EXCL を適用する

現状の `writeFile(tmpPath, json, { mode })` は、既存ファイルがあれば上書きする。symlink attack で tmpPath が予測可能な場合に任意ファイルへの書き込みが起こりうる。

`writeFile(tmpPath, json, { flag: "wx", mode })` に変更する。`wx` = `O_WRONLY | O_CREAT | O_EXCL` で、ファイルが既に存在する場合は EEXIST で失敗する。tmpPath は `randomBytes(6).toString("hex")` で十分なエントロピーがあるため衝突は極めて稀。

**mode 条件分岐の統合**: 現在は mode の有無で `writeFile` を分岐しているが、デフォルト mode (D1) の導入により常に mode が確定する。分岐を削除し単一の `writeFile` 呼び出しに統合する。

```typescript
const mode = options?.mode ?? 0o600;
await fs.writeFile(tmpPath, json, { flag: "wx", mode });
```

### D3: verbose log の openSync に 0o600 を明示する

`src/logger/stdout.ts` L92 の `openSync(currentLogPath, "a")` を `openSync(currentLogPath, "a", 0o600)` に変更する。

同ファイル内の他の openSync 呼び出し (`pipeline-logger.ts`, `session-log-writer.ts`) は既に 0o600 を指定済みで変更不要。

## Affected Capabilities (delta spec)

なし。変更は実装の mode/flag 引数のみで、spec の requirements (atomic write, history append 等) の振る舞いは不変。

## Scope

### In scope
- `src/util/atomic-write.ts` — デフォルト mode 変更 + O_EXCL 適用 + 条件分岐の統合
- `src/logger/stdout.ts` — openSync に 0o600 追加

### Out of scope
- `src/core/credentials/credentials-io.ts` — 既に正しい
- `src/adapter/claude-code/session-log-writer.ts` — 既に正しい
- `src/logger/pipeline-logger.ts` — 既に正しい
- 既存ファイルの権限修正
