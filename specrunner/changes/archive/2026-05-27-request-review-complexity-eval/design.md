# Design: request-review-complexity-eval

request review agent prompt に複雑化リスク評価観点と複数アプローチ検出時の推奨提示ルールを追加する。

## Problem Summary

request review agent が設計案を複数列挙するだけで「どれが良いか」を評価しない。
`delta-validation-post-code-review` request で 2 つのアーキテクチャアプローチが並列提示されたが、
複雑化リスクや既存資産の再利用可否の評価がなく、request 作成者が自分で技術評価をやり直す必要があった。

## Design Decisions

### D1: 配置場所 — Step 4 の拡張ではなく新 Step 5 として追加

| 案 | Pros | Cons |
|---|---|---|
| **(A) 新 Step 5 として追加** | Step 4 (Scope Sanity Check) と関心が分離される。LLM が Step 単位で逐次実行するため独立した evaluation pass を確保できる | Step 数が増える |
| (B) Step 4 に観点を追記 | Step 数据え置き | Step 4 が肥大化し「scope sanity」と「complexity evaluation」の責務が混在。LLM が片方を省略するリスク |

**決定: (A)**

根拠:
- Step 4 は「over-engineering / YAGNI / scope creep / hidden costs」= request の scope 妥当性。新観点は「提案された設計が既存アーキテクチャに与える影響」= 設計品質評価で、関心が異なる
- LLM は numbered step を逐次実行する傾向がある。独立 Step にすることで skip されにくい
- 既存の Step 1-4 は request validation（request.md 自体の品質）。Step 5 はより踏み込んだ設計妥当性チェックとなり、review process の深さが段階的に増す構造になる

### D2: Severity 扱い — 既存の Severity Scope Constraint との整合

現行 prompt の Severity Scope Constraint:
> Severity judgments apply ONLY to request-level defects. Do NOT escalate implementation design concerns to findings.

複雑化リスク / DRY 違反 / 既存資産再利用は「実装設計の詳細」に踏み込みすぎると Exclusion Clause に抵触する。

**決定**: Step 5 の findings severity は **MEDIUM** を上限とする。

根拠:
- 複雑化リスクが高くても、request.md 自体の品質（goal clarity, AC testability）に問題がなければ pipeline 実行は可能
- HIGH にすると verdict が `needs-discussion` に倒れ、prompt-only の scope を超えた review loop が発生する
- MEDIUM であれば「推奨改善」として output に含まれつつ、verdict を不必要にブロックしない
- Exclusion Clause の「implementation trade-off は design agent が評価する」と整合

### D3: 複数アプローチ検出時の推奨提示 — prompt instruction として追加

reviewer が複数の設計アプローチを検出した場合の振る舞いを prompt で規定する。

**決定**: Step 5 内に「複数アプローチ検出時は推奨案 1 つ + 根拠を提示し、最終判断は request 作成者に委ねる」旨の instruction を追加。

根拠:
- 並列列挙は LLM のデフォルト傾向（情報提示型）。明示的に「1 つ選べ」と指示しないと変わらない
- 「最終判断は request 作成者」の一文を入れることで、reviewer の越権を防ぐ
- 推奨根拠を複雑化リスク / DRY / 既存資産再利用の 3 軸で示すよう限定することで、判断基準が一貫する

### D4: Output Format への影響 — 変更なし

Output Format（Findings Summary Table + Verdict + JSON Block）と Verdict Derivation Rules は変更しない。

根拠:
- Step 5 の findings は既存の severity / category 体系に乗る（category: `feasibility` or `scope` で十分）
- 新 category を追加すると下流の parser / test に影響 → scope 外
- JSON schema 変更なし → `parseReviewOutput()` への変更不要

## 変更対象

| ファイル | 変更内容 |
|---|---|
| `src/prompts/request-review-system.ts` | Step 5 (Complexity & Reuse Evaluation) を追加。複数アプローチ推奨提示ルールを含む |
| `tests/unit/command/request-review.test.ts` | prompt に新観点が含まれることの regression test を追加 |
| `tests/unit/core/request/reviewer.test.ts` | 変更なし（prompt 内容テストは command/ 側にある） |

## 変更しないもの

- `src/core/request/reviewer.ts` — ロジック変更なし
- `src/core/command/request-review.ts` — ロジック変更なし
- Verdict 体系 / Output Format / JSON schema — 変更なし
- 他の agent prompt（design / code-review / spec-review） — scope 外
