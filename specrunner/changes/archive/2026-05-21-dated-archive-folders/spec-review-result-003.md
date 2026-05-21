# Spec Review Result 003: dated-archive-folders

- **verdict**: approved

---

## Summary

result-002 で指摘した F-002-A（canonical `spec.md` の "UTC ではなくローカル日付" 誤記述）が修正済み。`spec.md` line 7 は現在 "UTC の YYYY-MM-DD" と正しく記述されており、request.md・tasks.md・delta.md と整合している。全アーティファクトに問題なし。

---

## 修正確認

| Finding | 対象 | 修正前 | 修正後 | 確認 |
|---------|------|--------|--------|------|
| F-001 (result-001) | `delta.md` | "UTC ではなくローカル日付" | "UTC の YYYY-MM-DD" | ✓ |
| F-002-A (result-002) | `spec.md` line 7 | "UTC ではなくローカル日付" | "UTC の YYYY-MM-DD" | ✓ |

---

## 確認済み事項（問題なし）

| 観点 | 評価 |
|------|------|
| `spec.md` フォーマット（`## Requirements / ### Requirement: / MUST / #### Scenario:`） | ✓ 正規形式 |
| `spec.md` と request.md・tasks.md の UTC 記述一貫性 | ✓ 全ファイル `toISOString().slice(0, 10)` = UTC で統一 |
| `parseArchiveDirName` regex `^(\d{4}-\d{2}-\d{2})-(.+)$` の網羅性（日付付き / なし両方） | ✓ |
| `checkSlugCollision` 修正（`match` 変数で stat path 構築） | ✓ tasks.md Task 5 正確 |
| TC-034 制約（paths.ts は他 src/ を import しない） | ✓ 明示 |
| `now` injectable によるテスト容易性 | ✓ |
| 既存 archive dir を touch しない方針 | ✓ |
| import path（`src/core/request/store.ts` → `../../util/paths.js`） | ✓ 相対 path 正確 |
| スコープ外事項の明示 | ✓ |

## セキュリティレビュー（問題なし）

| 観点 | 評価 |
|------|------|
| 日付文字列: `toISOString().slice(0, 10)` は固定形式・外部入力なし | ✓ injection リスクなし |
| archive path: `changesDirRel()` + 固定 prefix + `dateStr` + 既存検証済 slug | ✓ path traversal リスクなし |
| `parseArchiveDirName` regex: filesystem dirName に適用、ユーザー直接入力の評価なし | ✓ |
| 認証・API・DB クエリへの影響なし | ✓ |

---

## 観察事項（fix 不要）

- `delta.md`（非標準ファイル）は result-002 F-002-B で指摘済みの observation。pipeline は通過しており、`spec.md` が canonical であるため実装への支障なし。削除は optional。
- request.md の「Check 3」と tasks.md の「Check 2」の表記差は result-001 で観察済み。tasks.md が正しいファイル・箇所を指しているため実装に支障なし。
