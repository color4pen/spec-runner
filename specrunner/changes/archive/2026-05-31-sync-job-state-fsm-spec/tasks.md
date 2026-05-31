# Tasks: sync-job-state-fsm-spec

## T-01: delta spec 作成 — `Requirement: JobStatus includes archived as a terminal status` を 7 値 FSM に置換

- [x] `specrunner/changes/sync-job-state-fsm-spec/specs/job-state-store/spec.md` に delta spec を作成
- [x] `### Requirement: JobStatus includes archived as a terminal status` header を baseline と完全一致させる（MODIFIED 自動分類のため）
- [x] `JobStatus` 型宣言を `"running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled"` の 7 値に書き換える
- [x] canonical 正常完走遷移を `awaiting-merge → archived` と記述する
- [x] active = {`running`, `awaiting-resume`} / terminal = {`archived`, `canceled`} の区分を明記する
- [x] VALID_TRANSITIONS 許可遷移表（`src/state/lifecycle.ts` と同一）を Requirement 本文に含める
- [x] legacy `success` の Scenario を「load 時に `awaiting-merge` へ remap される」に反転訂正する
- [x] "No intermediate `merged` status" Scenario を `awaiting-merge` ベースに書き換える

**Acceptance Criteria**:
- delta spec の `### Requirement:` header が baseline L345 の header と完全一致する
- delta spec の status enum が `src/state/schema.ts` L5 の `JobStatus` type と一致（7 値）
- delta spec の遷移表が `src/state/lifecycle.ts` L36-44 の `VALID_TRANSITIONS` と一致
- delta spec の active/terminal 区分が `src/state/lifecycle.ts` L46-48 と一致
- legacy `success` Scenario が remap 挙動（`success` → `awaiting-merge`）と一致

## T-02: delta spec 作成 — `Requirement: state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` の stale `success` 参照を訂正

- [x] 同一 delta spec ファイルに `### Requirement: \`state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED\` は retry 上限到達を示す` を追加（header baseline 一致）
- [x] Scenario L77 の `state.status は success（pipeline 自体は完走）` を `state.status は awaiting-merge（pipeline 自体は完走）` に訂正
- [x] Requirement 本文の normative 記述（MUST/SHALL）は変更しない

**Acceptance Criteria**:
- delta spec の Scenario 内に status の現行値としての `success` が残っていない
- Requirement 本文の normative 記述が baseline と同一（Scenario のみ変更）

## T-03: verification — delta spec の整合性と build green を確認

- [x] delta spec 内に status の**現行値**としての `success` が残っていないことを grep で確認（legacy remap の説明文脈は除く）
- [x] delta spec の 7 値 enum が `src/state/schema.ts` の `JobStatus` type と文字列一致することを確認
- [x] delta spec の遷移表が `architecture/domain-model.md` の遷移表と矛盾しないことを確認
- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が green であることを確認

**Acceptance Criteria**:
- 上記 4 項目すべて pass
