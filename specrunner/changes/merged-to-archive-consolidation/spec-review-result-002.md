# Spec Review Result: merged-to-archive-consolidation

- **verdict**: approved
- **reviewed-at**: 2026-05-21

---

## Summary

spec-review-result-001 で指摘した 5 件のうち CRITICAL 2 件・MUST FIX 1 件・MINOR 1 件が解消済み。MEDIUM 1 件（Problem 4）は設計上の既知不一致として観察に留め、ブロックしない。実装進行可。

---

## 001 指摘の解消確認

### Problem 1（CRITICAL → ✓ 解消）: `request rm` header mismatch

`specs/cli-commands/spec.md` に `## Renamed` セクションが追加された:

```
## Renamed
- "`specrunner request rm <slug>` は active 配下から request を削除する"
  → "`specrunner request rm <slug>` は drafts 配下から request を削除する"
```

baseline L592 の header と完全一致する old name が `## Renamed` に記載されており、tool が MODIFIED として処理できる。✓

### Problem 2（CRITICAL → ✓ 解消）: `flat パス対応` Requirements 未除去

`specs/cli-commands/spec.md` に `## Removed` セクションが追加された:

```
## Removed
- "`specrunner request` サブコマンド群が動作する（flat パス対応）"
- "`specrunner job` サブコマンド群が動作する（flat パス対応）"
```

baseline L671 / L690 の header と完全一致。finish 後に両 Requirement が baseline から削除される。✓

### Problem 3（MUST FIX → ✓ 解消）: tasks.md の ADR path が rules.md 違反

tasks.md Task 12 から `**File**: docs/adr/NNNN-...` 行が削除され、記録内容の箇条書きのみになっている。adr-gen step に path 決定を委ねる形式。✓

### Problem 4（MEDIUM → 観察継続）: acceptance criteria と design.md の矛盾

acceptance criteria:
> cli-commands/spec.md 全行 grep で `requests/active/` への path 言及が **完全消失**

baseline 実態（finish 後も残る箇所）:
- L710-716: `request show` fallback scenario（`requests/active/` を deprecation path として）
- L739: `show <slug>` テーブルの fallback 説明
- L756-761: `job start` fallback scenario
- L766: `job finish` auto-detect 廃止の説明

design.md は `requests/active/` fallback を「意図的残存」と明記しており、delta spec もこれを正しく実装している。acceptance criteria が過剰な要求になっているが、request.md は immutable（spec-fixer の touch 範囲外）であり修正経路が存在しない。

**判断**: delta spec と tasks.md は設計決定（fallback 保持）を正しく実装しており、実装上の問題はない。acceptance criteria の「完全消失」アサーションは静的 regression test（Task 9）の対象から除外されており（design.md の注記通り source code level assertion に限定）、実装 green への支障はない。ブロックしない。

### Problem 5（MINOR → ✓ 解消）: `request-patterns.test.ts` coverage task 欠落

tasks.md に Task 9b として追加されている。✓

---

## 追加確認事項

### delta spec 形式（canonical: `specs/cli-commands/spec.md`）

- `## Requirements` セクション: ✓ 全 Requirement に `### Requirement:` header + 1 つ以上の `#### Scenario:`
- MUST / SHALL keyword: ✓ 全 Requirement 本文に normative keyword あり
- header 完全一致（MODIFIED 対象）:
  - `specrunner --help` → baseline L382 と一致 ✓
  - `specrunner request new <slug>` → baseline L548 と一致 ✓
  - `specrunner request show <slug>` → baseline L572 と一致 ✓
  - `specrunner request サブコマンド群が動作する` → baseline L432 と一致 ✓
  - `specrunner job サブコマンド群が動作する` → baseline L475 と一致 ✓
- `checkSlugCollision` は baseline に standalone Requirement が存在しないため ADDED として正しく分類される ✓
- `## Renamed` / `## Removed` の名前が baseline header と完全一致 ✓

### `delta-specs/` との乖離

`delta-specs/cli-commands/spec.md` は `## Renamed` / `## Removed` セクションを欠いており canonical `specs/` と内容が diverge している。rules.md の正規 path は `specs/` であり `delta-specs/` は参照されないため実害なし。cleanup 対象として残る。

### security スコープ

slug validation（`/^[a-z0-9][a-z0-9-]{0,63}$/`）が全コマンドの入力検証に明記されており、path traversal 防止 scenario も `request rm` / `request new` で明示。OWASP 的な入力検証の問題はない。✓

### tasks.md 網羅性

| 要件 | Task |
|---|---|
| store.ts MERGED_SUBDIR 削除 | Task 1 |
| types.ts RequestState 型削除 | Task 2 |
| manager.ts state field 削除 | Task 3 |
| request-list.ts STATE 列削除 | Task 4 |
| request-migrate-flat.ts 削除 | Task 5 |
| store.test.ts TC-ST-006 削除 | Task 6 |
| slugify.test.ts merged 参照削除 | Task 7 |
| finish-orchestrator.test.ts mock 修正 | Task 8 |
| 再現 test（MERGED_SUBDIR 不在） | Task 9 |
| request-patterns.test.ts coverage 拡大 | Task 9b |
| delta spec 記述 | Task 10 |
| typecheck + test green 確認 | Task 11 |
| ADR 生成 | Task 12 |

受け入れ基準の全項目が tasks.md に対応する Task を持つ。✓

---

## 確認済み（問題なし）

- `delta-spec-validation-result.md`: approved ✓
- design.md の src 変更方針（MERGED_SUBDIR 削除、RequestState 型削除、request-migrate-flat.ts 削除）: 論理的に一貫 ✓
- doctor の workflow-structure check は no-op（確認のみ）として tasks に非記載 — 正しい判断 ✓
- README / skill の merged 言及: README は「PR merge イベント」の merged であり directory 参照ではない、skill も言及なしで変更不要 ✓
