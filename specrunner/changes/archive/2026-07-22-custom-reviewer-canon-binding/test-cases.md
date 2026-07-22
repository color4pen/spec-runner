# Test Cases: custom reviewer 承認の canonical 入力 hash 束縛と全 skip の非 green 化

## Summary

- **Total**: 50 cases
- **Automated** (unit/integration): 45
- **Manual**: 5
- **Priority**: must: 39, should: 11, could: 0

---

## Spec Scenario 由来 TC（GWT 省略）

### TC-001: 正典文書を変更すると承認済み reviewer が pending に戻る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 承認済み custom reviewer の skip は canonical 入力 hash に束縛される > Scenario: 正典文書を変更すると承認済み reviewer が pending に戻る

---

### TC-002: 正典・activation 対象がいずれも不変なら承認 skip が維持される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 承認済み custom reviewer の skip は canonical 入力 hash に束縛される > Scenario: 正典・activation 対象がいずれも不変なら承認 skip が維持される

---

### TC-003: canonHash を持たない legacy 承認 record は pending に戻る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 承認済み custom reviewer の skip は canonical 入力 hash に束縛される > Scenario: canonHash を持たない legacy 承認 record は pending に戻る

---

### TC-004: reviewer 自身の findings commit は誤 invalidation を誘発しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: round の変更判定は正典文書を pipeline 出力と区別する > Scenario: reviewer 自身の findings commit は誤 invalidation を誘発しない

---

### TC-005: 正典文書の変更は touched リストに現れる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: round の変更判定は正典文書を pipeline 出力と区別する > Scenario: 正典文書の変更は touched リストに現れる

---

### TC-006: reviewer 構成ありで全 member skipped → escalation

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewer が構成された round の全 skip は非 green とする > Scenario: reviewer 構成ありで全 member skipped → escalation

---

### TC-007: member 0 件 → approved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewer が構成された round の全 skip は非 green とする > Scenario: member 0 件 → approved

---

### TC-008: 一部承認・一部 skip → approved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewer が構成された round の全 skip は非 green とする > Scenario: 一部承認・一部 skip → approved

---

### TC-009: 全 skip escalation では member が pending のまま残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: reviewer が構成された round の全 skip は非 green とする > Scenario: 全 skip escalation では member が pending のまま残る

---

### TC-010: 正典変更後の再走で新承認が新 revision / 新 canonHash に束縛される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 新規承認は現在の revision と canonHash に束縛される > Scenario: 正典変更後の再走で新承認が新 revision / 新 canonHash に束縛される

---

## T-01: 正典文書パスの pure ヘルパ（paths.ts）

### TC-011: canonicalDocPaths が正典 5 パスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `canonicalDocPaths("foo")` を呼ぶ
**WHEN** 関数が評価される
**THEN** `specrunner/changes/foo/request.md`, `specrunner/changes/foo/spec.md`, `specrunner/changes/foo/design.md`, `specrunner/changes/foo/tasks.md`, `specrunner/changes/foo/test-cases.md` の 5 パスが返される（実在チェックなし、純粋なパス生成）

---

### TC-012: isCanonicalDocPath が正典文書に true を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `isCanonicalDocPath` を用意する
**WHEN** `"specrunner/changes/foo/design.md"` / `"specrunner/changes/foo/request.md"` / `"specrunner/changes/foo/spec.md"` / `"specrunner/changes/foo/tasks.md"` / `"specrunner/changes/foo/test-cases.md"` を渡す
**THEN** いずれも `true` を返す

---

### TC-013: isCanonicalDocPath が pipeline 出力・state ファイルに false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `isCanonicalDocPath` を用意する
**WHEN** `"specrunner/changes/foo/foo-result-001.md"` / `"specrunner/changes/foo/review-feedback-001.md"` / `"specrunner/changes/foo/state.json"` / `"specrunner/changes/foo/events.jsonl"` / `"specrunner/changes/foo/rules.md"` を渡す
**THEN** いずれも `false` を返す

---

### TC-014: isCanonicalDocPath が archive 配下のパスに false を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `isCanonicalDocPath` を用意する
**WHEN** `"specrunner/changes/archive/2026-01-01-foo/design.md"` / `"specrunner/changes/canceled/foo/request.md"` のように slug 直下より深いパスを渡す
**THEN** `false` を返す（深さ 3 以上は正典扱いしない）

---

### TC-015: isCanonicalDocPath が change folder 外パスに false を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `isCanonicalDocPath` を用意する
**WHEN** `"src/foo.ts"` / `"specrunner/reviewers/x.md"` / `"specrunner/project.md"` を渡す
**THEN** いずれも `false` を返す

---

