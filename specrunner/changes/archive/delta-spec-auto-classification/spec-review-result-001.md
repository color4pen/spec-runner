# Spec Review Result: delta-spec-auto-classification

- **verdict**: needs-fix
- **reviewed-at**: 2026-05-19
- **reviewer**: spec-reviewer

---

## Overall Assessment

設計思想・design.md の意思決定・tasks.md のタスク分解は高品質。ただし **このチェンジフォルダ自身の delta spec ファイルに複数の重大な誤りがあり**、現状では実装後に `specrunner finish` が失敗する。

---

## CRITICAL: 自己参照マイグレーションの欠落

### C-01: tasks.md に「delta spec 自身の新形式変換」タスクが存在しない

`specs/spec-merge/spec.md`, `specs/delta-spec-rule/spec.md`, `specs/prompt-fragment-registry/spec.md` はいずれも旧形式（`## ADDED Requirements`）で書かれている。

T-01 の実装後、新 `parseDeltaSpec` は旧形式を空結果として返す（設計通り）。その状態で `specrunner finish` を実行すると、3 ファイルすべてが「empty delta」エラーになり finish が止まる。

**memory に記録済みのパターン**（`project_self_referential_migration_pattern.md`）: "branch で build → new bin で finish の 1-PR モデル" = finish は新コードが入った後に実行する。このパターンを前提にしても、delta spec ファイル自体を新形式に変換する明示タスクが tasks.md に存在しない。

**要求する修正**: tasks.md に以下を追加する。

```
## T-00: このチェンジフォルダの delta spec を新形式に変換（自己マイグレーション）

本チェンジは自己参照的変更のため、実装完了後かつ `specrunner finish` 実行前に
以下 3 ファイルを新形式に書き換える:

- specrunner/changes/delta-spec-auto-classification/specs/spec-merge/spec.md
- specrunner/changes/delta-spec-auto-classification/specs/delta-spec-rule/spec.md
- specrunner/changes/delta-spec-auto-classification/specs/prompt-fragment-registry/spec.md

タイミング: T-01（新 parseDeltaSpec 実装）完了後、かつ `specrunner finish` 実行前。
注: self-referential migration pattern に従い finish は新コード（PR merge 後または local 新 bin）で実行。
```

---

## HIGH: delta spec ファイルの形式不整合

### H-01: 混在形式 — 旧ヘッダー + 新形式セクションが共存している

3 ファイルすべてが `## ADDED Requirements`（旧形式）+ `## Removed` / `## Renamed`（新形式リスト）を同時に持つ。この混在は旧 merger でも新 merger でも正しく処理されない:

- **旧 merger**: `## ADDED Requirements` を処理するが `## Removed` / `## Renamed`（リスト形式）を認識しない → 削除・rename が適用されない
- **新 merger**: `## ADDED Requirements` を無視して空を返す → empty delta エラー

現時点でこの delta spec を旧 merger に渡すと `## Removed` の削除指示が黙って無視される。

**要求する修正**: 3 ファイルをすべて完全な新形式に書き直す（`## ADDED Requirements` → `## Requirements`）。

### H-02: `specs/spec-merge/spec.md` — "empty delta (0 entries) is a fatal error" の二重処理

`## ADDED Requirements` に新版の "empty delta (0 entries) is a fatal error" が含まれており、かつ `## Removed` にも同じ名前がリストされている。

新形式の意味論では:
- `## Requirements` に書けば baseline に同名が存在するため **MODIFIED** に自動分類される
- `## Removed` に書けば baseline から削除される

MODIFIED + REMOVED が同名で競合する。`applyMerge` 内で削除後に MODIFIED 適用を試みると、対象が存在せず fail する可能性がある。

**要求する修正**: `## Removed` から "empty delta (0 entries) is a fatal error" を削除する。`## Requirements` だけに書けば MODIFIED として正しく処理される。

### H-03: `specs/spec-merge/spec.md` — `## Renamed` エントリがすべて no-op

`## Renamed` セクションの 4 エントリは全て `"X" → "X"` 形式（旧名 = 新名）で意味がない:

```
- "delta apply skip/fail is determined by request type" → "delta apply skip/fail is determined by request type"
- "cross-capability delta apply is atomic" → "cross-capability delta apply is atomic"
- ...
```

これらは propose agent が生成した artifact と思われる。新形式の merger では rename 対象を baseline で探して同名に rename するため、実害はないが仕様書としての信頼性を損なう。

また baseline spec の "baseline header consistency check before merge application" 要件のシナリオが旧形式表現（`## MODIFIED Requirements`、`## ADDED Requirements`）を含んでいるが、この delta spec はそのシナリオ文言の更新を明示的にカバーしていない。

**要求する修正**: no-op の `## Renamed` エントリを全削除する。"baseline header consistency check before merge application" のシナリオ更新が必要な場合は `## Requirements` に明示的に書く。

---

## MEDIUM: 設計の明示化

### M-01: null baseline での `## Removed` / `## Renamed` バリデーションがタスク化されていない

`specs/spec-merge/spec.md` の "classifyDeltaSpec" 要件に「`baselineRequirements` が `null` の場合 removed / renamed は empty arrays を返す MUST」と書かれているが、tasks.md T-03 にこのバリデーション追加のサブタスクが存在しない。

**要求する修正**: T-03 に「baseline が null かつ removed/renamed が非空のとき エラーを返す」バリデーションを追加タスクとして明記する。

---

## LOW: 軽微な不整合

### L-01: delta-spec-validation-result.md は現在 "approved" だが新 dsv では reject される

既知のブートストラッピング問題であり、C-01 の対応（新形式変換）で自然に解消する。実装上の対応不要だが、implementer が混乱しないよう tasks.md の T-00 に note を入れることを推奨。

### L-02: T-14 の grep 確認対象

T-14「src/ 配下に旧形式 section header への参照が残っていないことを grep で確認」において、変換前の delta spec ファイル自体（`specrunner/changes/` 配下）が一時的に旧形式を含むため、grep の除外対象を明確にしておく必要がある。

---

## Security Review

本チェンジに認証・ユーザー入力処理・Web API・DB クエリは含まれない。

- **Path construction**: capability 名から baseline パス（`specrunner/specs/<capability>/spec.md`）を構築するロジックは既存アーキテクチャと同様。新規の path traversal 面は生じない。
- **Regex**: `## Renamed` の parse に使う `"(.+?)"\s*→\s*"(.+?)"` は限定的で、ReDoS リスクはない（`→` でアンカーされる）。
- **OWASP Top 10**: 該当なし。

---

## 要修正箇所サマリー

| ID | 重大度 | 対象 | 内容 |
|---|---|---|---|
| C-01 | CRITICAL | tasks.md | T-00 追加: 自己マイグレーションタスク |
| H-01 | HIGH | specs/\*/spec.md (3 件) | 旧形式ヘッダーを `## Requirements` に変換 |
| H-02 | HIGH | specs/spec-merge/spec.md | `## Removed` から "empty delta..." を削除（MODIFIED で十分） |
| H-03 | HIGH | specs/spec-merge/spec.md | no-op `## Renamed` エントリを全削除 |
| M-01 | MEDIUM | tasks.md | T-03 に null baseline バリデーションを追記 |
| L-01 | LOW | (note) | delta-spec-validation-result.md はブートストラップ上の既知問題 |
| L-02 | LOW | tasks.md | T-14 の grep 除外対象を明確化 |
