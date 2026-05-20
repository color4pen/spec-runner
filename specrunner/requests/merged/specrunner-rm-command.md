# specrunner rm コマンドの追加

## Meta

- **type**: new-feature
- **slug**: specrunner-rm-command

## 背景

`specrunner ps` に古い job（failed / terminated / escalation で stuck した running 等）が溜まり続ける。削除手段がないため ps の出力が汚染される。managed mode では state file を消すだけだと cloud session が orphan として残る可能性がある。

## 要件

### 1. `specrunner rm <jobId>` コマンド

1. 指定された jobId の state file を削除する
2. status gate:
   - `failed` / `terminated` / `archived` → 許可
   - `running` → デフォルト拒否（stderr: "Job is still running. Use --force to override."）
   - `awaiting-merge` → デフォルト拒否（stderr: "Job has a pending PR. Use 'specrunner finish' or --force."）
3. `--force` で全 status を許可
4. managed mode の場合: state file から sessionId を取得し、`deleteSession` を best-effort で呼んでから state file を削除。API エラーは warning として続行
5. local mode の場合: state file 削除のみ

### 2. `specrunner rm --all-terminated`

6. `failed` / `terminated` / `archived` の全 job を一括削除
7. 実行前に対象件数を表示し、`--yes` なしなら確認プロンプトを出す
8. managed mode の場合は各 job で `deleteSession` を best-effort 実行

### 3. 前提作業

9. `src/state/store.ts` に `deleteJobState(jobId: string): Promise<void>` を追加（`fs.unlink`、ENOENT は無視で冪等）
10. `src/core/port/session-client.ts` に `deleteSession(sessionId: string): Promise<void>` を追加
11. `src/adapter/managed-agent/session-client.ts` で Anthropic SDK の `deleteSession` を実装
12. local adapter は no-op 実装

### 4. CLI 統合

13. `bin/specrunner.ts` の switch-case に `rm` を追加
14. `--force` と `--all-terminated` と `--yes` フラグをパース

## 受け入れ基準

- [ ] `specrunner rm <jobId>` で failed job の state file が削除される
- [ ] running job は `--force` なしで拒否される
- [ ] `--all-terminated` で対象 job が一括削除される
- [ ] managed mode で `deleteSession` が best-effort 実行される
- [ ] `bun run typecheck && bun run test` が green
