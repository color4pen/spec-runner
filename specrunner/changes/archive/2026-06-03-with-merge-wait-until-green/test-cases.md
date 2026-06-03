# Test Cases: `job archive --with-merge` を check 解決まで待つ wait ループにする

## Summary

- **Total**: 32 cases
- **Automated** (unit/integration): 29
- **Manual**: 3
- **Priority**: must: 20, should: 11, could: 1

---

### TC-001: check が pending の間は待ち続ける

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --with-merge は check が terminal に達するまで待ち続ける > Scenario: check が pending の間は待ち続ける

---

### TC-002: pending が success に変わったら merge へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --with-merge は check が terminal に達するまで待ち続ける > Scenario: pending が success に変わったら merge へ進む

---

### TC-003: すべて success → merge

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: green / pending / failure を check run / combined status で区別する > Scenario: すべて success → merge

---

### TC-004: いずれか failure → 待たずに escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: green / pending / failure を check run / combined status で区別する > Scenario: いずれか failure → 待たずに escalation

---

### TC-005: いずれか pending → 待機

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: green / pending / failure を check run / combined status で区別する > Scenario: いずれか pending → 待機

---

### TC-006: branch protection 無し（check が存在しない）repo で merge できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: green / pending / failure を check run / combined status で区別する > Scenario: branch protection 無し（check が存在しない）repo で merge できる

---

### TC-007: failure と pending が混在する場合は failure が優先される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: GitHubClient に check 取得メソッドを追加する > Scenario: failure と pending が混在する場合は failure が優先される

---

### TC-008: check が一つも無い場合は none を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: GitHubClient に check 取得メソッドを追加する > Scenario: check が一つも無い場合は none を返す

---

### TC-009: config が null のとき無制限に待つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 待ち上限は config で設定可能で null は無制限 > Scenario: config が null のとき無制限に待つ

---

### TC-010: config 未設定のとき有限 default で待つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 待ち上限は config で設定可能で null は無制限 > Scenario: config 未設定のとき有限 default で待つ

---

### TC-011: 待ち上限超過で escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: timeout / failure / conflict は merge せず escalation する > Scenario: 待ち上限超過で escalation

---

### TC-012: merge conflict で escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: timeout / failure / conflict は merge せず escalation する > Scenario: merge conflict で escalation

---

### TC-013: plain archive で GitHub API 呼び出しが発生しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: archive 本体は GitHubClient port に依存しない（client-closed 維持）> Scenario: plain archive で GitHub API 呼び出しが発生しない

---

### TC-014: check run pending（in_progress）混在・failure 無し → state: pending

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** check-runs に `status: "in_progress"`（completed でない）のものが含まれ、failure の check が無い
**WHEN** `getCheckStatus` を呼ぶ
**THEN** `state` は `"pending"` を返し、`pending` にそのcheck 名が含まれる

---

### TC-015: check run failure 混在 → state: failure かつ failing に名前が入る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** check-runs のうち一つが `status: "completed"` かつ `conclusion: "failure"`
**WHEN** `getCheckStatus` を呼ぶ
**THEN** `state` は `"failure"` を返し、`failing` にその check 名が含まれる

---

### TC-016: combined status failure → state: failure

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** commit statuses の `statuses[]` に `state: "failure"` または `state: "error"` のエントリがある
**WHEN** `getCheckStatus` を呼ぶ
**THEN** `state` は `"failure"` を返し、`failing` にその `context` 名が含まれる

---

### TC-017: neutral / skipped conclusion は success 扱い（ブロッキングしない）

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** check-run が `status: "completed"` かつ `conclusion: "neutral"` または `"skipped"` で、他に pending / failure が無い
**WHEN** `getCheckStatus` を呼ぶ
**THEN** `state` は `"success"` を返す

---

### TC-018: conclusion が null（completed だが結論未設定）→ pending 扱い

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** check-run が `status: "completed"` かつ `conclusion: null`
**WHEN** `getCheckStatus` を呼ぶ
**THEN** `state` は `"pending"` を返す（防御的 fallback）

---

### TC-019: getPullRequest の戻り値に headSha が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / T-02

**GIVEN** GitHub REST API の PR response に `head.sha` が含まれる
**WHEN** `getPullRequest` を呼ぶ
**THEN** 戻り値の `headSha` フィールドに `head.sha` の値が格納されている

