# Test Cases: request 入口の決定化 — `request prompt` 新設と `request generate` 廃止

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
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
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 16, should: 1, could: 0

---

## Scenario 由来 TC（GWT 省略 — behavior の正典は spec.md の Scenario）

### TC-001: request prompt が必須セクションと規律と検証指示を出力する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `request prompt` は決定的な起票プロンプトを stdout に出力する > Scenario: request prompt が必須セクションと規律と検証指示を出力する

---

### TC-002: request prompt が認証・ネットワークなしで決定的に完了する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `request prompt` は決定的な起票プロンプトを stdout に出力する > Scenario: request prompt が認証・ネットワークなしで決定的に完了する

---

### TC-003: request prompt と request template が同一の雛形ソースを消費する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 雛形の知識源は単一である > Scenario: request prompt と request template が同一の雛形ソースを消費する

---

### TC-004: request generate が未知サブコマンドとして拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `request generate` とその一本鎖は廃止される > Scenario: request generate が未知サブコマンドとして拒否される

---

### TC-005: 廃止シンボルへの参照が src / docs に残らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `request generate` とその一本鎖は廃止される > Scenario: 廃止シンボルへの参照が src / docs に残らない

---

### TC-006: 入口に LLM 系 import を仕込むと red になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request 系入口は LLM 系 port / adapter を import しない（B-18 の歯）> Scenario: 入口に LLM 系 import を仕込むと red になる

---

### TC-007: usage と docs に generate 案内が残らず prompt が案内される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: docs と CLI usage が新しい入口を案内する > Scenario: usage と docs に generate 案内が残らず prompt が案内される

---

## 非 Scenario 由来 TC（GWT 必須）

### TC-008: 生成一本鎖 5 ファイルが削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 変更後の `src/` ディレクトリ

**WHEN** 下記 5 ファイルの存在を確認する:
`src/core/command/request-create.ts` /
`src/core/request/generator.ts` /
`src/prompts/request-generate-system.ts` /
`src/core/port/one-shot-query-client.ts` /
`src/adapter/claude-code/one-shot-query-client.ts`

**THEN** いずれのファイルも存在しない

---

### TC-009: manager.ts に create / generator / OneShotQueryClient が現れない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 変更後の `src/core/request/manager.ts`

**WHEN** ファイル内容を `create` / `generator` / `OneShotQueryClient` で検索する

**THEN** いずれのシンボルも 0 件である（`list` / `resolve` は残存する）

---

### TC-010: port/index.ts から OneShotQueryClient 系 re-export が除去されている

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** 変更後の `src/core/port/index.ts`

**WHEN** ファイル内容を `OneShotQueryClient` / `OneShotQueryOptions` / `OneShotQueryResult` で検索する

**THEN** いずれも 0 件である

---

### TC-011: CommandInvocation.command union に "request-generate" リテラルが残置されている

**Category**: unit
**Priority**: must
**Source**: design.md > D4

**GIVEN** 変更後の `src/core/usage/types.ts`

**WHEN** `CommandInvocation.command` の union 型定義を検査する

**THEN** `"request-generate"` リテラルが union に含まれている（過去 usage 読み取り互換のため残置）

---

### TC-012: src/adapter/claude-code/query-one-shot.ts が削除されず存在する

**Category**: unit
**Priority**: must
**Source**: design.md > D5

**GIVEN** 変更後の `src/adapter/claude-code/` ディレクトリ

**WHEN** `query-one-shot.ts` の存在を確認する

**THEN** ファイルが存在する（本 change のスコープ外として意図的に残置）

---

### TC-013: drift-guard が request-generate エントリ除去後に count = 14 で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `REQUEST_GENERATE_SYSTEM_PROMPT` エントリと TC-025 ブロックを除去し、`ALL_x_AGENT_PROMPTS.length` 期待を 14 に更新した `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts`

**WHEN** drift-guard テストを実行する

**THEN** TC-028 相当の count assertion が 14 で green になる

---

### TC-014: 生成専用テストファイル 3 件が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 変更後の `tests/` ディレクトリ

**WHEN** 下記 3 ファイルの存在を確認する:
`tests/unit/command/request-create.test.ts` /
`tests/unit/core/request/generator.test.ts` /
`tests/prompts/request-generate-system.test.ts`

**THEN** いずれのファイルも存在しない

---

### TC-015: request prompt 出力に repo 固有資源（architecture/）が現れない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `executePrompt()` または `buildRequestPrompt()` の出力文字列

**WHEN** 出力を `architecture/` パターンで検索する

**THEN** マッチが 0 件である

---

### TC-016: removed-commands.test.ts から request-create.js の vi.mock が除去されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** 変更後の `tests/unit/cli/removed-commands.test.ts`

**WHEN** `request-create.js` に対する `vi.mock` 呼び出しの有無を確認する

**THEN** `request-create.js` の `vi.mock` が存在しない（削除済みモジュールへの mock 参照が除去されている）

---

### TC-017: typecheck && test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** 変更後のコードベース全体（T-01 〜 T-08 完了後）

**WHEN** `typecheck && test` を実行する

**THEN** 型検査とすべてのテストが green で完了する

---

## Result

```yaml
result: completed
total: 17
automated: 17
manual: 0
must: 16
should: 1
could: 0
blocked_reasons: []
```
