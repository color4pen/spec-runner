# Spec Review Result 002: dated-archive-folders

- **verdict**: needs-fix

---

## Summary

result-001 の F-001 fix が **非 canonical ファイル (`delta.md`) に適用されており、canonical delta spec (`spec.md`) は未修正のまま**。実装者が rules.md 記載の canonical path を読むと F-001 の bug がそのまま伝わる。

---

## Finding F-002-A — canonical delta spec `spec.md` に F-001 の修正が未反映 [needs-fix]

**箇所**: `specrunner/changes/dated-archive-folders/specs/cli-finish-command/spec.md` line 7

```
`<YYYY-MM-DD>` は finish 実行時刻の日付（UTC ではなくローカル日付、`new Date().toISOString().slice(0, 10)`）。
```

**問題**: `rules.md` は Delta spec の canonical path を `specrunner/changes/<slug>/specs/<capability>/spec.md` と定義している。F-001 の修正は `delta.md`（非 canonical ファイル）に適用されたが、`spec.md`（canonical file）は修正されていない。結果として implementer が `spec.md` を読むと "UTC ではなくローカル日付" という誤記述を参照し、`getFullYear/getMonth/getDate` でローカル日付を取得する実装を選ぶリスクがある。

**他アーティファクトとの整合**:
- `request.md` 要件 1: `toISOString().slice(0, 10)` = UTC で記述 ✓
- `tasks.md` Task 3: `toISOString().slice(0, 10)` = UTC で記述 ✓
- `delta.md`: "UTC の YYYY-MM-DD" で記述 ✓（ただし非 canonical）
- `specs/cli-finish-command/spec.md`: "UTC ではなくローカル日付" = **誤記述のまま** ✗

**修正内容**: `spec.md` line 7 を以下に更新する。

```diff
- `<YYYY-MM-DD>` は finish 実行時刻の日付（UTC ではなくローカル日付、`new Date().toISOString().slice(0, 10)`）。
+ `<YYYY-MM-DD>` は finish 実行時刻の UTC 日付（`new Date().toISOString().slice(0, 10)` = UTC の YYYY-MM-DD）。
```

---

## Finding F-002-B — 非標準ファイル `delta.md` の存在 [observation]

**箇所**: `specrunner/changes/dated-archive-folders/specs/cli-finish-command/delta.md`

他の change folder（`merged-to-archive-consolidation`, `request-review-detect-baseline-edit-intent`）は `specs/<capability>/spec.md` のみを持ち、`delta.md` というファイルは存在しない。`delta.md` は今回の change folder にのみ存在する非標準ファイルであり、pipeline の canonical path 定義にも含まれない。

加えて `delta.md` は `## New Requirement:` 形式を使っているが、`rules.md` の delta spec 記法は `## Requirements / ### Requirement:` を正規形式と定めている（`delta.md` のフォーマットは非準拠）。

F-002-A の fix（`spec.md` の正しい UTC テキストへの更新）が完了すれば `delta.md` は削除しても問題ない。ただし `delta-spec-validation-result.md` が `approved` を返しており pipeline は通過しているため、削除は optional。F-002-A を fix することが本 finding の実質的な解消策。

---

## セキュリティレビュー（問題なし）

| 観点 | 評価 |
|------|------|
| 日付文字列の生成: `toISOString().slice(0, 10)` は固定形式・外部入力を含まない | ✓ injection リスクなし |
| archive path: `changesDirRel()` + 固定 prefix + `dateStr` + slug（既存検証済） | ✓ path traversal リスクなし |
| `parseArchiveDirName` regex `^(\d{4}-\d{2}-\d{2})-(.+)$`: filesystem dirName に適用、ユーザー入力の直接評価なし | ✓ |
| 認証・API・DB クエリへの影響なし | ✓ |

---

## 確認済み事項（問題なし）

| 観点 | 評価 |
|------|------|
| `spec.md` のフォーマット (`## Requirements / ### Requirement: / MUST / #### Scenario:`) | ✓ 正規形式 |
| Requirement 本文に `MUST` 含む | ✓ |
| `### Requirement:` と `#### Scenario:` の間にコードブロックなし | ✓ |
| `parseArchiveDirName` の regex 網羅性: 日付付き / なし両方カバー | ✓ |
| `checkSlugCollision` 修正 (`match` 変数で stat path 構築) | ✓ tasks.md Task 5 正確 |
| TC-034 制約 (paths.ts は他 src/ を import しない) | ✓ 明示 |
| `now` injectable によるテスト容易性 | ✓ |
| 既存 archive dir を touch しない方針 | ✓ 明示 |
| スコープ外事項の明示 | ✓ |
| `tasks.md` の implementation task 記述 (Task 1–9) の具体性・正確性 | ✓ |
| `design.md` の設計判断 D1–D5 の適切性 | ✓ |
