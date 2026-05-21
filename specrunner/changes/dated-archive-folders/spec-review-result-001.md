# Spec Review Result: dated-archive-folders

- **verdict**: needs-fix

---

## Summary

仕様全体はスコープが明確・後方互換の設計判断も適切・タスク分解も具体的で、実装に直行できる水準。ただし `delta.md` に 1 件、実装者が誤った方向に進む可能性のある仕様矛盾がある。

---

## Finding F-001 — delta.md の "UTC ではなくローカル日付" がコードと矛盾する

**重大度**: needs-fix（canonical spec の記述誤り）

**箇所**: `specrunner/changes/dated-archive-folders/specs/cli-finish-command/delta.md` line 5

```
`<YYYY-MM-DD>` は finish 実行時刻の日付（UTC ではなくローカル日付、`new Date().toISOString().slice(0, 10)`）
```

**問題**: 「UTC ではなくローカル日付」と記述しているが、直後のコード `new Date().toISOString().slice(0, 10)` は UTC 日付を返す。例えば JST (UTC+9) で深夜 1:00 に finish を実行した場合、ローカルでは 2026-05-21 でも toISOString は 2026-05-20 を返す。

**request.md・tasks.md との整合**: request.md (要件 1) と tasks.md (Task 3) はどちらも `toISOString().slice(0, 10)` を示しており UTC で一貫している。矛盾しているのは delta.md の説明テキストのみ。

**implementer への影響**: delta.md は archive 後に authority spec の一部になる。実装者が description を優先するとローカル日付取得 (`getFullYear/getMonth/getDate`) を実装し、request.md/tasks.md と乖離する。

**修正内容**: delta.md line 5 の「UTC ではなくローカル日付」を削除または「UTC の YYYY-MM-DD 形式」に修正する。

```diff
- `<YYYY-MM-DD>` は finish 実行時刻の日付（UTC ではなくローカル日付、`new Date().toISOString().slice(0, 10)`）。
+ `<YYYY-MM-DD>` は finish 実行時刻の UTC 日付（`new Date().toISOString().slice(0, 10)` = UTC の YYYY-MM-DD）。
```

---

## 確認済み事項（問題なし）

| 観点 | 評価 |
|------|------|
| delta.md フォーマット (## Requirements / ### Requirement: / MUST / #### Scenario:) | ✓ 全ルール充足 |
| コードブロックを Requirement〜Scenario 間に挟んでいないこと | ✓ |
| `parseArchiveDirName` の regex `^(\d{4}-\d{2}-\d{2})-(.+)$` の網羅性 | ✓ 日付付き・なし両方カバー |
| `checkSlugCollision` の修正 (match 変数で stat path を構築) | ✓ tasks.md Task 5 が正しく対応 |
| TC-034 制約 (paths.ts は他 src/ を import しない) | ✓ 明示されている |
| `now` injectable によるテスト容易性 | ✓ |
| 既存 archive dir を touch しない方針 | ✓ 明示 |
| スコープ外事項の明示 | ✓ |
| セキュリティ: 日付文字列は `\d{4}-\d{2}-\d{2}` 固定, path traversal リスクなし | ✓ |
| delta-spec-validation-result: approved | ✓ |

## 観察事項（fix 不要）

- request.md で「Check 3 (= archive 経路の slug 衝突検出)」と書いているが、store.ts のコードコメントは「Check 2」。実装コードは Check 2 が正しい。tasks.md は正しいファイルと変更箇所を指しているため実装に支障なし。
