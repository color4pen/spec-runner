# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review
- **date**: 2026-05-27

---

## Summary

spec-review-001 の修正必須 4 件はすべて正しく対処されている。設計・アーキテクチャは妥当。ただし security fix (0600 パーミッション追加) の実装指示にディレクトリ mode の誤りが混入しており、仕様通りに実装すると機能が動作しない。加えて verbose-execution-log delta の normative 文が新挙動と矛盾している。

---

## spec-review-001 対処確認

| 項目 | 対処 |
|------|------|
| [CRITICAL] cli-commands delta ヘッダー不一致 | ✅ baseline と完全一致するヘッダーに修正済み |
| [SECURITY] ログファイルパーミッション要件欠落 | ✅ `0600` 要件 + シナリオ追加済み |
| [MODERATE] tasks 2.3 の maskSensitive 欠落 | ✅ task 2.3 に `maskSensitive()` 適用を明示済み |
| [MINOR] attempt カウンター定義未記載 | ✅ "1 始まり、retry ごとにインクリメント" を spec に追記済み |

---

## Findings

### [SECURITY][MODERATE] ディレクトリ mode に 0o600 を使用すると機能が破壊される

**場所**: `specs/cli-log-persistence/spec.md` — Requirement: ログファイルは 0600 パーミッションで作成する

現在の記述:
```
`mkdirSync` でログディレクトリを作成する際および `openSync` でファイルを開く際に `mode: 0o600` を指定すること。
```

Unix のディレクトリパーミッションでは execute bit がディレクトリの走査（traversal）を制御する。`0o600` は `rw-------` であり execute bit が存在しないため:
- ディレクトリ内にファイルを作成できない（`openSync` が失敗する）
- ディレクトリ内のファイルにアクセスできない（`cat <jobId>.log` が失敗する）
- retention の走査（`fs.stat` による mtime 取得）も失敗する

正しい使い分け:
- ファイル (`openSync`): `mode: 0o600` — 正しい
- ディレクトリ (`mkdirSync`): `mode: 0o700` — execute bit が必要

**修正**: Requirement 本文と scenarios を以下のように修正する。

```
ログファイルは `0600` 相当のパーミッションで作成しなければならない（MUST）。
ログディレクトリは `0700` 相当のパーミッションで作成しなければならない（MUST）。

`mkdirSync` でログディレクトリを作成する際は `mode: 0o700` を指定すること。
`openSync` でファイルを開く際は `mode: 0o600` を指定すること。
```

Scenario のタイトルも "ファイルのパーミッションが 0600" / "ディレクトリのパーミッションが 0700" に分割するか、両方を検証するよう記述を更新すること。

---

### [MINOR] verbose-execution-log delta の normative 文が新挙動と矛盾している

**場所**: `specs/verbose-execution-log/spec.md` (delta)

現在の記述:
```
default / quiet レベルではログファイルを生成してはならない（SHALL NOT）。
```

この文は baseline から引き継いだ表現だが、本 change で pipeline log が default レベルでも `<jobId>.log` を生成するようになる。「ログファイルを生成してはならない」という SHALL NOT はその新挙動と直接矛盾する。

直後に "pipeline ログ (`PipelineLogger`) がログレベル非依存で同一パスに先行して書き込む" と説明しているが、normative 文とコンフリクトしていると implementer が混乱するリスクがある。

**修正**: normative 文を verbose エントリ追記の禁止に絞って書き直す。

```
default / quiet レベルでは verbose エントリを追記してはならない（SHALL NOT）。pipeline ログ (`PipelineLogger`) がログレベル非依存で同一パスに書き込むため、`<jobId>.log` は default レベルでも存在する。
```

---

### [MINOR] tasks Phase 1 に PipelineLogger の maskSensitive 適用が未記載

**場所**: `tasks.md` Phase 1 (1.1)

spec `Requirement: ログファイルにセンシティブ値を書き込まない` は "**pipeline ログ**および agent session log の書き込み時に `maskSensitive()` を適用しなければならない（MUST）" と定めている。しかし tasks Phase 1 の 1.1 には PipelineLogger が JSONL 行を書き込む際の `maskSensitive()` 適用の記述がない。

pipeline イベントのペイロードにはエラーメッセージや verification コマンド出力が含まれる可能性があり、これらが API key 等を含む場合にマスク漏れが生じる。

**修正**: task 1.1 の書き込み処理の記述に "書き込み前に `maskSensitive()` を適用する" を追記する。

---

## 修正必須の項目

1. `specs/cli-log-persistence/spec.md` のディレクトリ mode 指定を `0o600` → `0o700` に修正する（SECURITY/MODERATE）
2. `specs/verbose-execution-log/spec.md` の "ログファイルを生成してはならない（SHALL NOT）" を "verbose エントリを追記してはならない（SHALL NOT）" に修正する（MINOR）
3. `tasks.md` task 1.1 に PipelineLogger の `maskSensitive()` 適用を明記する（MINOR）
