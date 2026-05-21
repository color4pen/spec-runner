# Design: merged-to-archive-consolidation

## Summary

PR #348 で `specrunner/requests/merged/` の物理ファイルを `specrunner/changes/archive/` に移動済み。本変更は **src 参照と baseline spec を物理状態に整合させる cleanup**。

## Approach

### 1. `checkSlugCollision` の 3 経路 → 2 経路縮退

**現状**: drafts / requests/merged / changes/archive の 3 経路チェック
**変更後**: drafts / changes/archive の 2 経路チェック

`store.ts` から `MERGED_SUBDIR` 定数と Check 2 ブロックを削除。物理 dir が存在しないため dead code。

### 2. `RequestState` 型の完全削除

`types.ts` の `RequestState = "active" | "merged"` は `manager.ts` → `request-list.ts` の STATE 列でしか使われない。かつ `state: "active" as const` の固定値ハードコード。情報量ゼロの型 + field + 表示列をまとめて削除。

影響チェーン:
- `types.ts`: `RequestState` 型定義削除
- `manager.ts`: `import type { RequestState }` 削除、`list()` 戻り値から `state` field 削除
- `request-list.ts`: STATE 列削除、`manager.list()` の新しい戻り値型に追従

### 3. `request-migrate-flat.ts` の削除

dir→flat 形式の migration utility。PR #344 / #348 で目的を完遂、CLI subcommand 登録なし、内部呼び出しゼロ (grep 確認済)。utility ファイル + 対応 test ファイルをともに削除。

### 4. `finish-orchestrator.test.ts` の mock 修正

`makeStubFs` の `exists` mock に `p.includes("merged")` の分岐がある。物理 dir が存在しない前提に合わせて分岐を削除。

注意: `src/core/finish/` 内の "merged" 参照 (orchestrator.ts, spec-merge.ts, job-state-update.ts) は **PR merge 操作** に関するもので、`requests/merged/` directory とは無関係。変更対象外。

### 5. delta spec による baseline 整合

cli-commands/spec.md の baseline に `requests/active/` パス言及が **21 箇所** 残存。原因は PR #347 の delta merge で以下の requirement が漏れたため:

| 対象 Requirement | 修正内容 |
|---|---|
| `specrunner --help` は主語別グルーピングで表示される | L397 "active 配下" → "drafts 配下", L399 同 |
| `specrunner request new <slug>` は template から request.md を作成する | L555 "active / merged" → "drafts + changes/archive", L557-558 path 更新, L561-564 scenario path 更新 |
| `specrunner request show <slug>` は request.md の本文を表示する | L578 path 更新 |
| `specrunner request rm <slug>` は active 配下から request を削除する | title + L594 path 更新 |
| `specrunner request` サブコマンド群が動作する | L450-463 scenario path 更新 |
| `specrunner job` サブコマンド群が動作する | L490-493 scenario path 更新 |
| `specrunner doctor` は 7 カテゴリの環境前提条件を診断する | L116-148 の `changes/{active,merged}/` は **スコープ外** (= 別 issue) |

delta spec の **Replaces** タグで各 requirement を更新し、finish 時の spec-merge で baseline に反映される。

結果状態: finish 後の baseline で `requests/active/` / `requests/merged/` パス言及が **完全消失**。

### 6. doctor の workflow-structure check

`src/core/doctor/checks/repo/workflow-structure.ts` は PR #347 で `specrunner/drafts/` + `specrunner/changes/` チェックに更新済み。`requests/merged/` 期待は既にない。**確認のみ、no-op**。

ただし、baseline spec (L116-148) にはまだ `specrunner/changes/{active,merged}/` の古い記述が残る。これは **スコープ外** (= 別 issue)。

### 7. README / skill の "merged" 言及

README の唯一の "merged" 言及は `PR #40 merged` (= PR merge イベント)。`requests/merged/` directory への言及ではないため **変更不要**。

skill ファイルに `requests/merged/` directory への言及はない (grep 確認済)。

### 8. 再現 test (静的 assertion)

以下の静的 assertion test を追加し、退行を防止:
- `store.ts` source に `MERGED_SUBDIR` 文字列が含まれない
- cli-commands/spec.md baseline に `requests/active/` path 言及が含まれない (finish 後に検証)
- cli-commands/spec.md baseline に `requests/merged/` path 言及が含まれない (finish 後に検証)

注: baseline spec の内容検証は finish 後にしか確認できないため、test は source code level の assertion に限定。spec 整合性は delta spec の網羅的記述で担保。

## Design Decisions

### `RequestState` を rename でなく削除

`"active" | "merged"` の 2 値のうち `"merged"` 概念を消すなら `"active"` 1 値になる。1 値の enum は型として無意味。さらに `state: "active" as const` の固定値ハードコードで情報量がゼロ。field ごと削除が唯一の判断。

### fallback path `requests/active/` の扱い

L710-717, L739, L756-761 の `requests/active/` fallback 言及は **deprecation path として意図的に残存**。実装 (`src/core/request/store.ts`) は `drafts/` のみ参照に縮退済みだが、spec は旧 path からの graceful migration を記述している。本 request のスコープは `requests/merged/` の完全消去であり、`requests/active/` fallback の廃止は別 issue。

### spec L116-148 (doctor の `changes/{active,merged}/` 記述) をスコープ外に

実装は PR #347 で `drafts/ + changes/` チェックに更新済み。baseline spec の L116-148 は古い openspec 時代の記述で実装と乖離しているが、`requests/merged/` とは無関係 (= `changes/merged/` は別概念)。本 request で扱うと scope が膨張するため別 issue 化。

## Out of Scope

- `requests/active/` fallback path の廃止
- `specrunner/changes/{active,merged}/` の doctor spec 更新 (L116-148)
- `requests/` directory 自体の削除
- prompt ファイルの修正
