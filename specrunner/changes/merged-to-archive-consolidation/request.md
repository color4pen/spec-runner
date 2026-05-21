# `requests/merged/` を `changes/archive/` に統合し archive 経路を真に一本化する

## Meta

- **type**: spec-change
- **slug**: merged-to-archive-consolidation
- **base-branch**: main
- **adr**: true

## 背景

PR #347 (= `requests-to-drafts-restructure`) で起票エントリポイントを `drafts/` に rename し、archive 経路を `changes/archive/<slug>/` に一本化する設計が入った。ただし **既存 `requests/merged/` 140 件の物理削除は明示的にスコープ外** として read-only 保持に留めた。

その後、PR #348 (= `requests/merged を changes/archive に統合`) で **物理 file 移動を完了済み**:
- 重複していなかった 44 件を `changes/archive/<slug>/request.md` (= dir 形式) に救済 (= migration 注釈付き)
- `specrunner/requests/merged/` directory を削除
- `changes/archive/` 合計 151 件 (= 既存 107 + 新規 44)

物理 file レベルでは整合済み。本 request は **その物理状態に合わせて src 参照と baseline spec を整合させる cleanup** を担う。物理 dir なしでも src は ENOENT silent skip で動作するため runtime は壊れていないが、dead reference と spec 乖離が累積している。

### `requests/merged/` の現参照箇所

