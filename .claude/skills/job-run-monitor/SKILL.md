---
name: job-run-monitor
description: >-
  spec-runner job の起動 → 監視 → halt 対応 → 取り込みの運用手順。
  「job 起動して」「run して」「監視して」「resume して」「archive して」と言われたら、
  または agent session が pipeline job を扱う前に使うこと。
  spec-runner project 専用 (= `bun ./bin/specrunner.ts` 前提)。
---

# job-run-monitor — job 起動・監視・取り込み

pipeline job を agent session から安全に起動・監視し、halt に対応して archive まで進める。
起票までは skill `parallel-request-workflow`、merge 後の監査は skill `acceptance-and-issue-audit` が担当。

## When to Activate

- `job start` / `run` / `job resume` / `job archive` を実行する前
- 走行中 job の監視・halt (= awaiting-resume) 対応

## 前提

```bash
git checkout main && git pull --ff-only   # pipeline は main checkout のコードで走る
bun ./bin/specrunner.ts --help            # コマンド名は変遷が速い。都度 verify する
```

## 1. 起動 — 必ず `--detach`

```bash
bun ./bin/specrunner.ts job start specrunner/drafts/<slug>.md --detach [--issue <n>]
bun ./bin/specrunner.ts job resume <slug> --detach   # 再開も同様
```

- **Bash の `run_in_background` で pipeline を走らせない**: harness が background task を
  SIGTERM で停止することがあり、1〜2 時間走る job は途中で撃たれる。CLI 組み込みの
  `--detach` が正しい経路 (= プロセスを harness から切り離して即 return する)。
- 撃たれても job は awaiting-resume に落ちるので `job resume <slug> --detach` で継続できる
  (= step 途中の kill はその step を最初からやり直す)。
- 並列起動は `sleep 3` で stagger する (= `git worktree add` の `.git/config` ロック競合回避)。

## 2. 監視 — `job ls` 確認 → Monitor で `job wait` をラップ

起動直後は state 登録に数秒ラグがあり `job ls` が "No jobs found" を返す。
**`job ls` で running を確認してから**監視を張る (= 即 arm すると生存プロセス不在と誤認して false-fire する)。

```bash
bun ./bin/specrunner.ts job ls    # running を確認
```

Monitor tool (persistent: true) に次を渡す。settle で 1 行 echo して exit = 通知 1 回:

```bash
cd <repo-root>
bun ./bin/specrunner.ts job wait <slug> >/dev/null 2>&1
rc=$?
jline=$(bun ./bin/specrunner.ts job show <slug> 2>/dev/null | grep -im1 "status")
echo "<slug> settled: rc=$rc ${jline:-status-unknown}"
```

- **判定は rc でなく Status**: `job wait` の exit code は halt (= escalation) でも非 0 になる。
- **poll script を自作しない**。どうしても書くなら:
  - zsh では `status` / `path` / `argv` / `pipestatus` が read-only 予約変数。
    代入すると即 exit 1 し、エラーは stderr にしか出ない。`jstat` 等の接頭辞を付ける。
  - grep は slug でなく **Job ID** (= slug は truncate されることがある)。
  - resume 走行中の disk state は awaiting-resume のまま (= in-memory 先行)。
    状態先行の poll は走行中に terminal と誤報する。`job wait` はこれを内蔵の
    process-death gate で処理済み。
- Monitor が即死・沈黙したら、まず output file を Read して stderr を見る。

## 3. halt (= awaiting-resume) への対応

```bash
bun ./bin/specrunner.ts job show <slug>
grep -n "escalat" .specrunner/logs/<jobId>.log | tail   # escalation 内容
```

- 低リスク・可逆・技術的な裁定は自分で決め、
  `job resume <slug> --from <step> --prompt "<裁定>" --detach` で routing する
  (= 転記型の spec 修正は `--from spec-fixer`、code 修正は `--from code-fixer`。
  複合 step は `--from` 対象外)。曖昧な指示は fixer が no-op するので置換後の文面まで指定する。
- 要件・仕様に関わる判断はユーザーに止めて仰ぐ。
- operator が worktree に直接 commit した場合は `job resume <slug> --adopt-commits`、
  保護 canon を未 commit 編集した場合は `--apply-canon`
  (= halt メッセージが必要 flag 入りの完全コマンドを提示する)。
- resume 後は手順 2 の監視を張り直す。

## 4. 取り込み — `archive --with-merge`

PR レビュー通過後 (merge はユーザー承認が前提):

```bash
bun ./bin/specrunner.ts job archive <slug> --with-merge   # main checkout から実行
```

- merge を `gh` で分割しない。archive --with-merge が push → CI 待ち → merge → cleanup を一括で行う。
- **完了判定に `job ls` を使わない** (= CI 待ち中に job が一覧から消える)。
  archive プロセスの終了 + ログの「PR #N merged successfully」「marked as archived」で判定する。
- PR への手修正は job 自身の worktree (= `.git/specrunner-worktrees/<slug>-<jobId 先頭8桁>`) 内で
  commit する。別 worktree から push すると archive Phase 1 が non-fast-forward で拒否される。

## 5. 掃除

```bash
git checkout main && git pull origin main
git worktree prune
ls specrunner/drafts/   # 残骸確認 (= 並列 run の worktree 衝突源)
```

## Related

- skill `parallel-request-workflow` (= 起票 → run の前フェーズ)
- skill `acceptance-and-issue-audit` (= 完走後の AC 監査)
- skill `rebase-finish` (= 監査後の順次 merge)
