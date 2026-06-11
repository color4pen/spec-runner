# init: .gitignore に node_modules/ を含める

## Meta

- **type**: bug-fix
- **slug**: init-gitignore-node-modules
- **base-branch**: main
- **adr**: false

## 背景

`specrunner init` は .gitignore に `.specrunner/*` 系のエントリを保証するが、node_modules/ を保証しない（#563）。.gitignore を持たない新規プロジェクトで init すると、依存 install 後に node_modules が untracked として現れ、pipeline の commit 系操作のノイズ・事故のもとになる。

## 現状コードの前提

- `src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore(repoRoot)` が .gitignore を idempotent に管理しており、対象は `.specrunner/*` 系の行のみ
- node_modules への言及は同 util に存在しない

## 要件

1. init の .gitignore 保証に `node_modules/` を加える。既存の idempotent な追記方式（既にあれば何もしない・重複を作らない）に従う
2. 既存エントリの管理動作を変えない

## スコープ外

- .gitignore のその他のエントリ（dist 等）の追加
- init 以外のコマンドでの .gitignore 操作

## 受け入れ基準

- [ ] .gitignore が無い repo で init すると node_modules/ を含む .gitignore が生成される
- [ ] node_modules/ 既載の .gitignore に対して重複追記しない
- [ ] 既存の .specrunner/* 管理のテストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（既存 util への 1 エントリ追加）

---
refs #563