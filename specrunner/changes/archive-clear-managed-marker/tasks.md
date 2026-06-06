# Tasks: archive 後に managed marker が残り幽霊 job が表示される

## T-01: archive orchestrator に marker.json の best-effort unlink を追加する

- [x] `archive/orchestrator.ts` で `managedMarkerPath` を `../../util/paths.js` からインポートする
- [x] Phase 2 の worktree teardown 完了後に `fs.unlink(nodePath.join(cwd, managedMarkerPath(slug)))` を best-effort で呼ぶ（try/catch で全エラーを無視）

**Acceptance Criteria**:
- managed job を archive 後、`.specrunner/local/<slug>/marker.json` が存在しない
- unlink が ENOENT で失敗しても archive は exitCode 0 で完了する

## T-02: archive orchestrator の liveness.json write-back を unlink に置き換える

- [x] Phase 2 の liveness sidecar 処理（`worktreePath: null` 書き戻し）を削除する
- [x] 代わりに `fs.unlink(nodePath.join(cwd, livenessJsonPath(slug)))` を best-effort で呼ぶ（try/catch で全エラーを無視）

**Acceptance Criteria**:
- local job を archive 後、`.specrunner/local/<slug>/liveness.json` が存在しない
- liveness.json が存在しない状態で archive を実行しても archive は exitCode 0 で完了する

## T-03: marker.json / liveness.json の削除パスをカバーするテストを追加・拡張する

- [x] marker.json が存在する場合に archive 後に削除されることを検証するテストケースを追加する
- [x] liveness.json が存在する場合に archive 後に削除されることを検証するテストケースを追加する
- [x] marker.json / liveness.json の unlink が失敗（例: ENOENT）しても archive が成功することを検証するテストケースを追加する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- 各テストケースが上記の削除パスおよび失敗時の warning-only 動作を直接検証している
