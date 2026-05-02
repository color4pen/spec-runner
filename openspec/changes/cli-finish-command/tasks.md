## Path Convention (read before implementing)

実際の codebase のパス規約は tasks.md の初稿とは異なる。以下の対応表に従うこと:

| 旧 (誤) | 正 |
|---|---|
| `src/cli/commands/finish.ts` | `src/cli/finish.ts` (`init.ts` / `login.ts` / `run.ts` / `ps.ts` / `doctor.ts` と同じフラット配置) |
| `src/cli/index.ts` (サブコマンドルーター) | `bin/specrunner.ts` (単一 switch 文) |
| `src/lib/jobs/state.ts` (`JobStatus` 型) | `src/state/schema.ts` (`JobStatus` union at line 5) |

## 1. Setup

- [x] 1.1 `src/cli/finish.ts` を新規作成し、CLI エントリポイントの skeleton（引数 / フラグ解析、`runFinish` / `runFinishCore` エントリ）を実装する
- [x] 1.2 `bin/specrunner.ts` の `switch (command)` に `case "finish"` を追加し、`--help` / 不明サブコマンド時の usage 文字列を 6 サブコマンド対応に更新する
- [x] 1.3 `src/state/schema.ts` の `JobStatus` union に `archived` を追加し、既存 union type / 型ガード / exhaustive-switch を持つ consumer（`src/cli/ps.ts` 等）を更新する

- [x] 1.4 `src/util/spawn.ts` を新規作成し、`spawnCommand(cmd, args, opts)` を `src/core/pr-create/runner.ts:39` から移送する。`src/core/pr-create/runner.ts` を新 module から import するよう更新する（既存 pr-create テストが PASS のままであることを確認）
- [x] 1.5 `src/state/store.ts` に `loadJobState(jobId: string)` と `updateJobState(jobId: string, mutator: (state: JobState) => JobState)` を追加する。ENOENT / parse failure / atomic write の各 unit test を書く
- [x] 1.6 `src/state/schema.ts` の `JobStatus` consumer 全体（`src/cli/ps.ts:33` の `formatJobRow` 等）を TypeScript exhaustive-switch エラーで検出し、`archived` ケースを追加する

## 2. 入力解決ロジック

- [x] 2.1 `resolveTarget(args)` 関数を実装し、jobId / --slug / awaiting-merge dir 自動検出の 3 段階を順に試す
- [x] 2.2 jobId 直指定時に state file を読み出し `pullRequest.number` / `branch` / `request.path` を返す pure function を実装する
- [x] 2.3 --slug fallback 時に jobs/ ディレクトリを走査し、`request.path` の basename が一致する state を抽出する。複数該当時は最新 `updatedAt` を採用し stdout に通知メッセージを出す
- [x] 2.4 awaiting-merge dir 自動検出ロジックを実装する。0 件 / 2 件以上の場合は exit code 2 で usage 出力、1 件の場合のみ採用する
- [x] 2.5 入力解決の各分岐に対する unit test を追加する（jobId 解決成功 / --slug 単一 / --slug 複数 / awaiting-merge 0 件 / awaiting-merge 2 件 / awaiting-merge 1 件）

## 3. PR 状態検知

- [x] 3.1 `gh pr view <PR> --json state,mergeStateStatus,statusCheckRollup,headRefName` を spawn する subprocess wrapper を実装する（pr-create runner のパターンを再利用）
- [x] 3.2 gh JSON 出力を 6 種の正規化状態（OPEN_MERGEABLE / OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / MERGED / CLOSED）にマップする `normalizePrState` 関数を実装する
- [x] 3.3 `statusCheckRollup` に failure を含む場合の判定ロジックを実装する（mergeStateStatus が CLEAN でも checks failing なら OPEN_CHECKS_FAILING に倒す）
- [x] 3.4 想定外の mergeStateStatus 値を受け取った場合に safe default として `OPEN_CHECKS_FAILING` 扱いにフォールバックする
- [x] 3.5 6 種の正規化状態すべてを fixture で再現する unit test を追加する

## 4. feature PR merge ステップ

- [x] 4.1 OPEN_MERGEABLE 時の `gh pr merge <PR> --squash --delete-branch` を spawn する
- [x] 4.2 OPEN_CHECKS_FAILING + `--force` 時の `gh pr merge <PR> --squash --delete-branch --admin` を spawn する
- [x] 4.3 MERGED 状態 / `--cleanup-only` 時に merge ステップを skip するロジックを実装し、stdout に skip メッセージを出す
- [x] 4.4 gh subprocess が non-zero exit した場合に escalation block を出力して exit する
- [x] 4.5 merge ステップの unit / integration test を追加する（OPEN_MERGEABLE 成功 / --cleanup-only skip / gh non-zero exit）

## 5. archive ブランチ作成と openspec archive 連携

