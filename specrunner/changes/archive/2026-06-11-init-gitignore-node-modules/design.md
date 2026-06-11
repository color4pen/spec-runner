# Design: init-gitignore-node-modules

## Context

`src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore(repoRoot)` は `.gitignore` を idempotent に管理する。現在の管理対象は `.specrunner/*` と `!.specrunner/config.json` の 2 行のみ。`node_modules/` は管理対象外のため、`.gitignore` を持たない新規プロジェクトで `specrunner init` を実行した後に `bun install` すると `node_modules/` が untracked として現れ、pipeline の commit 系操作のノイズ源になる。

## Goals / Non-Goals

**Goals**:
- `ensureDotSpecrunnerGitignore` の管理エントリに `node_modules/` を追加し、既存の idempotent 追記方式に従って保証する

**Non-Goals**:
- `dist/` など他のエントリの追加
- init 以外のコマンドでの `.gitignore` 操作

## Decisions

### D1: 既存の idempotent パターンを踏襲し、単一行エントリとして追加する

`node_modules/` は `.specrunner/*`/`!.specrunner/config.json` ペアと異なり、例外行を持たない単独エントリ。既存の「存在チェック → 末尾挿入」パターンをそのまま適用する。

**Rationale**: 新しい制御フローを導入せず、既存コードの読み取りやすさを維持できる。`node_modules/` 既載の `.gitignore` には何もしない（idempotent）。

**Alternatives considered**: 管理対象エントリをリスト化して汎用ループにまとめる案もあったが、`.specrunner/*` ペアの順序強制ロジック（D2 参照）と混在させると複雑度が増すため見送り。

### D2: `.specrunner/*` ペアの挿入ロジックは変更しない

`node_modules/` の挿入は `.specrunner/*`/`!.specrunner/config.json` ペアの処理後（Step 3 以降）に独立して行う。既存の「ペア間の順序強制」ロジックに影響しない位置に追加する。

**Rationale**: 既存テスト（TC-GI-01〜TC-GI-12）をノーチェンジで通すことが受け入れ基準の一つであり、既存ロジックへの干渉を排除する。

## Risks / Trade-offs

- [Risk] `node_modules/` がコメント行として存在する場合、非コメント行としての追記が行われる → 他のエントリと同様に「コメント行は存在とみなさない」仕様で統一されており許容範囲。

## Open Questions

なし
