# Tasks: readme-command-sync

## 対象ファイル

- `README.md`（これのみ）

## Task 1: Request commands から削除済みサブコマンドを除去

**ファイル**: `README.md` L48-49 付近

以下の 2 行を削除:
```
specrunner request show <slug>             Print request.md content to stdout
specrunner request rm <slug>               Delete from active/
```

- [x] 完了

## Task 2: Job commands の `job rm` を `job cancel` に置換

**ファイル**: `README.md` L61 付近

変更前:
```
specrunner job rm <jobId>                  Remove job state file
```

変更後:
```
specrunner job cancel <jobId>              Cancel job and cleanup
```

- [x] 完了

## Task 3: Managed Quick Start から `init --runtime managed` を除去

**ファイル**: `README.md` L99-105 付近

変更前:
```bash
export SPECRUNNER_API_KEY=sk-ant-...
specrunner init --runtime managed
specrunner login
specrunner runtime setup
specrunner job start my-feature
```

変更後:
```bash
specrunner init
specrunner login
export SPECRUNNER_API_KEY=sk-ant-...
specrunner runtime setup
specrunner job start my-feature
```

手順の意図: `init` で config scaffold → `login` で GitHub 認証 → API key 設定 → `runtime setup` で managed runtime 構成。

- [x] 完了

## Task 4: 最終照合

`src/cli/command-registry.ts` の `USAGE` 定数（L54-83）と README の Command Reference セクション（L40-81）を目視照合し、コマンド名・サブコマンド名・引数名が 1:1 対応することを確認。Task 1-3 以外に齟齬があれば併せて修正。

- [x] 完了（Task 1-3 以外の齟齬なし）

## Task 5: CI green 確認

```bash
bun run typecheck && bun run test
```

README のみの変更なので影響なしを確認。

- [x] 完了（242 test files / 2651 tests passed）
