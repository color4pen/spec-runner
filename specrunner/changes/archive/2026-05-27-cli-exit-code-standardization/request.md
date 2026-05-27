# CLI exit code の全コマンド統一

## Meta

- **type**: spec-change
- **slug**: cli-exit-code-standardization
- **base-branch**: main
- **adr**: false

## 背景

exit code が部分的にしか定義されていない:

- `finish`: 0/1/2 の 3 段階が明確に文書化されている
- `cancel`: 同じく 0/1/2
- `run` / `resume`: 0/1 のみ（引数エラーでも exit 1）
- `request review` / `request validate`: 不統一
- `command-registry.ts` 内で handler ごとに `process.exit(1)` or `process.exit(2)` がばらばら

## 要件

### 1. 全コマンドで exit code を 0/1/2 に統一

| exit code | 意味 | 例 |
|---|---|---|
| 0 | 成功 | pipeline 完走、finish 成功、review approve |
| 1 | 一般エラー | pipeline halt、escalation、API エラー、merge 失敗 |
| 2 | 引数エラー | 不正な slug、存在しないファイル、フラグの矛盾 |

### 2. SpecRunnerError への exitCode マッピング

`SpecRunnerError` または `ERROR_CODES` にエラー種別ごとの exit code を宣言的にマッピングする。各コマンドハンドラが個別に exit code を決めるのではなく、エラーの種別から一貫して導出する。

### 3. command-registry.ts の統一

handler 内の `process.exit(1)` / `process.exit(2)` を整理し、エラー種別に基づく一貫した exit code を返す。

## スコープ外

- **exit code 75 (EX_TEMPFAIL)** — CI ツール (GitHub Actions / CircleCI) が非ゼロを全て失敗扱いするため効果がない（業界調査に基づく）
- **ログレベル体系** — 別リクエストで対応
- **ログの永続化** — Phase 3 (#420) で対応

## 受け入れ基準

- [ ] 全コマンド (run / resume / finish / cancel / request review / request validate / job ls / job show / doctor / init / login) で exit code が 0/1/2 のいずれかである（SIGINT/SIGTERM 起因の exit 130 はシグナル規約として対象外）
- [ ] 引数エラー（不正な slug、存在しないファイル等）で exit 2 が返る
- [ ] 一般エラー（pipeline halt、API エラー等）で exit 1 が返る
- [ ] `SpecRunnerError` からの exit code 導出が宣言的に行われている
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **0/1/2 のみ**: BSD sysexits.h の 64-78 は FreeBSD 自身が deprecated とし、現代 CLI では採用されていない。75 (EX_TEMPFAIL) も GitHub Actions / CircleCI が区別しないため実効性がない（業界調査に基づく）
- **宣言的マッピング**: 各コマンドが個別に exit code を決めると不統一が再発する。エラー種別→exit code の対応を一箇所で管理する
