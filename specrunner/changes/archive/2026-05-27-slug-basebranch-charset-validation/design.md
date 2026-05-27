# Design: slug-basebranch-charset-validation

## Summary

parser rules に slug / baseBranch の charset validation を追加し、SLUG_REGEX を 1 箇所の共有定数に集約する。git コマンドへの `--` セパレータ追加は行わず、parser レイヤーでの charset 制限を防御線とする。

## Background

slug と baseBranch の parser rules (`slug-required.ts`, `base-branch-required.ts`) は存在チェック (null / empty) のみで charset 制限がない。CLI の `request new` は `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` を適用しているが、手書き request.md 経由でバイパスできる。slug はパス構築に、baseBranch は git コマンド引数に直接使われるため、path traversal / git option-injection のリスクがある。

SLUG_REGEX は現在 3 箇所で重複定義されている:
- `src/core/command/request-new.ts:12`
- `src/core/command/rules-new.ts:12`
- `src/cli/command-registry.ts:39`

## Architecture Decision

### D1: 既存 rule 拡張 vs 新規 rule 追加

**決定: 既存 rule 内に charset check を追加する**

`slug-required` rule の `check()` で、存在チェック通過後に charset 検証を行い、不正なら別メッセージで violation を返す。新規 rule name は追加しない。

**理由**:
- `RequestMdRuleName` union と registry への変更が不要
- 「slug が必要」→「slug が正しい形式で必要」への自然な拡張
- violation メッセージで missing と invalid charset を区別できるため、消費者側に影響なし

### D2: 共有定数の配置場所

**決定: `src/util/validation-patterns.ts` に新規ファイルを作成**

`SLUG_REGEX` と `BASE_BRANCH_REGEX` を export する。

**理由**:
- parser rules と CLI commands の両方から import できる中立的な位置
- `src/parser/rules/` に置くと CLI → parser の逆方向依存が発生する
- `src/util/` は既存のユーティリティ配置先として確立済み

### D3: baseBranch の charset 制限

**決定: `BASE_BRANCH_REGEX = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/`**

- `--` で始まる文字列を reject (git option injection 防止)
- 空白・制御文字・シェルメタ文字を reject
- 通常の git branch 名 (`main`, `release/v1.0`, `feature/foo-bar`) は許容
- `/` を許容するため `origin/main` のような refspec 引数にも対応

### D4: git コマンドの `--` セパレータは追加しない

**決定: charset validation を防御線とし、`--` セパレータ追加は行わない**

対象箇所:
- `local-conflict-check.ts:38` — `git fetch origin <baseBranch>` は refspec なので `--` 不適用
- `local-conflict-check.ts:48` — `git merge-tree` は `origin/${baseBranch}` だが charset validation で `--` 始まりを排除済み
- `delta-spec-validation.ts:59` — `git diff ${baseBranch}..HEAD` は charset validation で防御済み

**理由**:
- parser レイヤーで `--` 始まりの baseBranch を reject すれば、git option injection は到達しない
- `git fetch` の refspec 引数に `--` を挟むと意味が変わる
- defense in depth の 2 重目は parser charset validation で十分。3 重目の `--` は過剰

### D5: 既存テストとの互換性

既存テストの `makeRaw()` helper は `slug: "my-slug"`, `baseBranch: "main"` をデフォルト値として使用しており、いずれも新しい charset 制限に適合する。既存テストの修正は不要。

## Affected Capabilities (delta spec)

| Capability | 変更内容 |
|---|---|
| request-md-parser | slug / baseBranch の charset validation requirement を追加 |

## Scope

### In scope
- `slug-required.ts` に charset validation 追加
- `base-branch-required.ts` に charset validation 追加
- `src/util/validation-patterns.ts` 新規作成 (SLUG_REGEX, BASE_BRANCH_REGEX)
- `request-new.ts`, `rules-new.ts`, `command-registry.ts` の SLUG_REGEX を共有定数に置換
- 既存テストに charset validation テストケースを追加

### Out of scope
- prompt 注入対策 (別 issue #428)
- git コマンドへの `--` セパレータ追加 (D4 で不採用)
- 新規 rule name の追加 (D1 で不採用)
