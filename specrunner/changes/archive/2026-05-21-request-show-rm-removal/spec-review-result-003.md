# Spec Review Result: request-show-rm-removal

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-21

---

## 前回レビュー（002）からの進捗

| 前回指摘 | 状態 |
|---|---|
| [BLOCKER] `（drafts パス対応）` Requirement — `request show` 孤立 Scenario が baseline に残存 | ✅ 修正済み |

delta spec の `## Requirements` に `（drafts パス対応）` MODIFIED 版が追加され、`request show` 関連 Scenario 2 件（「slug で表示」「旧 path fallback」）が除去されている。`request validate` / `request review` の Scenario は維持されている。

---

## 全体評価

### delta spec 網羅性チェック

| 対象 | delta spec での扱い | 確認 |
|---|---|---|
| `request show` Requirement 削除 | `## Removed` に記載 | ✅ |
| `request rm` Requirement 削除 | `## Removed` に記載 | ✅ |
| `（drafts テーブル更新）` — show/rm をテーブルから除去 | MODIFIED（6 サブコマンドに更新） | ✅ |
| `--help` USAGE ブロックから show/rm 行を除去 | MODIFIED（6 request commands） | ✅ |
| `（drafts パス対応）` — show Scenario 2 件を除去 | MODIFIED（validate/review Scenario のみ） | ✅ |
| slug validation — show/rm を本文から除去 | MODIFIED（header は baseline と完全一致） | ✅ |

### rules.md 規律チェック

| 規律 | 確認 |
|---|---|
| MODIFIED header が baseline と完全一致 | ✅ 全 MODIFIED 対象でヘッダー一致を確認 |
| 各 Requirement に normative keyword (SHALL/MUST) | ✅ 全 Requirement で確認 |
| `## Removed` がリスト形式 | ✅ |
| `（drafts テーブル更新）` に Scenario なし | ⚠️ 既存 baseline の質的問題（継承）。delta-spec-validation-result は approved。本変更が新規導入した問題ではないため非ブロッキング |

### tasks.md ↔ design.md ↔ request.md 整合性

- design.md の Affected Files 7 件はすべて tasks.md に対応する task として定義されている。
- `validation-tc.test.ts` の TC-46〜TC-48 削除は request.md に未記載だが、design.md と tasks.md で正しく捕捉されており実装上の問題はない（spec-review-001 で MINOR として確認済み）。

---

## セキュリティ評価

削除のみの変更であり攻撃対象領域を縮小する方向。新たなセキュリティリスクなし。

slug validation (`/^[a-z0-9][a-z0-9-]{0,63}$/`) による path traversal 防止は `new / validate / review` の残存コマンドで引き続き維持される。OWASP Top 10 上の懸念点なし。

---

## Findings

なし。

---

## 修正必要箇所サマリー

なし。