## T-02: round の除外を pipeline 出力に限定する（excludePipelineManagedChangePaths）

### TC-016: 正典文書は除外されず保持される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `excludePipelineManagedChangePaths` を用意する
**WHEN** `["specrunner/changes/foo/design.md"]` を渡す
**THEN** `["specrunner/changes/foo/design.md"]` がそのまま返される（除外されない）

---

### TC-017: pipeline 出力ファイルは除外される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `excludePipelineManagedChangePaths` を用意する
**WHEN** `["specrunner/changes/foo/foo-result-001.md", "specrunner/changes/foo/review-feedback-001.md", "specrunner/changes/foo/state.json"]` を渡す
**THEN** 結果は空配列 `[]` になる

---

### TC-018: change folder 外のパスは保持される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `excludePipelineManagedChangePaths` を用意する
**WHEN** `["src/foo.ts", "specrunner/reviewers/x.md", "specrunner/project.md"]` を渡す
**THEN** いずれのパスも除外されず全て返される

---

### TC-019: 同 prefix 別ディレクトリのパスは保持される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `excludePipelineManagedChangePaths` を用意する
**WHEN** `["specrunner/changes-not-a-child/file.ts"]` を渡す
**THEN** `["specrunner/changes-not-a-child/file.ts"]` がそのまま返される（`specrunner/changes/` に一致しない）

---

## T-03: ReviewerStatus の canonHash フィールド

### TC-020: canonHash フィールドを持つ ReviewerStatus が型エラーなく構築できる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `ReviewerStatus` 型に `canonHash?: string | null` が追加されている
**WHEN** `{ name: "r1", status: "approved", approvedAtCommit: "abc", canonHash: "hash-value" }` を構築する
**THEN** TypeScript の型エラーが発生しない。canonHash を省略した既存構築も型エラーなし（後方互換）

---

### TC-021: canonHash を含む reviewerStatuses を持つ state が operations.ts 検証を通過する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `operations.ts` の reviewerStatuses 検証は name / status のみ検査する
**WHEN** `canonHash` フィールドを含む reviewerStatuses を持つ state オブジェクトで検証を実行する
**THEN** 検証エラーが発生せず、追加フィールドが素通りで通過する

---

## T-04: reviewer-status.ts 純粋関数の拡張

### TC-022: computeCanonHash に空配列を渡すと null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `computeCanonHash` を用意する
**WHEN** `[]` を渡す
**THEN** `null` を返す

---

### TC-023: computeCanonHash に全 hash null の refs を渡すと null を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `computeCanonHash` を用意する
**WHEN** `[{ path: "a.md", hash: null }, { path: "b.md", hash: null }]` を渡す
**THEN** `null` を返す（採用 refs が 0 件）

---

### TC-024: 内容が異なる refs からは異なる canonHash 文字列が生成される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `computeCanonHash` を用意する
**WHEN** hash 値が異なる 2 つの refs セットをそれぞれ渡す
**THEN** 返却される文字列が互いに異なる

---

### TC-025: 同一内容の refs は順序によらず同じ canonHash 文字列を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `computeCanonHash` を用意する
**WHEN** 同じ path/hash ペアを異なる順序で並べた 2 つの refs セットをそれぞれ渡す
**THEN** 両者が同じ文字列を返す（path 昇順ソートにより決定的）

---

### TC-026: selectPendingMembers: baselineCommit=null の approved member は skip される（managed fail-safe）

**Category**: unit
**Priority**: must
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member（canonHash あり）が存在する
**WHEN** `selectPendingMembers(statuses, members, null, "some-hash")` を呼ぶ
**THEN** その member は pending に含まれない（baselineCommit=null で canon check 前に短絡 skip）

---

### TC-027: selectPendingMembers: revision 一致 + canonHash 一致 → skip

**Category**: unit
**Priority**: must
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member の `approvedAtCommit = "C1"`, `canonHash = "H1"` が記録されている
**WHEN** `selectPendingMembers(statuses, members, "C1", "H1")` を呼ぶ
**THEN** その member は pending に含まれない（skip）

---

### TC-028: selectPendingMembers: revision 一致 + canonHash 不一致 → pending

**Category**: unit
**Priority**: must
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member の `approvedAtCommit = "C1"`, `canonHash = "H1"` が記録されている
**WHEN** `selectPendingMembers(statuses, members, "C1", "H2")` を呼ぶ（H2 ≠ H1）
**THEN** その member が pending に含まれる（正典変更 → fail-closed）

---

### TC-029: selectPendingMembers: revision 一致 + record.canonHash 欠落 → pending（legacy fail-closed）

