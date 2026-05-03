## REMOVED Requirements

### Requirement: spec-fixer セッションは独立した timeout を持つ

**Reason**: step session の wall-clock timeout は撤廃される（design D1 参照）。spec-fixer セッションも propose / spec-review と同じ方針に揃え、終端は idle+end_turn 検知 / SSE disconnect / SDK 側 `stop_reason` / 手動 cancel に一本化する。「10 分で打ち切る」固定上限は spec-fixer の長時間 git 操作（rebase / 大規模 patch）を正常完了前に abort するリスクがあり不要である。

**Migration**:

- 新規 job では `state.steps["spec-fixer"]` 末尾要素の `error.code === "SESSION_TIMEOUT"` は発生しない
- 旧 state file の SESSION_TIMEOUT は `SESSION_TERMINATED` に lazy 変換される
- 失敗の検知は次 iter の spec-review に委任（既存 Requirement「spec-fixer の push 失敗検知は次 iter の spec-review に委ねる」と整合）