---

### TC-020: check-runs が複数ページにわたる場合に全件取得する

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-02

**GIVEN** `/check-runs` endpoint のレスポンスに `Link` ヘッダ（次ページあり）が含まれる
**WHEN** `getCheckStatus` を呼ぶ
**THEN** 全ページが取得され、`total` に全 check-run 件数が反映される

---

### TC-021: mergeWaitTimeoutMs に負値を設定した場合 CONFIG_INVALID になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `.specrunner/config.json` の `archive.mergeWaitTimeoutMs` に `-1` を設定する
**WHEN** `validateConfig` を呼ぶ
**THEN** `CONFIG_INVALID` エラーが返る

---

### TC-022: mergeWaitTimeoutMs に非整数を設定した場合 CONFIG_INVALID になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `archive.mergeWaitTimeoutMs` に `1.5` を設定する
**WHEN** `validateConfig` を呼ぶ
**THEN** `CONFIG_INVALID` エラーが返る

---

### TC-023: mergeWaitPollIntervalMs に 0 を設定した場合 CONFIG_INVALID になる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `archive.mergeWaitPollIntervalMs` に `0` を設定する
**WHEN** `validateConfig` を呼ぶ
**THEN** `CONFIG_INVALID` エラーが返る

---

### TC-024: mergeWaitTimeoutMs の型が number | null | undefined のみで "unlimited" 等の文字列キーワードを含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `ArchiveConfig` の型定義を参照する
**WHEN** `mergeWaitTimeoutMs` の許容型を確認する
**THEN** `number | null | undefined` のみであり、`"unlimited"` 等のリテラル文字列型は含まれない

---

### TC-025: 既に MERGED の PR は merge をスキップして archive へ進む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / T-08

**GIVEN** `getPullRequest` の `state` が `"MERGED"` を返す
**WHEN** `runMergeThenArchive` を実行する
**THEN** `mergePullRequest` は呼ばれず、`runArchiveOrchestrator` が呼ばれる

---

### TC-026: mergeStateStatus が BLOCKED の PR は escalation する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `getPullRequest` の `mergeStateStatus` が `"BLOCKED"` を返す
**WHEN** `runMergeThenArchive` を実行する
**THEN** "branch protection requirements not met" メッセージで escalation し、`mergePullRequest` / `runArchiveOrchestrator` は呼ばれない

---

### TC-027: headSha が欠如した場合は専用メッセージで escalation する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `getPullRequest` の戻り値に `headSha` が含まれない（`undefined`）
**WHEN** `runMergeThenArchive` を実行する
**THEN** "PR head SHA missing" メッセージで escalation し、`mergePullRequest` は呼ばれない

---

### TC-028: pollMergeStateAfterPush の参照がソース全体から消えている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** 実装が完了している
**WHEN** `src/` 以下で `pollMergeStateAfterPush` を参照する
**THEN** 該当するシンボルは存在せず、`bun run typecheck` がエラーなく完了する

---

### TC-029: --merge-wait-ms flag で待ち上限を override できる

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `.specrunner/config.json` に `archive.mergeWaitTimeoutMs` が未設定
**WHEN** `specrunner job archive --with-merge <slug> --merge-wait-ms 5000` を実行する
**THEN** config default（10 分）ではなく 5000ms の待ち上限で動作し、無制限を表す keyword flag は存在しない

---

### TC-030: architecture/components.md に getCheckStatus が記載されている

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `architecture/components.md` を参照する
**WHEN** `GitHubClient` port の記述を確認する
**THEN** `getCheckStatus` メソッドが記載されており、ArchiveOrchestrator の client-closed 記述と矛盾しない

---

### TC-031: --help 出力に --merge-wait-ms が表示される

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05

**GIVEN** 実装が完了している
**WHEN** `specrunner job archive --help` を実行する
**THEN** `--merge-wait-ms <ms>` の説明が出力に含まれる

---

### TC-032: bun run typecheck && bun run test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** 全タスクの実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーおよびテスト失敗がゼロで完了する

---

## Result

```yaml
result: completed
total: 32
automated: 29
manual: 3
must: 20
should: 11
could: 1
blocked_reasons: []
```