**Category**: unit
**Priority**: must
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member の `approvedAtCommit = "C1"` のみが記録され、`canonHash` フィールドが存在しない（旧 record）
**WHEN** `selectPendingMembers(statuses, members, "C1", "H1")` を呼ぶ
**THEN** その member が pending に含まれる（legacy record → fail-closed）

---

### TC-030: selectPendingMembers: currentCanonHash=null → pending（canon 検証不能 → fail-closed）

**Category**: unit
**Priority**: must
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member の `approvedAtCommit = "C1"`, `canonHash = "H1"` が記録されている
**WHEN** `selectPendingMembers(statuses, members, "C1", null)` を呼ぶ（currentCanonHash=null）
**THEN** その member が pending に含まれる（canon 検証不能 → fail-closed）

---

### TC-031: selectPendingMembers: currentCanonHash=undefined → skip（3-arg 後方互換）

**Category**: unit
**Priority**: must
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member の `approvedAtCommit = "C1"`, `canonHash = "H1"` が記録されている
**WHEN** `selectPendingMembers(statuses, members, "C1")` を呼ぶ（第 4 引数なし = undefined）
**THEN** その member は pending に含まれない（canon 束縛が engaged していない既存呼び出しを壊さない）

---

### TC-032: selectPendingMembers: revision 不一致 → pending（既存挙動の保存）

**Category**: unit
**Priority**: should
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** approved member の `approvedAtCommit = "C1"` が記録されている
**WHEN** `selectPendingMembers(statuses, members, "C2", "H1")` を呼ぶ（C2 ≠ C1）
**THEN** その member が pending に含まれる（revision 不一致の既存挙動は新引数追加後も変わらない）

---

### TC-033: applyRoundResults: approved verdict の member に canonHash が記録される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** member が approved verdict を返した round 結果がある
**WHEN** `applyRoundResults(statuses, results, "C2", "H2")` を呼ぶ
**THEN** 該当 member の status に `approvedAtCommit = "C2"` と `canonHash = "H2"` が記録される

---

### TC-034: aggregateVerdict(["skipped","skipped"]) → escalation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `aggregateVerdict` を用意する
**WHEN** `["skipped", "skipped"]` を渡す
**THEN** `"escalation"` を返す（旧挙動 "approved" から変更済みの期待）

---

### TC-035: aggregateVerdict([]) → approved

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `aggregateVerdict` を用意する
**WHEN** `[]` を渡す
**THEN** `"approved"` を返す（member 0 件、機能未使用）

---

### TC-036: aggregateVerdict(["approved","skipped"]) → approved

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `aggregateVerdict` を用意する
**WHEN** `["approved", "skipped"]` を渡す
**THEN** `"approved"` を返す（混在。全 skip ではないため非 green 化しない）

---

### TC-037: aggregateVerdict(["needs-fix","skipped"]) → needs-fix

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `aggregateVerdict` を用意する
**WHEN** `["needs-fix", "skipped"]` を渡す
**THEN** `"needs-fix"` を返す（needs-fix 優先）

---

## T-05: ParallelReviewRound への組み込み

### TC-038: 全 member skipped 時に roundError が設定され applyRoundResults が抑止される

**Category**: integration
**Priority**: must
**Source**: design.md > D6: 全 skip → escalation（member 0 は approved）と resume 再現

**GIVEN** 1 件以上の member を持つ round を用意し、全 member が "skipped" verdict を返す fake executor を注入する
**WHEN** `ParallelReviewRound.run` を実行する
**THEN** `roundError` に `ROUND_ALL_MEMBERS_SKIPPED` が設定され、`applyRoundResults` が呼ばれず、各 member の status が pending のまま確定する（escalation として返却）

---

### TC-039: managed runtime では既存の承認 skip 挙動が変わらない

**Category**: integration
**Priority**: should
**Source**: design.md > D4: selectPendingMembers の判定順序と canon の欠落・不能ポリシー

**GIVEN** `baselineCommit = null`（managed runtime）で承認済み member を持つ state を用意する
**WHEN** `ParallelReviewRound.run` を実行する（runtimeStrategy.digestArtifacts なし）
**THEN** 承認済み member は canon check に到達せず skip される（managed fail-safe の既存挙動が不変）

---

## T-07: reviewer-activation-e2e の期待更新

### TC-040: 単一 reviewer が activation 不一致で skip → job が awaiting-resume で停止

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 単一 reviewer が activation paths または requestTypes の不一致により "skipped" verdict を返す構成
**WHEN** job を実行する（TC-ACT-01 / TC-ACT-02 相当のケース）
**THEN** `result.status` が `"awaiting-resume"`（全 skip escalation）になる。member verdict が "skipped" であることの assertion は維持される

---

