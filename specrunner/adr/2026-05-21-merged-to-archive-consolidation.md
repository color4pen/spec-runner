# ADR: requests/merged を changes/archive に統合し archive 経路を真に一本化する

- **Date**: 2026-05-21
- **Status**: Accepted
- **Slug**: merged-to-archive-consolidation

## Context

### 経緯

PR #347 (`requests-to-drafts-restructure`) で起票エントリポイントを `drafts/` に rename し、archive 経路を `changes/archive/<slug>/` に一本化する設計を導入した。ただし **既存 `requests/merged/` 140 件の物理削除は明示的にスコープ外** として read-only 保持に留めた。

PR #348 (`requests/merged を changes/archive に統合`) で物理 file 移動を完了:
- 重複していなかった 44 件を `changes/archive/<slug>/request.md`（dir 形式）に救済（migration 注釈付き）
- `specrunner/requests/merged/` directory を削除
- `changes/archive/` 合計 151 件（既存 107 + 新規 44）

物理 file レベルでは整合済みだったが、**src 参照と baseline spec が物理状態と乖離**していた:

- `src/core/request/store.ts` の `checkSlugCollision` に `MERGED_SUBDIR` チェック（Check 2）が残存
- `src/core/request/types.ts` に `RequestState = "active" | "merged"` 型定義が残存
- `src/core/request/manager.ts` が `RequestState` を使用、`state: "active" as const` を固定値で返していた
- `src/core/command/request-list.ts` が意味のない STATE 列を表示していた
- `src/core/command/request-migrate-flat.ts` が dead code として残存（CLI 未登録、参照ゼロ）

### PR #347 の baseline 整合性漏れ

PR #347 の delta spec → baseline merge は走ったが、`cli-commands/spec.md` の以下行は **delta が言及しなかった**ため baseline に古い記述が残った:

| 箇所 | 旧 baseline | 正しい状態 |
|---|---|---|
| --help テキスト | `active 配下の request 一覧` / `active 配下から削除` | `drafts 配下の request 一覧` / `drafts 配下から削除` |
| request new Step 2 | `active / merged 配下` slug 重複チェック | `drafts + changes/archive の 2 経路` |
| request new Step 4,5 | `specrunner/requests/active/<slug>.md` | `specrunner/drafts/<slug>.md` |
| request new Scenario | `specrunner/requests/active/my-feature.md` | `specrunner/drafts/my-feature.md` |

53 行ある spec のうち 5-6 行が漏れた。spec-review も catch できなかった。

## 決定

### 1. checkSlugCollision を drafts + archive の 2 経路に縮退

`store.ts` の `MERGED_SUBDIR` 定数と Check 2（`requests/merged/` 走査）を削除し、`checkSlugCollision` を **drafts + archive の 2 経路チェック**に縮退させる。

`requests/merged/` directory は PR #348 で物理削除済みのため dead code。ENOENT silent skip で runtime は壊れていなかったが、dead reference を明示的に除去することで意図が明確になる。

### 2. RequestState 型を削除（rename ではない）

`RequestState = "active" | "merged"` 型は `manager.ts` のみが使用しており、その使用箇所も `state: "active" as const` の固定値 hardcode だった。型・field・表示列を全て削除が一意の判断。`"active"` への rename ではなく型ごと削除する。

### 3. request-migrate-flat.ts を削除

`drafts/` 配下も `requests/merged/` 配下も既に flat 形式に統一済み（PR #344 / PR #348 で完遂）。CLI subcommand として登録されておらず、内部呼び出しもゼロ件。utility ファイル自体を削除する。

### 4. 44 件不足分を archive 側に救済（PR #348 で実施済み、本 ADR で記録）

`requests/merged/` に存在し `changes/archive/` に対応エントリがなかった 44 件を `changes/archive/<slug>/request.md`（dir 形式）として救済した。各ファイル末尾に以下の注釈を付加:

```
---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/<slug>.md` by `merged-to-archive-consolidation`.
```

特殊ケース: `agent-tool-constraints-research` は flat `.md` と sibling dir（`research-result.md` を持つ）を併存していたため dir 内容も archive に救済。

これにより `request-patterns.ts` のパターンソースカバレッジが 107 件 → 151 件に拡大。

### 5. PR #347 baseline 整合性漏れを本 request の delta spec で一括是正

本 request の delta spec で PR #347 の漏れ箇所も覆う設計とした。`finish` 後の baseline では `requests/active/` / `requests/merged/` への path 言及が完全消失することを期待する。

## 構造観察: LLM 不確定性原理

PR #347 で baseline 整合性が部分的に取り残された原因は LLM の不確定性。design agent に「baseline の全該当行を網羅的に grep して delta に組み込め」と要求しても、53 行中 5-6 行が漏れた。spec-review も catch できなかった。

この種の漏れに対する根本対策は:

1. **grep 網羅性の明示的要求**: delta spec の Requirement header に「finish 後の baseline で特定文字列が完全消失すること」を結果状態として記述する
2. **静的 regression test**: `cli-commands/spec.md` に `requests/active/` / `requests/merged/` への path 言及が含まれないことを CI で assert する（本 request で追加）
3. **応急処置ではなく設計で消す**: 「agent が判断する場面を消す」が根本対策。spec-change scope で漏れた場合は次の request で一括是正するパターンを規律化

ルール追加は対症療法。構造的には「agent が判断する場面を消す」ことが唯一の根本対策（LLM 不確定性原理）。

## 検討した代替案

| 案 | 評価 | 不採用理由 |
|---|---|---|
| `RequestState` を `"active"` に rename | 型を保持できる | 使用箇所が 1 箇所で常に固定値。型の意味がない |
| `requests/merged/` の ENOENT skip を維持 | runtime が壊れない | dead code を残す。設計意図が不明確になる |
| request-migrate-flat.ts を CLI に登録 | utility として提供可能 | 既に flat 化完了。再利用機会なし |
| delta spec 漏れを別 issue 化 | 小さな PR で対応可能 | PR #347 の延長として一括是正する方が追跡コストが低い |

## リスクと受容判断

**[Risk] 静的 regression test の限界**
- `store.ts` ソースに `MERGED_SUBDIR` / `requests/merged` が含まれないことの assert は file 削除後も維持される
- `cli-commands/spec.md` の path 言及消失 assert は finish 後の baseline が正しい場合に green になる
- 受容判断: delta spec merge 漏れを CI でキャッチする仕組みとして有効。完全保証ではないが次回の同種事故を検出できる

## Consequences

- `checkSlugCollision` が drafts + archive の 2 経路に縮退。`requests/merged/` への参照が src から完全消滅
- `RequestState` 型・`state` field・STATE 表示列が削除。request ls 出力が SLUG / TYPE の 2 列に簡素化
- `request-migrate-flat.ts` および対応 test が削除。codebase から dead code が除去
- `changes/archive/` が 151 件の single source of truth となり archive 経路が真に一本化
- PR #347 の baseline 整合性漏れが本 request の delta spec で一括是正。`cli-commands/spec.md` baseline から `requests/active/` / `requests/merged/` への言及が完全消失
- 静的 regression test により同種の baseline 整合性漏れを CI でキャッチ可能に

## Files Changed

| File | Change |
|---|---|
| `src/core/request/store.ts` | `MERGED_SUBDIR` 定数削除、Check 2 ブロック削除、Check 3 → Check 2 に番号更新 |
| `src/core/request/types.ts` | `RequestState` 型定義削除 |
| `src/core/request/manager.ts` | `RequestState` import 削除、`state` field 削除 |
| `src/core/command/request-list.ts` | STATE 列削除 |
| `src/core/command/request-migrate-flat.ts` | ファイル削除 |
| `tests/unit/core/request/store.test.ts` | TC-ST-006 削除、MERGED_SUBDIR regression test 追加 |
| `tests/unit/core/command/request-migrate-flat.test.ts` | ファイル削除 |
| `tests/unit/util/slugify.test.ts` | TC-SL-006b テスト名更新、TC-SL-006d 削除 |
| `tests/finish-orchestrator.test.ts` | `merged` チェック行削除 |
| `tests/unit/context/request-patterns.test.ts` | TC-RP-005 追加（archive-only path assertion） |
| `specrunner/changes/merged-to-archive-consolidation/delta-specs/cli-commands/spec.md` | PR #347 漏れ箇所 + 本 request 変更分を一括カバーする delta spec |

## 関連 PR / ADR

- PR #347: `requests-to-drafts-restructure` — drafts/ 一本化の設計。baseline 整合性が部分的に取り残された
- PR #348: `requests/merged を changes/archive に統合` — 物理 file 移動完了（44 件救済 + directory 削除）
