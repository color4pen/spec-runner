# Test Cases: CommandHandler exit code 返却契約と process.exit の dispatch 境界集約

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration): 27
- **Manual**: 4
- **Priority**: must: 22, should: 8, could: 1

---

## Requirement: CommandHandler は exit code を返す単一契約である

### TC-001: 正常終了する command が 0 を返す

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CommandHandler は exit code を返す単一契約である > Scenario: 正常終了する command が 0 を返す

### TC-002: 下位 primitive の non-zero exit code がそのまま透過する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CommandHandler は exit code を返す単一契約である > Scenario: 下位 primitive の non-zero exit code がそのまま透過する

### TC-003: handler 内の usage error が exit code として返る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CommandHandler は exit code を返す単一契約である > Scenario: handler 内の usage error が exit code として返る

### TC-004: すべての登録 handler が number 返却契約に適合する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommandHandler は exit code を返す単一契約である > Scenario: すべての登録 handler が number 返却契約に適合する

---

## Requirement: process termination は CLI entrypoint が単独で所有する

### TC-005: src/cli に process.exit 呼び出しが存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: process termination は CLI entrypoint が単独で所有する > Scenario: src/cli に process.exit 呼び出しが存在しない

### TC-006: dispatch 境界が handler の返却値で process を終了する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: process termination は CLI entrypoint が単独で所有する > Scenario: dispatch 境界が handler の返却値で process を終了する

### TC-007: 正常終了時に余分な stderr 出力が発生しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: process termination は CLI entrypoint が単独で所有する > Scenario: 正常終了時に余分な stderr 出力が発生しない

### TC-008: process.exit の所有先が再分散していない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: process termination は CLI entrypoint が単独で所有する > Scenario: process.exit の所有先が再分散していない

---

## Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される

### TC-009: FlagParseError が境界で変換される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される > Scenario: FlagParseError が境界で変換される

### TC-010: SpecRunnerError が境界で変換される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される > Scenario: SpecRunnerError が境界で変換される

### TC-011: 予期しない error が境界で変換される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される > Scenario: 予期しない error が境界で変換される

### TC-012: 境界の stderr 出力が secret をマスクする

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される > Scenario: 境界の stderr 出力が secret をマスクする

---

## Requirement: domain 上意味のある catch と fallback は維持される

### TC-013: doctor は SpecRunnerError も Fatal として扱う既存挙動を維持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: domain 上意味のある catch と fallback は維持される > Scenario: doctor は SpecRunnerError も Fatal として扱う既存挙動を維持する

### TC-014: doctor repair は独自 error 表示を維持する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: domain 上意味のある catch と fallback は維持される > Scenario: doctor repair は独自 error 表示を維持する

### TC-015: job ls は GitHub token 不在時の fallback を維持する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: domain 上意味のある catch と fallback は維持される > Scenario: job ls は GitHub token 不在時の fallback を維持する

### TC-016: job start は config / token / origin 解決の domain メッセージを維持する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: domain 上意味のある catch と fallback は維持される > Scenario: job start は config / token / origin 解決の domain メッセージを維持する

---

## Requirement: CLI 契約と終了契約が base と candidate で同一である

### TC-017: CommandSpec 構造が base fixture と一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI 契約と終了契約が base と candidate で同一である > Scenario: CommandSpec 構造が base fixture と一致する

### TC-018: 終了契約が base fixture と全件一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CLI 契約と終了契約が base と candidate で同一である > Scenario: 終了契約が base fixture と全件一致する

### TC-019: ケースの欠落が検出される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CLI 契約と終了契約が base と candidate で同一である > Scenario: ケースの欠落が検出される

### TC-020: guard の実行順序が維持される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CLI 契約と終了契約が base と candidate で同一である > Scenario: guard の実行順序が維持される

---

## Requirement: 再分散を防ぐ architecture ratchet が存在する

### TC-021: src/cli への process.exit 再導入が検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再分散を防ぐ architecture ratchet が存在する > Scenario: src/cli への process.exit 再導入が検出される

### TC-022: コメント内の process.exit は違反として報告されない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 再分散を防ぐ architecture ratchet が存在する > Scenario: コメント内の process.exit は違反として報告されない

### TC-023: handler の契約逸脱が検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再分散を防ぐ architecture ratchet が存在する > Scenario: handler の契約逸脱が検出される

### TC-024: entrypoint に command 名分岐が再出現していない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 再分散を防ぐ architecture ratchet が存在する > Scenario: entrypoint に command 名分岐が再出現していない

---

## 設計・実装詳細（非 Scenario 由来）

### TC-025: dispatch 境界の process.exit が try/catch の外側にある

**Category**: unit
**Priority**: should
**Source**: design.md > D3: dispatch 境界の process.exit は try/catch の外側に置く

