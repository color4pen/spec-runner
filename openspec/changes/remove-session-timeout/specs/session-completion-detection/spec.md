## REMOVED Requirements

### Requirement: 完了タイムアウトを実装する

**Reason**: step session に対する固定 wall-clock timeout は、長時間処理中の正常 session を `SESSION_TIMEOUT` として打ち切る誤動作の主因であり、subprocess hang 等の本来 abort すべき経路と区別できない。session 終端は idle+end_turn 検知 / SSE disconnect / SDK 側 `stop_reason` / `maxIterations` / 手動 cancel という出口戦略で十分機能するため、wall-clock timeout は冗長である。

**Migration**:

- 新規 job では timeout 起因の error は発生しない（`SESSION_TIMEOUT` error.code は廃止）
- 旧 state file の `state.error.code === "SESSION_TIMEOUT"` は `validateJobState` 読み取り時に `SESSION_TERMINATED` に lazy 変換される（`job-state-store` spec の delta を参照）
- `--timeout=Nm` / `--timeout=Ns` flag は廃止される
- 真に hang した session は `specrunner cancel` で手動終端する
