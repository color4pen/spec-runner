---
name: acceptance-and-issue-audit
description: >-
  完走済 / merged 済の PR について、受け入れ基準を満たしているかレビューし、issue になり得る構造的問題がないか確認する。
  「受け入れ基準を満たしているかレビューして」「問題点があれば報告」「issue になり得る問題」と言われたら使うこと。
  parallel-request-workflow / rebase-finish の前後どちらでも単独起動可能。
---

# acceptance-and-issue-audit — 受け入れ基準 + 構造的問題の事後監査

完走 / merged 済の PR を 3 軸で監査する:

1. **AC 突合せ**: request.md の受け入れ基準と PR 実装の付合
2. **実装ギャップの分類**: 実害ゼロ / 追加 commit / 新規 issue 候補
3. **構造的問題の検出**: 同型事故累積 / LLM 不確定性パターン / scope 漏れ累積

本 skill は read-only audit が基本。修正 commit / issue 起票はユーザー明示承認後のみ実行する。

## When to Activate

- 「受け入れ基準を満たしているかレビューして問題点を報告」「issue になり得る問題確認」等の依頼
- `parallel-request-workflow` 完走後 / `rebase-finish` 前後の事後監査
- merge 後の事後監査 (= 過去 PR の品質再評価)
- 「次の並列タスク候補」検討前に現状の事故パターンを整理したい時

## 入力

対象 PR の指定方法:

- 明示的に PR 番号 / slug リスト
- 「直近 N 件」(= `gh pr list --state merged --limit N`)
- 「awaiting-merge 全件」(= `gh pr list --state open`)

## ワークフロー

### 1. 対象 PR の確定 + 取得

```bash
gh pr view <num> --json files,additions,deletions,title,body
gh pr diff <num>  # 必要時
```

request.md パス:
- awaiting-merge: `specrunner/requests/active/<slug>/request.md` (= 完走前) or `specrunner/changes/<slug>/request.md` (= 完走後)
- merged: `specrunner/changes/archive/<slug>/request.md`

### 2. AC 突合せ

request.md の `## 受け入れ基準` 各項目に対応する code 変更 / test 追加 / docs 更新を確認する。

スコープ外宣言 (= `## スコープ外`) で「やらない」と書いたものが実装に含まれていないことも確認 (= scope 違反検出)。

各 PR の突合せ結果を以下のテーブルで整理:

| AC | 実装 | 判定 |
|---|---|---|
| <criterion> | <file:line or PR 番号> | ✅ satisfied / ⚠️ 部分 / ❌ 未 |

### 3. 実装ギャップの 3 区分分類

未 / 部分 satisfied の AC を分類:

| 区分 | 該当パターン | 対応 |
|---|---|---|
| **実害ゼロ** | AC 文面が厳しすぎ / 解釈の妥当性が立証可能 / design.md で「対象なし」記録済 | 警告のみ、対応不要 |
| **追加 commit で対応** | 実装漏れ / test 抜け / 文言抜け | 該当 commit 案を提示、ユーザー承認後に commit |
| **新規 issue 候補** | 当該 PR scope 外、別 change で対応すべき構造的問題 | issue draft を作成 (= 起票はユーザー承認後) |

### 4. 構造的問題の横断観察

個別 PR の AC を超えた事項を以下の観点で検出:

- **同型事故の累積パターン**: 同じファイル / 同じ層に「rule 追加」「prompt 規律追加」「reviewer に check 追加」を 3 件以上繰り返していたら構造変更を疑う ([[feedback-avoid-patchwork]])
- **LLM 不確定性に起因する事故**: prompt 規律 / catch 側 reviewer も LLM で防ぐ前提なら、agent が判断する場面そのものを消す構造解を検討 ([[feedback-llm-uncertainty-principle]])
- **スコープ外宣言から派生した issue 候補**: 「やらない」「別 issue で対応」と宣言したものが、実際に後で気になる項目

各検出を issue draft (= title + body 草案) として整理。

### 5. 報告

ユーザーへの報告は以下の構造:

1. **AC 突合せ結果** (= 各 PR のテーブル)
2. **問題点 3 区分整理** (= 実害ゼロの件数 / 追加 commit 案 / 新規 issue 候補 draft)
3. **構造的問題の検出** (= 検出パターンごとに issue draft)

### 6. issue 起票 (= ユーザー明示承認後のみ)

```bash
gh issue create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)" --label <labels>
```

label:
- `enhancement` (= 機能追加 / 構造変更)
- `bug` (= 動作不良)
- `priority:low` (= future tracking)

注意: `priority:high` label は本 repo に存在しない (= `gh label list` で確認、enhancement のみ使用)。

## Escalation

- AC 突合せで implementation gap が大きい (= 機械的判定不可能) → 設計フェーズに戻る判断仰ぐ
- 構造的問題が複数交差 (= 1 つの構造変更で全部解決しない) → ロードマップ整理が必要
- ユーザーが「待って」「止めて」と言った → 即停止

## Related

- skill `parallel-request-workflow` (= 完走前の AC 突合せを内包、本 skill は独立起動可)
- skill `rebase-finish` (= AC 突合せ → finish の組み合わせ)
- memory `feedback_avoid_patchwork`
- memory `feedback_llm_uncertainty_principle`
- memory `feedback_verify_dont_trust`
- memory `feedback_make_judgments`
- memory `feedback_plain_conclusion`
