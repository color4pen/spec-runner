# slug / baseBranch の charset validation + git -- セパレータ追加

## Meta

- **type**: spec-change
- **slug**: slug-basebranch-charset-validation
- **base-branch**: main
- **adr**: false
- **issue**: #424

## 背景

slug と baseBranch のバリデーションが存在チェックのみで charset 制限がない。slug はパス構築・prompt 注入に、baseBranch は git コマンド引数に直接使われるため、path traversal / git option-injection / prompt injection の複合リスクがある。

CLI の `request new` では `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` が適用されているが、parser rules (`slug-required.ts`, `base-branch-required.ts`) には charset 検証がなく、手書き request.md 経由でバイパスできる。

## 対象ファイル

### Parser rules (charset validation 追加)

- `src/parser/rules/slug-required.ts` — 存在チェックに加え `^[a-z0-9][a-z0-9-]{0,63}$` を検証する。既存の `request-new.ts:12` と同じ正規表現を共有定数化する
- `src/parser/rules/base-branch-required.ts` — 存在チェックに加え `^[A-Za-z0-9._/-]+$` を検証する

### 共有定数

- `src/parser/rules/slug-required.ts` または新規ユーティリティファイル — SLUG_REGEX を共有定数として定義する
- `src/core/command/request-new.ts:12` — 既存の SLUG_REGEX を共有定数への参照に置き換える
- `src/core/command/rules-new.ts:12` — 同上
- `src/cli/command-registry.ts:39` — 同上

### git コマンドの `--` セパレータ追加

- `src/core/finish/local-conflict-check.ts:38` — `spawn("git", ["fetch", "origin", baseBranch])` → baseBranch の前に `--` は不要（fetch は refspec なので）。ただし line 48 の `merge-tree` 呼び出しは baseBranch が `origin/${baseBranch}` として展開されるため、charset validation で防御する
- `src/core/step/delta-spec-validation.ts:59` — `spawn("git", ["diff", \`${baseBranch}..HEAD\`, "--name-only"])` → charset validation で防御する

## スコープ外

- prompt 注入対策（slug の prompt 内エスケープ）は別 issue #428 で対応
- `request-new.ts`, `rules-new.ts`, `command-registry.ts` の既存 SLUG_REGEX を共有定数に置き換えるリファクタリングは含むが、既存の動作を変更しない

## 受け入れ基準

- parser rules で charset 不正な slug / baseBranch が error として検出されること
- 既存の `request new` CLI と同じ正規表現が parser rules に適用されていること
- SLUG_REGEX が1箇所で定義され、全利用箇所から参照されていること
- baseBranch に `--upload-pack` 等の git option 文字列を渡した場合、parser rules で reject されること
- 既存テストが破壊されないこと