### TC-041: TC-ACT-04 第 2 テスト（skipped + approved 混在）は awaiting-archive のまま変わらない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 2 件の reviewer のうち 1 件が "skipped"、1 件が "approved" を返す構成
**WHEN** job を実行する（TC-ACT-04 第 2 テスト相当）
**THEN** `result.status` が `"awaiting-archive"` のまま（混在は全 skip ではないため escalation にならない）

---

### TC-042: custom-reviewers-e2e の approved / needs-fix ケースが影響を受けない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** custom reviewer が実際に approved または needs-fix verdict を返す構成
**WHEN** job を実行する（custom-reviewers-e2e.test.ts の既存ケース）
**THEN** 全 skip escalation の影響を受けず、既存の期待（TC-050 / TC-051 の承認 skip / invalidation 挙動含む）が green のまま

---

## T-08: E2E（fabricated state + 実 git）

### TC-043: シナリオ A — 承認済み state → 正典変更 → 再走 → 新 revision / 新 canonHash に束縛

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** 実 git の temp repo で reviewer が `canonHash=H1` / `approvedAtCommit=C1` で承認済みの fabricated state を用意する
**WHEN** 正典文書（例: design.md）を変更して `git commit`（HEAD=C2, canonHash=H2 に更新）し、承認済み state を fabricate して round を再実行する（approved を返す fake StepExecutor を使用）
**THEN** reviewer が pending に戻って再走し、更新後の status に `approvedAtCommit=C2` と `canonHash=H2` が束縛される

---

### TC-044: シナリオ B — 正典・source 不変の resume で承認 skip が維持される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** 実 git の temp repo で reviewer が `canonHash=H1` / `approvedAtCommit=C1` で承認済みの state を用意する
**WHEN** 正典文書も activation 対象 source path も変更せずに round を再実行する
**THEN** reviewer が skip され、fake StepExecutor が呼ばれない（再走しない）

---

### TC-045: シナリオ C — findings ファイルのみの変更では reviewer が invalidation を受けない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** 実 git の temp repo で承認済み reviewer が存在する state を用意する
**WHEN** round 間で `<name>-result-NNN.md` 等の pipeline 出力ファイルのみを commit する（正典文書・source は不変）
**THEN** 除外後の source-touched が空になり、reviewer は invalidation を受けず skip される

---

## T-09: 破壊確認の記録と検証ゲート

### TC-046: 破壊確認 — canon 束縛除去で正典変更テストが fail する

**Category**: manual
**Priority**: should
**Source**: design.md > 破壊確認（teeth のフォールバック検証）

**GIVEN** `selectPendingMembers` の canon 判定分岐を削除して旧挙動に戻す
**WHEN** TC-001 / TC-028 相当のテストを実行する
**THEN** 正典変更後も member が pending に戻らずテストが fail する（破壊確認としてコードコメントまたは設計ドキュメントに記録）

---

### TC-047: 破壊確認 — 全 change folder 除外（旧 excludeChangeFolderPaths）に戻すと正典文書 surfacing テストが fail する

**Category**: manual
**Priority**: should
**Source**: design.md > 破壊確認（teeth のフォールバック検証）

**GIVEN** `excludePipelineManagedChangePaths` を旧 `excludeChangeFolderPaths`（change folder 全除外）に戻す
**WHEN** TC-005 / TC-016 相当のテストを実行する
**THEN** 正典文書が touched リストに現れずテストが fail する。TC-004 / TC-017 相当（findings 除外）は両方式で pass することを確認する

---

### TC-048: 破壊確認 — 全 skip approved 戻しで escalation テストが fail する

**Category**: manual
**Priority**: should
**Source**: design.md > 破壊確認（teeth のフォールバック検証）

**GIVEN** `aggregateVerdict` の全 skip 分岐を除去して旧挙動（全 skip → approved）に戻す
**WHEN** TC-006 / TC-034 相当のテストを実行する
**THEN** 全 skip round が approved になりテストが fail する

---

### TC-049: 破壊確認 — legacy record を skip 扱いに戻すと fail-closed テストが fail する

**Category**: manual
**Priority**: should
**Source**: design.md > 破壊確認（teeth のフォールバック検証）

**GIVEN** `selectPendingMembers` で `record.canonHash` 欠落時を skip 扱いに戻す
**WHEN** TC-003 / TC-029 相当のテストを実行する
**THEN** legacy record を持つ approved member が pending に戻らずテストが fail する

---

### TC-050: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** 本変更のすべての実装が完了している
**WHEN** `bun run typecheck && bun run test`（または project の verification.commands）を実行する
**THEN** 型エラーなし、全テストが green で完了する

---

## Result

```yaml
result: completed
total: 50
automated: 45
manual: 5
must: 39
should: 11
could: 0
blocked_reasons: []
```
