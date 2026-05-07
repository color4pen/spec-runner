## Context

`specrunner ps` の出力に terminal 状態の古い job が蓄積し、視認性が低下している。state file（`~/.local/share/specrunner/jobs/{jobId}.json`）を手動削除すれば ps からは消えるが、managed mode では Anthropic 側の session が orphan として残る。`finish` コマンドと対称的な lifecycle 操作として `rm` を提供する。

## Goals / Non-Goals

**Goals:**

- `specrunner rm <jobId>` で単一 job を安全に削除できる（status gate 付き）
- `specrunner rm --all-terminated` で terminal 状態の job を一括削除できる
- managed mode で session を best-effort 削除し orphan を防止する
- 既存の CLI パターン（finish の flag parsing, exit code 規約）に準拠する

**Non-Goals:**

- `running` job の graceful shutdown（cancel コマンドは別スコープ）
- session 削除の保証（best-effort で十分。API 障害時は warning で続行）
- state file のバックアップ / undo 機能

## Decisions

### D1: status gate の設計

削除可能 status を明示的にホワイトリストで定義する。

| Status | デフォルト | `--force` |
|--------|-----------|-----------|
| `failed` | 許可 | 許可 |
| `terminated` | 許可 | 許可 |
| `archived` | 許可 | 許可 |
| `running` | 拒否 | 許可 |
| `awaiting-merge` | 拒否 | 許可 |

拒否時のメッセージ:
- `running`: `"Job is still running. Use --force to override."`
- `awaiting-merge`: `"Job has a pending PR. Use 'specrunner finish' or --force."`

**代替案**: 全 status 許可 + `--force` 不要 → 安全性の観点で却下。running job の state を消すと pipeline が壊れる。

### D2: `deleteSession` は SessionClient port に追加しない

`SessionClient` は pipeline 実行時の session lifecycle（create → message → poll/stream）を抽象化する port。`rm` は pipeline 外の管理操作であり、`SessionClient` の責務ではない。

`rm` の runner が直接 Anthropic SDK client を受け取り `client.beta.sessions.delete()` を呼ぶ。config が managed mode かつ state に `session.id` がある場合のみ実行。local mode や session 未作成の job では skip。

**代替案**: `SessionClient` に `deleteSession()` を追加 → port の責務が肥大化する。local adapter に意味のない no-op 実装が増える。

### D3: `deleteJobState` は store.ts に追加

既存の `create / load / update / list` と同じレイヤに `deleteJobState()` を配置する。`fs.unlink` + ENOENT 無視で冪等。

### D4: `--all-terminated` の確認プロンプト

一括削除は破壊的操作のため、対象件数を表示して `y/N` 確認を求める。`--yes` フラグで skip 可能。TTY でない場合は `--yes` 必須（非 TTY で確認プロンプトなし実行は拒否）。

### D5: exit code 規約

`finish` と同じ: 0（成功）、1（実行エラー）、2（引数エラー）。

### D6: session 削除の error handling

`client.beta.sessions.delete()` が失敗しても state file 削除は続行する。API エラーは stderr に warning として出力。session が既に削除済み（404）の場合も warning で続行。

## Risks / Trade-offs

- **[Risk] running job の state を `--force` で消すと pipeline が壊れる** → `--force` は明示的 opt-in であり、ユーザーの意図的操作。stderr に warning を表示する
- **[Risk] session 削除が失敗すると orphan が残る** → best-effort 方針。session には TTL があり、最終的に Anthropic 側で回収される
- **[Risk] `--all-terminated` で意図しない job が消える** → 確認プロンプト + `--yes` の 2 段階で防御
