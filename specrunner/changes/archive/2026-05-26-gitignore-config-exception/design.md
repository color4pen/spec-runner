## Context

PR #401 (project-config-overlay) で `<repo-root>/.specrunner/config.json` を project local config として導入し、user global に deep merge で重ねる仕組みを実現した。しかし `specrunner init` が `.gitignore` に追加するエントリは `.specrunner/`（directory 全体 ignore）のため、project local config が git で共有されない。team で verify pipeline / step model を揃える use case でブロッカーになっている。

git の仕様で「親 dir が ignore されると配下の `!` 再 include は無効」であるため、単純な `!.specrunner/config.json` は効かない。正しい書き方は `.specrunner/*`（glob、dir 自体は track）+ `!.specrunner/config.json`（例外）の 2 行構成。

本 change は `ensureDotSpecrunnerGitignore()` を新フォーマットに更新し、旧形式からの idempotent migration を実現する。

stakeholders:

- **作者**: project local config を team 共有可能にし、PR #401 の設計意図を完結させる
- **将来の利用者**: `specrunner init` を実行するだけで .gitignore が新形式に自動 upgrade される

## Goals / Non-Goals

**Goals:**

- `ensureDotSpecrunnerGitignore()` が `.specrunner/*` + `!.specrunner/config.json` の 2 行構成を生成・維持する
- 旧形式 `.specrunner/` が存在する .gitignore を新形式に自動 migrate する（idempotent）
- 既存 test (TC-GI-01〜06) を新フォーマットに合わせて update + migration / partial / idempotent の新規ケースを追加
- spec-runner repo 自身の `.gitignore` を新形式に更新する（dogfood）
- `specrunner/project.md` と `README.md` に team 共有設計の note を追加

**Non-Goals:**

- `specrunner init` で `.specrunner/config.json` テンプレート生成（yagni）
- 既存 project の自動 migration script（次回 `specrunner init` 実行で自動 upgrade、別途不要）
- `.specrunner/credentials.json` 等 secret 系の例外化（user global が設計正解）
- 複数例外 file（`config.shared.json` 等）対応（1 つの `config.json` のみ）
- Windows gitignore 互換性検証（POSIX shell 前提）

## Decisions

### D1: `.specrunner/*` + `!.specrunner/config.json` の 2 行構成

**Decision**: `.specrunner/`（directory ignore）を `.specrunner/*`（glob、直下全要素 ignore）に変更し、`!.specrunner/config.json` で config.json のみ例外にする。

**Rationale**: git の仕様で親 dir が ignore されると配下の `!` 再 include が無効になるため、glob パターンを使う。`.specrunner/` 配下に将来 `cache/`, `tmp/` 等が追加されても自動 ignore。gitignore の標準パターン。

**Alternatives considered**:

- **A. `.specrunner/jobs/` `.specrunner/logs/` を個別 ignore**: 将来 dir が増えるたびに gitignore 更新が必要、保守コスト高
- **B. `.specrunner/` + `!.specrunner/config.json`**: git の仕様で効かない（親 dir ignore 配下の `!` 無効）

### D2: 旧形式の自動 migration

**Decision**: `ensureDotSpecrunnerGitignore()` 内で旧形式 `.specrunner/` を検出したら `.specrunner/*` に書き換え、`!.specrunner/config.json` を追加する。

**Rationale**: 次回 `specrunner init` 実行で開発者は意識せず upgrade される。idempotent 性を保つことで何度呼んでも安全。別途 migration script は不要。

**Implementation approach**:

1. `.gitignore` を行単位で parse
2. 旧形式行（`.specrunner/`）を `.specrunner/*` に in-place 置換
3. `!.specrunner/config.json` 行が無ければ `.specrunner/*` の直後に追加
4. 既に新形式 2 行が揃っていれば no-op
5. 部分的に存在（`.specrunner/*` だけ or `!` 行だけ）の場合は不足分を追加
6. コメント行は保持

### D3: config.json のみ例外、将来拡張は別 request

**Decision**: 例外は `config.json` の 1 ファイルのみ。

**Rationale**: yagni。複数 file 例外は use case が出てから別 request で議論。

## Affected Specs

| Capability | Operation | Reason |
|------------|-----------|--------|
| cli-commands | MODIFIED | `specrunner init` / `specrunner run` の .gitignore 関連 requirement・scenario を 2 行構成に更新 |