- [x] 5.1 `git fetch origin main` と `git checkout -b chore/archive-<slug> origin/main` を実行する subprocess wrapper を実装する
- [x] 5.2 `openspec/changes/<slug>/` の存在チェックを実装し、不在時は openspec archive 全体を skip する
- [x] 5.3 `openspec/changes/<slug>/specs/` 配下の `.md` 有無で `openspec archive <slug>` または `openspec archive <slug> --skip-specs` を分岐実行する
- [x] 5.4 openspec subprocess が non-zero exit した場合の escalation を実装する
- [x] 5.5 archive 分岐 3 通り（spec あり / spec なし / change folder 不在）の unit test を追加する

## 6. requests dir 移送と commit

- [x] 6.1 `awaiting-merge/<slug>/` 存在 + `merged/<slug>/` 不在の場合のみ `git mv awaiting-merge/<slug> merged/<slug>` を実行する
- [x] 6.2 既に移送済み（merged 存在 / awaiting-merge 不在）の場合は skip し stdout に通知する
- [x] 6.3 `git commit -m "chore: archive <slug>"` を実行する。変更が無い場合は skip する
- [x] 6.4 dir 移送と commit の unit test を追加する（通常 / 既に移送済み / 変更なし）

## 7. archive PR 作成と auto-merge

- [x] 7.1 `git push -u origin chore/archive-<slug>` を実行する
- [x] 7.2 `gh pr create --title "chore: archive <slug>" --body-file <tempfile> --head chore/archive-<slug> --base main` を実行し PR URL を取得する。body は `os.tmpdir()` 下の `crypto.randomUUID()` ベースの tempfile に書き出し、`try/finally` で cleanup する（`src/core/pr-create/runner.ts` の `--body-file` パターンを踏襲）
- [x] 7.3 `gh pr merge --auto --squash --delete-branch <archive PR URL>` を実行する
- [x] 7.4 auto-merge 利用不可（exit non-zero + 特定 error 文字列）時に `gh pr merge --squash --delete-branch <url>` で fallback する
- [x] 7.5 push 失敗時の escalation block 出力を実装する
- [x] 7.6 archive PR 作成と auto-merge の unit / integration test を追加する（auto-merge 成功 / fallback 即時 merge / push 失敗）

## 8. job state 更新

- [x] 8.1 全ステップ成功時に state.status を `archived` に更新し、history に `step="finish", status="ok"` の entry を append する
- [x] 8.2 escalation 終了時は state を変更しないことを保証する分岐を実装する
- [x] 8.3 既存 atomic write プロトコル（`*.tmp.<random>` → `fs.rename`）に準拠させる
- [x] 8.4 state.status が `running` の job への finish 実行を拒否する gate を実装する
- [x] 8.5 state 更新の unit test を追加する（success → archived 遷移 / escalation 時の不変 / running 拒否）

## 9. escalation フォーマットと exit code

- [x] 9.1 escalation block ビルダー関数 `formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand })` を実装する
- [x] 9.2 各 escalation トリガー（OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / subprocess 失敗）に対する具体的な推奨アクション文字列を定義する
- [x] 9.3 引数解析エラー（exit code 2）と実行系エラー（exit code 1）を区別する
- [x] 9.4 escalation 出力の cli-stdout-snapshot 系 test を追加する（OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / subprocess 失敗 の各パターン）

## 10. 冪等性と resume

- [x] 10.1 PR が既に MERGED の場合に feature PR merge を skip する分岐を実装する
- [x] 10.2 `merged/<slug>/` 存在 + `awaiting-merge/<slug>/` 不在の場合に requests dir mv を skip する
- [x] 10.3 `chore/archive-<slug>` ブランチが remote に既に存在し関連 archive PR が MERGED の場合に archive 全体を skip する
- [x] 10.4 全ステップ完了済みの場合に `Already finished, nothing to do.` を stdout に出して exit code 0 で終了する
- [x] 10.5 部分実行状態（feature merged 済みだが archive 未完了）からの resume が動くことを integration test で検証する
- [x] 10.6 完全完了済みの 2 回目実行が no-op になることを integration test で検証する

## 11. 後方互換性とドキュメント

- [x] 11.1 `archived` 追加前の state file を `specrunner ps` が問題なく読めることを test で検証する
- [x] 11.2 `specrunner ps --active` フィルタが `archived` を除外することを実装 / test する
- [x] 11.3 `specrunner finish --help` の usage / フラグ説明を実装する
- [x] 11.4 `specrunner --help` の出力に finish の 1 行説明を追加する
- [ ] 11.5 README / cli-commands spec の `specrunner` バイナリ説明を 6 サブコマンドに更新する

## 12. 検証と dogfooding

- [x] 12.1 全 unit test / integration test を実行して PASS を確認する
- [x] 12.2 lint / typecheck / build がすべて通ることを確認する
- [x] 12.3 LLM 呼び出しが発生していないことを source レベルで grep 検査する（`anthropic` import の不在 / Managed Agents API 呼び出しの不在）
- [ ] 12.4 dogfooding-006 として PR #48 readme-status-section を最初の finish ターゲットに使い、E2E で deterministic 動作を確認する（本 change 自体の merge 後）