**GIVEN** `bin/specrunner.ts` の dispatch 実装において、handler の呼び出し（`spec.handler!(parsed, ctx)`）が try ブロック内に置かれ、`process.exit(code)` が try/catch の外に分離されている
**WHEN** architecture-ratchet の Check 10 で `spec.handler` 呼び出し箇所数を検査し、`bin/specrunner.ts` の AST 構造を確認する
**THEN** `process.exit(await spec.handler(...))` の形（try 内での即時 exit）が存在せず、exit 呼び出しが try/catch ブロックの外側の 1 箇所のみにある（EC-01 の contract test が stderr 空であることで回帰を間接検出する）

---

### TC-026: void wrapper 3 件が production から削除されている

**Category**: unit
**Priority**: must
**Source**: design.md > D2: process.exit 専用の void wrapper を削除し、handler は *Core を直接呼ぶ / tasks.md > T-05

**GIVEN** `src/cli/run.ts`・`src/cli/resume.ts`・`src/cli/reopen.ts` から `runRun`・`runResume`・`runReopen`（いずれも `Promise<void>` を返す process.exit 専用 wrapper）が削除されている状態
**WHEN** production コード全体（`src/**`・`bin/**`、`__tests__` 除外）を `grep -rn "runRun\b\|runResume\b\|runReopen\b"` で検索する
**THEN** `runRunCore`・`runResumeCore`・`runReopenCore` 以外にヒットするシンボルが存在せず、3 つの void wrapper が production に残っていない

---

### TC-027: base fixture 採取 commit が production ファイルを含まない

**Category**: manual
**Priority**: should
**Source**: design.md > D6: 終了契約の base / candidate 比較 / tasks.md > T-01 Acceptance Criteria

**GIVEN** `src/cli/__tests__/fixtures/cli-exit-contract.base.json` を生成した commit（T-01 の単独 commit）
**WHEN** その commit の diff を `git show --stat <commit-sha>` で確認する
**THEN** `src/cli/*.ts`（`__tests__` 配下を除く）および `bin/specrunner.ts` が diff に一切含まれず、fixture が production 変更前の実装から採取されたことが git log で査読者に検証可能である

---

### TC-028: 「共通変換のみ」の catch が合計 5 件削除されている

**Category**: manual
**Priority**: should
**Source**: design.md > D8: 「同一変換だけを行う catch」5 件のみを削除し判定基準を設計に固定 / tasks.md > T-06 Acceptance Criteria

**GIVEN** `src/cli/job-resume-handler.ts`・`src/cli/job-archive-handler.ts`・`src/cli/reopen.ts`・`src/cli/prune.ts`・`src/cli/attach.ts` の各 catch ブロック
**WHEN** D8 の判定基準（`SpecRunnerError` → `Error:`/`Hint:`/`err.exitCode` と 非 `SpecRunnerError` → `Fatal:`/1 の 2 分岐のみで構成され、それ以外の副作用を持たない catch）に照らして差分を確認する
**THEN** 上記基準に合致する catch がちょうど 5 件削除されており、`doctor.ts` の 2 catch（全部 `Fatal:`/1 / 独自 `Error: <msg>` 形式）を含むそれ以外の catch は変更されていない

---

### TC-029: stale な JSDoc が新契約に合わせて更新されている

**Category**: manual
**Priority**: could
**Source**: design.md > D10: process.exit を説明する 4 つの stale な JSDoc を新契約に合わせて更新 / tasks.md > T-09 Acceptance Criteria

**GIVEN** `src/cli/cancel.ts`・`src/cli/prune.ts`・`src/cli/archive.ts`・`src/cli/doctor.ts` の対象 JSDoc コメント行
**WHEN** `grep -rn "process\.exit(" src/cli --include="*.ts" | grep -v "/__tests__/"` を実行し、JSDoc の文言を目視確認する
**THEN** 件数が 0 であり、4 ファイルの JSDoc が「handler は exit code を返し、termination は dispatch 境界が行う」旨を記述している（「Caller … is responsible for process.exit()」という旧記述が残っていない）

---

### TC-030: テスト追随差分に assertion 値の変更が含まれない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-10 Acceptance Criteria

**GIVEN** T-10 で修正されたテストファイル群（`tests/unit/cli/*.test.ts`・`src/cli/__tests__/*.test.ts` 等）の git diff
**WHEN** 差分を目視確認する
**THEN** stdout・stderr の期待文言文字列および期待 exit code の**値**（数値）の変更が含まれず、変更点が mock 対象シンボル名（`runRun` → `runRunCore` 等）と、`process.exit` throw を受け取る形から返却値を受け取る形への書き換えのみである

---

### TC-031: 全体ビルド・型チェック・テスト・lint が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-12 Acceptance Criteria

`bun run build`・`bun run typecheck`・`bun run test`・`bun run lint` を順に実行し、すべて exit 0 で完了すること（T-12 の Acceptance Criteria）。`cli-contract-snapshot.test.ts`（CommandSpec 構造）と `cli-exit-contract.test.ts`（終了契約 23 ケース）がともに green であることを含む。

---

## Result

```yaml
result: completed
total: 31
automated: 27
manual: 4
must: 22
should: 8
could: 1
blocked_reasons: []
```
