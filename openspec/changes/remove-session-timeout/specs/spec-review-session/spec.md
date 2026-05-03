## REMOVED Requirements

### Requirement: spec-review セッションは独立した timeout を持つ

**Reason**: step session の wall-clock timeout は撤廃される（design D1 参照）。spec-review セッションも同様に、終端は idle+end_turn 検知 / SSE disconnect / SDK 側 `stop_reason` / `maxIterations` / 手動 cancel に一本化する。「10 分で打ち切る」固定上限は長時間レビューの誤 abort 主因となるため不要である。

**Migration**:

- 新規 job では `error.code === "SESSION_TIMEOUT"` は spec-review でも発生しない
- 旧 state file の SESSION_TIMEOUT は `SESSION_TERMINATED` に lazy 変換される
- 暴走時は `maxIterations` の retry 上限到達（`SPEC_REVIEW_RETRIES_EXHAUSTED`）または手動 cancel で終端する
