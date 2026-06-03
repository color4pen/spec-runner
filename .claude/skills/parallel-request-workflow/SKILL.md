---
name: parallel-request-workflow
description: >-
  複数 issue から並列実行候補をピックし、request 起票 → review → 修正 → 並列 run まで進める。
  「並列でリクエスト作って」「次の並列タスク候補」「リクエスト起票して review」と言われたら使うこと。
  spec-runner project 専用 (= `bun ./bin/specrunner.ts` 前提)。
---

# parallel-request-workflow — 並列リクエストワークフロー

複数 issue から並列実行候補をピックして、request 起票 → request review → 修正サイクル → 並列 run まで進める。
完走後は `acceptance-and-issue-audit` (= AC 監査) と `rebase-finish` (= merge) に引き継ぐ。

## When to Activate

- 「次の並列タスク候補」「並列でリクエスト作って」「リクエスト起票して review」等の依頼
- 既に issue リスト指定があり「これらでリクエスト作って review」の依頼

## 前提条件チェック

```bash
# main 最新化 + active が空であること + build 通過を確認
git status
git pull --ff-only
ls specrunner/drafts/
bun run build
```

`drafts/` に残骸があれば削除する (= 並列 run で worktree 衝突を避ける)。

## ワークフロー

### 1. 候補ピック (= issue リスト未指定時)

```bash
gh issue list --state open --limit 30 --json number,title,labels
```

候補選定の 3 軸:

- **ファイル領域非衝突**: 並列 run で worktree 衝突しない
- **サイズ感が揃う**: 完走タイミングが揃って待ち時間が無駄にならない
- **性質バラバラ**: prompt fix / config 拡張 / bug fix / refactor 等

件数は 2-4 件程度を目安。テーブル形式 (= 番号 / title / 領域 / サイズ) でユーザーに提示。

### 2. 実装箇所調査 + 起票

各 issue について:

```bash
gh issue view <num> --json title,body
```

関連 layer 全体を grep / Read で網羅的に調査 (= `core / cli / utils / adapter / prompts / tests` のどこに対象が散らばっているか)。grep 漏れは review HIGH 指摘になりやすい。

`specrunner/drafts/<slug>.md` を起票する。slug は date prefix なし ([[project-slug-no-date-prefix]])。authority path 直接指定禁止 ([[feedback-no-baseline-path-in-request]])。

### 3. request review 並列実行

```bash
bun ./bin/specrunner.ts request review specrunner/drafts/<slug-1>.md  # background
sleep 3 && bun ./bin/specrunner.ts request review specrunner/drafts/<slug-2>.md  # background
sleep 6 && bun ./bin/specrunner.ts request review specrunner/drafts/<slug-3>.md  # background
```

全件完了通知を待ち、各 output を順次確認。

### 4. review 結果の分類 + 修正サイクル

各 finding を以下に分類:

| 区分 | 対応 |
|---|---|
| **明示的修正可能** (= reviewer の事実指摘、AC 追加、文言修正、scope 補足) | 即修正 |
| **調査が必要** (= 起票時の grep / API 仕様確認漏れ) | 調査して修正、1 行でユーザーに報告 |
| **要件曖昧 / 仕様変更** | 1 個ずつユーザーに持ってくる (= 一度に複数提示しない) |

修正後、再 review を並列起動。3 サイクル繰り返しても approve 出ない場合は設計を疑う ([[feedback-avoid-patchwork]])。

### 5. 並列 run

全件 approve 後:

```bash
bun ./bin/specrunner.ts run <slug-1>  # background
sleep 3 && bun ./bin/specrunner.ts run <slug-2>  # background
sleep 6 && bun ./bin/specrunner.ts run <slug-3>  # background
```

全件完走を待つ。完走後は skill `acceptance-and-issue-audit` に引き継ぐ。

## Escalation

- review 3 サイクル繰り返しでも approve 出ない → 設計を疑う、構造変更検討
- run で escalation 発生 (= spec-review needs-fix maxRetries / conformance escalation 等) → design 段に戻る判断仰ぐ
- ユーザーが「待って」「止めて」と言った → 即停止

## Related

- skill `acceptance-and-issue-audit` (= AC 監査、本 skill 完走後の次フェーズ)
- skill `rebase-finish` (= 監査後の順次 merge)
- memory `reference_specrunner_run_runbook` (= run / finish の標準手順詳細)
- memory `feedback_no_baseline_path_in_request`
- memory `feedback_avoid_patchwork`
- memory `feedback_avoid_judgment_pending`
- memory `feedback_plain_conclusion`
- memory `feedback_make_judgments`
- memory `project_slug_no_date_prefix`
