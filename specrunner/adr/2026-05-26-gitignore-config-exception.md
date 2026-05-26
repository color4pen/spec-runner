# `.gitignore` の `.specrunner/*` + `!.specrunner/config.json` 2 行構成採用

**Date**: 2026-05-26
**Status**: accepted

## Context

PR #401（project-config-overlay）で `<repo-root>/.specrunner/config.json` を project local config として導入し、user global に deep merge で重ねる仕組みを実現した（`specrunner/adr/2026-05-26-project-config-overlay.md` 参照）。

しかし `specrunner init` が `.gitignore` に追加するエントリは `.specrunner/`（directory 全体 ignore）であったため、project local config が git で共有されないという制約が残っていた。

```
~/.config/specrunner/config.json     → 開発者個人（モデル選好など）
<repo>/.specrunner/config.json       → project 固有（verify pipeline / step model 強制）→ git 非追跡
```

team で verify pipeline を揃えたい / 重要な step に強制 model を当てたい という use case でブロッカーになっていた。

### git の仕様上の罠

単純な負パターン（`!.specrunner/config.json`）では効かない。git の仕様で「親ディレクトリが ignore されると配下の `!` 再 include が無効」になるため:

```gitignore
.specrunner/                    # directory を ignore
!.specrunner/config.json        # 効かない（親が ignored）
```

## Decision

### D1: `.specrunner/*` + `!.specrunner/config.json` の 2 行構成を採用

`.specrunner/`（directory ignore）を `.specrunner/*`（glob、直下全要素 ignore、ただし dir 自体は track）に変更し、`!.specrunner/config.json` で config.json のみを例外にする。

```gitignore
.specrunner/*
!.specrunner/config.json
```

**Rationale**: git の仕様で親 dir が ignore されると配下の `!` 再 include が無効になるため、glob パターン（`*`）を使う標準パターン。`.specrunner/` 配下に将来 `cache/`, `tmp/` 等が追加されても自動 ignore される。

### D2: 旧形式 `.specrunner/` の自動 migration

`ensureDotSpecrunnerGitignore()` 内で旧形式 `.specrunner/` を検出したら `.specrunner/*` に書き換え、`!.specrunner/config.json` を追加する。idempotent な実装で何度呼んでも安全。

**実装アプローチ**:

1. `.gitignore` を行単位で parse
2. 旧形式行（`.specrunner/`）を `.specrunner/*` に in-place 置換
3. `!.specrunner/config.json` 行が無ければ `.specrunner/*` の直後に追加
4. 既に新形式 2 行が揃っていれば no-op
5. 部分的に存在（`.specrunner/*` だけ or `!` 行だけ）の場合は不足分を追加
6. コメント行は保持

### D3: 例外は `config.json` 1 ファイルのみ

`!.specrunner/config.json` の 1 つのみ例外とする。`config.shared.json`, `config.example.json` 等の複数例外は yagni、use case が出てから別 request で議論する。

### D4: team tracking policy — config のみ commit、machine-generated は ignore

`.specrunner/` 配下のファイルを以下の方針で区別する:

| ファイル/ディレクトリ | 方針 | 理由 |
|---|---|---|
| `.specrunner/config.json` | git track（例外） | team で共有すべき project 設定 |
| `.specrunner/jobs/` | ignore | 個人の実行状態、machine-generated |
| `.specrunner/logs/` | ignore | verbose ログ、machine-generated |
| その他の `.specrunner/` 配下 | ignore（デフォルト） | 将来追加されるファイルも自動 ignore |

## Alternatives Considered

### Alternative A: `.specrunner/jobs/` `.specrunner/logs/` を個別に明示 ignore

```gitignore
.specrunner/jobs/
.specrunner/logs/
```

- **Pros**: 明示的でわかりやすい
- **Cons**: 将来 `.specrunner/` 配下に新規ディレクトリが増えるたびに gitignore 更新が必要。保守コスト高
- **Why not**: 負パターン（`*` で全 ignore + `!` で例外）のほうが robust。追加されたファイルが意図せず git-tracked になるリスクがある

### Alternative B: `.specrunner/` + `!.specrunner/config.json`

```gitignore
.specrunner/
!.specrunner/config.json
```

- **Pros**: 意図が読みやすい
- **Cons**: git の仕様で効かない。親ディレクトリが ignore されると配下の `!` 再 include は無効になる
- **Why not**: 動作しない

## Consequences

### Positive

- `specrunner init` 実行で `.gitignore` が自動的に新形式に upgrade される（既存ユーザーは意識不要）
- project local config を commit して push するだけで team 全員が同じ verify pipeline / step model を使える
- 将来 `.specrunner/` 配下に新規ファイルが追加されても gitignore 更新は不要

### Negative

- 旧形式（`.specrunner/`）から新形式への migration は `specrunner init` 再実行が必要。自動 migration script は提供しない
- `!.specrunner/config.json` の例外行は git の仕様を知らない開発者には非直感的に見える可能性がある（コメントで補足推奨）

### Known Debt

- `specrunner init` で `.specrunner/config.json` テンプレートを生成する機能は scope 外。開発者が手動で作成する必要がある
- 複数の例外ファイル（`config.shared.json` 等）への対応は scope 外

## References

- Request: `specrunner/changes/gitignore-config-exception/request.md`
- Design: `specrunner/changes/gitignore-config-exception/design.md`
- Related: `specrunner/adr/2026-05-26-project-config-overlay.md`（project local config 導入の親 ADR）
- Related: `specrunner/adr/2026-05-24-jobs-to-dotspecrunner.md`（`.specrunner/` ディレクトリ設計）
