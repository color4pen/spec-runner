# request をフラットファイルからディレクトリ構造に変更

## Meta

- **type**: spec-change
- **slug**: request-directory-structure
- **base-branch**: main
- **adr**: true

## 背景

現状 request は `specrunner/drafts/<slug>.md` の flat ファイルで管理されている。architect レビュー結果、module-architect 分析、token 使用量などの付随成果物を request に紐づけて保存する置き場所がなく、session 内で消える。

ディレクトリ化して `specrunner/drafts/<slug>/request.md` にすることで、付随ファイルの置き場所を確保し、後続の改善 (レビュー結果のファイル保存、フォローアップ仕組みなど) の基盤にする。

## 要件

1. **request の配置を `specrunner/drafts/<slug>/request.md` に変更する**: `specrunner request new <slug>` が `specrunner/drafts/<slug>/request.md` を生成する。ディレクトリは自動作成する。
2. **`specrunner request ls` はディレクトリ名を列挙する**: `specrunner/drafts/` 配下のディレクトリのうち `request.md` を含むものを slug として返す。
3. **`specrunner request validate <slug>` はディレクトリ内の `request.md` を読む**: `src/core/request/store.ts` の `resolve()` を更新する。
4. **`specrunner request review <slug>` も同様にディレクトリ内の `request.md` を読む**。
5. **`specrunner run <slug>` はディレクトリ内の `request.md` を読む**: `src/core/command/pipeline-run.ts` の `CANONICAL_PATTERN` を更新する。
6. **`specrunner request generate` の出力先もディレクトリ構造に変更する**。
7. **既存の flat ファイル (`<slug>.md`) との後方互換を維持する**: `resolve()` はまずディレクトリ (`<slug>/request.md`) を探し、なければ flat (`<slug>.md`) にフォールバックする。
8. **`src/core/request/store.ts` の `resolve` / `list` / `read` / `write` / `checkSlugCollision` を更新する**。
9. **`specrunner/changes/<slug>/request.md` (pipeline 実行時のコピー先) は変更しない**: 既存の change folder 構造は維持する。

## スコープ外

- architect レビュー結果のファイル保存 (= 別 request で対応)
- module-architect 分析結果のファイル保存 (= 別 request で対応)
- 既存 flat ファイル drafts の一括 migration (= 手動 or 別 request)
- `specrunner/changes/` や `specrunner/changes/archive/` の構造変更
- `specrunner rules new` コマンドへの影響 (= rules は独立構造で影響なし)

## 受け入れ基準

- [ ] `specrunner request new <slug>` で `specrunner/drafts/<slug>/request.md` が作成される
- [ ] `specrunner request ls` がディレクトリベースの slug 一覧を返す
- [ ] `specrunner request validate <slug>` がディレクトリ内の `request.md` を読んで検証する
- [ ] `specrunner request review <slug>` がディレクトリ内の `request.md` を読んでレビューする
- [ ] `specrunner run <slug>` がディレクトリ内の `request.md` で pipeline を開始する
- [ ] 既存 flat ファイル (`<slug>.md`) がある場合もフォールバックで読める
- [ ] `specrunner request generate` の出力先がディレクトリ構造になる
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

### D1: ディレクトリ構造

```
specrunner/drafts/<slug>/
├── request.md          # request 本体 (必須)
└── (将来の付随ファイル置き場)
```

change folder (`specrunner/changes/<slug>/`) は既にディレクトリ構造。drafts をディレクトリにすることで drafts → changes の構造が揃う。

### D2: 後方互換

`resolve()` はまずディレクトリ (`<slug>/request.md`) を探し、なければ flat (`<slug>.md`) にフォールバック。新規作成は常にディレクトリ構造。既存 flat ファイルの migration は強制しない。

### D3: 影響範囲

- `src/core/request/store.ts` — resolve / list / read / write / checkSlugCollision の 5 関数
- `src/core/command/pipeline-run.ts` — CANONICAL_PATTERN の正規表現
- `src/core/command/request-new.ts` — 生成先パス
- `src/cli/command-registry.ts` — validate / review のパス解決 (store 経由なら変更不要だが確認要)
- `src/core/request/reviewer.ts` — review のパス解決 (store 経由か確認要)
- `src/util/paths.ts` — `draftPath()` のパス生成を更新
- テスト — store / pipeline-run / request-new の既存テスト更新 + 後方互換テスト追加
