# Design: request-review-detect-baseline-edit-intent

## Overview

`request-review-system.ts` の authority path 検出ルールを **edit verb 列挙** から **intent 判定** に抽象化する。

現行ルールは `MODIFIED / ADDED / を更新 / を作成` という具体 verb の列挙に依存しており、列挙外の表現（行番号指定 `L397: A → B`、grep 命令、completeness 要求等）を catch できない。issue #299 / #349 で観測された 6 件の同型事故の根本原因はこの検出漏れにある。

## Design Decision

### Intent ベース検出への抽象化

reviewer agent (= LLM) に対して、authority path 言及を検出した際に **言及の intent を 3 分類で判定** させる:

1. **参照 / 言及** (= read-only reference) — HIGH 対象外
2. **設計反映** (= delta spec 経由の変更意図) — HIGH 対象外
3. **直接操作** (= baseline を直接編集・書き換える意図) — **HIGH**

具体 pattern（行番号指定 / `→` 書き換え / grep 命令 / completeness 要求等）は prompt 内に **列挙しない**。agent の intent 判断に委ね、新たな書き方が出るたびに verb を追加する patchwork 累積を断つ。

### 既存 verb 列挙の扱い

既存の `MODIFIED, ADDED, "を更新", "を作成"` 列挙は **削除** し、intent 判定に置き換える。並存させると agent が列挙を pattern matching のショートカットとして使い、列挙外パターンを見落とすリスクが残る。intent 判定が上位互換であるため、列挙を残す理由がない。

### Exception の維持

既存 Exception（authority path を forbidden として記述する policy statement / 過去 incident 引用は HIGH 対象外）は維持。intent 分類の「参照 / 言及」に包含される。

### HIGH finding の recommendation 文

検出時の recommendation に以下の要素を含める:
- authority spec は `specrunner finish` の spec-merge が delta から自動更新する
- PR 内では baseline は read-only
- delta spec で Requirement を書き、baseline 状態は AC の grep assertion 等で結果として検証する

## Affected Components

| Component | Change Type | Description |
|-----------|-------------|-------------|
| `src/prompts/request-review-system.ts` | MODIFY | Step 2 の検出条件と Severity 定義を intent ベースに書き換え |
| `tests/unit/command/request-review.test.ts` | MODIFY | TC-RR-011 / TC-RR-012 を新設計に追従、再現 test 追加 |

## Capability Impact

| Capability | Impact |
|------------|--------|
| `request-authoring-guard` | delta spec で Requirement を MODIFIED |

## Out of Scope

- `request-generate-system.ts` の変更（authority path 禁止 MUST ルール自体は変えない）
- `request.ts` の `buildScaffoldTemplate` 変更
- dsv 拡張（静的検出）
- 過去観測ケース全件の retrospective 検証