| ファイル | 用途 |
|---|---|
| `src/core/request/store.ts:8,65-66` | `checkSlugCollision` の MERGED_SUBDIR チェック (= PR #347 で 3 経路化した内の 1 つ) |
| `src/core/request/types.ts:39` | `RequestState = "active" \| "merged"` 型定義 |
| `src/core/request/manager.ts:9,41,43,47` | `RequestState` の使用 + `state: "active" as const` hardcode |
| `src/core/command/request-list.ts:11,15` | STATE 列の表示 |
| `src/core/command/request-migrate-flat.ts:25-27` | dir → flat 形式 migration utility の merged 走査 |

これらは「物理 dir が現存する 140 件と衝突検出するため」の参照であり、merged を物理削除すると **dead code 化** する = 同 PR で削除整合する必要。

### PR #347 の delta spec 漏れ箇所 (= 本 request で同時是正)

PR #347 finish で delta spec → baseline merge は走ったが、cli-commands/spec.md の以下行は **delta が言及しなかった** ため baseline に古い記述が残っている:

| 行 | 現 baseline | あるべき状態 |
|---|---|---|
| L397 | `request ls   active 配下の request 一覧` | `request ls   drafts 配下の request 一覧` |
| L399 | `request rm <slug>   active 配下から削除` | `request rm <slug>   drafts 配下から削除` |
| L555 | `checkSlugCollision で active / merged 配下の slug 重複をチェック` | drafts + changes/archive の 2 経路に縮退 (= 本 request 後) |
| L557 | `specrunner/requests/active/<slug>.md にファイルを書き出す` | `specrunner/drafts/<slug>.md` |
| L558 | `Created: specrunner/requests/active/<slug>.md を出力` | `Created: specrunner/drafts/<slug>.md` |
| L561-564 | Scenario 内の `specrunner/requests/active/my-feature.md` 言及 | `specrunner/drafts/my-feature.md` |

本 request の delta spec で **これらも同時に baseline 整合** を取る。

### 構造的観察

PR #347 で baseline 整合性が部分的に取り残された原因は LLM 不確定性: design agent に「baseline の全該当行を網羅的に grep して delta に組み込め」と要求しているが、53 行ある cli-commands/spec.md のうち 5-6 行が漏れた。spec-review も catch できなかった。

本 request では特に **「PR #347 で漏れた箇所も含めて baseline 整合性を完遂する」** ことを明示的な scope とし、design agent / spec-review に網羅的 grep を要求する。

## 思想

### history 保全 + 経路一本化

「冗長性を消す = 削除」ではなく、「不足分を移行 → 削除」で history を保つ。`requests/merged/` のみ 44 件は **`changes/archive/<slug>/request.md` (= dir 形式) として** 救済する。

archive dir 形式に乗ることで:
- LLM パターンソース (= `request-patterns.ts`) のカバレッジが 107 件 → 151 件に拡大
- `checkSlugCollision` の対象が drafts + archive の 2 経路だけで完結
- doctor / type / migration utility から `merged` 概念を完全消去

### 移行ファイルの context 不足を明示

44 件は archive folder 化前の古い request = `design.md` / `tasks.md` / `delta-specs/` 等の作業ファイルがない。`request.md` 単独でも history としての価値はあるが、後で読んだ時の context 不足を補うため file 内に注釈を入れる。

例 (= request.md 末尾に追加):

```
---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/<slug>.md` by `merged-to-archive-consolidation`.
```

特殊ケース: `agent-tool-constraints-research` は flat .md と sibling dir (= `research-result.md` を持つ) を併存している。dir 内容も archive に救済する。

### baseline 整合性の完遂を明示的スコープに

PR #347 の delta merge 漏れと同型事故を防ぐため、本 request の delta spec は cli-commands/spec.md の **全該当行を網羅的に grep し**、active/merged 言及を漏れなく整合させる。spec-review はこの網羅性を verdict 条件に含める。

## 要件

### 1. `store.ts` の `checkSlugCollision` 縮退

`src/core/request/store.ts:8,65-66` の `MERGED_SUBDIR` 定数 + Check 2 ブロックを削除。`checkSlugCollision` を **drafts + archive の 2 経路チェック** に縮退。

### 2. `types.ts` の `RequestState` 型を削除

`src/core/request/types.ts:39` の `RequestState = "active" | "merged"` を **削除** する。

理由: `RequestState` 型の使用は `src/core/request/manager.ts` のみ (= 調査済)。manager.ts では `list` 戻り値の `state` field でしか使われておらず、その field は `request-list.ts` の STATE 列表示のみ (= `state: "active" as const` の固定値 hardcode)。

= 型・field・表示列を全て **削除** が一意の判断。rename ではない。

### 3. `manager.ts` の state field 整理

`src/core/request/manager.ts:41,43,47` の `state` field を見直し。`request-list.ts` でしか消費されないため:
- `RequestState` 型に追従して update
- 表示が常に固定値で意味なしなら field 自体を削除

### 4. `request-list.ts` の STATE 列削除 (= 場合により)

`src/core/command/request-list.ts:11,15` の STATE 列は表示する state が固定値で意味がない場合は削除。

### 5. `request-migrate-flat.ts` の削除

`src/core/command/request-migrate-flat.ts` は dir 形式 → flat 形式 への migration utility だが、drafts/ 配下も requests/merged/ 配下も既に flat 形式に統一済 (= PR #344 / PR #348 で完遂)、かつ CLI subcommand として登録もされていない (= 内部呼び出しもゼロ件、grep 確認済)。

→ utility ファイル自体を **削除**。

### 6. `cli-commands` capability の delta spec で Requirement を整合

本 request の変更が反映されるよう、`cli-commands` capability の **delta spec** に Requirement を書く。

期待する Requirement の内容:
- `request new` / `request rm` / `request ls` / `request show` 系の path 仕様が `drafts/` 統一であること
- `checkSlugCollision` の参照経路が「drafts + changes/archive」の 2 経路であること
- `requests/merged/` への参照が仕様から消えていること

delta の Requirement header は baseline の現状と完全一致させる (= tool が MODIFIED として自動分類する条件)。

**網羅性 (= 結果状態として表現)**: 本 request の delta 整合の結果、finish 後の baseline で `requests/active/` / `requests/merged/` への path 言及が **完全消失** することを期待する。PR #347 の delta merge 漏れ箇所も本 request の delta で同時に覆われる想定。

**重要 — 規律遵守**: baseline (= `specrunner/specs/cli-commands/spec.md`) は **PR 内で read-only**。本 request では一切編集対象として扱わない。authority spec の更新は finish の spec-merge tool が delta から自動的に行う。これは `specrunner/rules.md` の "spec authority lifecycle" セクション (= 全 step 共通の MUST NOT) に従う規律。

### 7. doctor の workflow-structure check (= 確認のみ、実質 no-op)

`src/core/doctor/checks/repo/workflow-structure.ts` を確認したが `requests/merged/` 期待は **既に存在しない** (= PR #347 で更新済)。本 request では **確認のみで no-op** (= ファイル変更なし)。`specrunner/changes/{active,merged}` の古い openspec 時代の記述 (= cli-commands/spec.md L116-148) は **本 request ではスコープ外** (= 別 issue 化、本 request は merged 削除と drafts 整合性のみ)。

### 8. doc / skill 更新

- `README.md` の merged 言及があれば削除
- 関連 skill (= acceptance-and-issue-audit / rebase-finish 等) の merged 言及あれば削除

### 9. test 更新

影響する test:
- `tests/unit/core/request/store.test.ts` (= checkSlugCollision の merged check 削除、TC-ST-006 削除)
- `tests/unit/core/command/request-migrate-flat.test.ts` (= test ファイル自体を削除、src の utility 削除に追従)
- `tests/unit/util/slugify.test.ts` (= mergedDir 設定箇所、修正)
- `tests/finish-orchestrator.test.ts:99` (= `p.includes("merged")` mock 修正)
- `tests/unit/context/request-patterns.test.ts` (= archive 経路でカバレッジ拡大 test 追加)

### 10. 再現 test (= 静的 unit test)

- `requests/merged/` directory が main 上に存在しないことを assert
- `store.ts` source に `MERGED_SUBDIR` 文字列が含まれないことを assert
- cli-commands/spec.md に `requests/active/` / `requests/merged/` への path 言及が含まれないことを assert (= baseline 整合性 catch)

## スコープ外

- **migration CLI 実装** — 物理 file 移動は PR #348 で完了済、CLI は不要 (= 履歴ツールとしても再利用機会がない判断)
- **`specrunner/changes/{active,merged}/` の古い openspec 時代の記述** (= cli-commands/spec.md L116-148) — 別 issue 化、本 request は merged 削除と drafts 整合性のみ
- **`requests/` directory 自体の削除可否** — merged + active 廃止後の判断、本 request は merged の中身整理のみ
- **prompt ファイルの修正** — `request.md` ファイル名は維持、prompt 層は path 抽象化済で影響なし
- **archive にしかない slug の削除** — 0 件想定、本 request は merged 側の不足分を補うのみ
- **PR #347 の retrospective 修正** — 別 PR で扱わず、本 request の延長として一括是正

## 受け入れ基準

- [ ] `specrunner/requests/merged/` directory が main 上に存在しない (= PR #348 で完了済の状態維持)
- [ ] `specrunner/changes/archive/` 配下に **151 件** のディレクトリが存在する (= PR #348 で完了済の状態維持)
- [ ] `store.ts` の `checkSlugCollision` が drafts + archive の 2 経路チェックに縮退 (= `MERGED_SUBDIR` 参照消失)
- [ ] `types.ts` の `RequestState` 型自体が削除されている (= rename ではない、型ごと削除)
- [ ] `manager.ts` / `request-list.ts` が `RequestState` 整理に追従
- [ ] `request-migrate-flat.ts` および対応する test ファイルが削除されている (= utility 自体不要、grep でゼロ参照確認済)
- [ ] doctor の workflow-structure check が `requests/merged/` を期待しない
- [ ] cli-commands/spec.md の baseline で **本 request 変更分 + PR #347 漏れ箇所** (= L397/L399/L555/L557/L558/L561-564) が一括整合されている
- [ ] cli-commands/spec.md 全行 grep で `requests/merged/` への path 言及が **完全消失** している (= 再現 test)。`requests/active/` については、deprecation fallback path として意図的に残存する箇所（L710-717, L739, L756-761 相当）を除き消失していること（fallback path 廃止は本 request のスコープ外 — design.md "Out of Scope" 参照）
- [ ] `request-patterns.ts` が 151 件カバレッジでパターン収集できる (= test で確認)
- [ ] `README.md` / 関連 skill の merged 言及が削除されている
- [ ] 既存 test (= store / request-migrate-flat / request-patterns / slugify / finish-orchestrator 等) が新設計に合わせて update され green
- [ ] 新規再現 test (= `MERGED_SUBDIR` 文字列不在 / `requests/active/` path 不在等の静的 assertion) が追加され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「merged → archive 統合の判断」「44 件不足分を archive 側に救済する判断 (= PR #348 で実施済)」「archive 経路を真の一本化に到達」「PR #347 の baseline 整合性漏れの retrospective 是正」「LLM 不確定性の構造観察」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
