# Test Cases: adr-gen が fixer 適用後の最終実装から ADR を導出する

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

- **Total**: 23 cases
- **Automated** (unit/integration): 23
- **Manual**: 0
- **Priority**: must: 20, should: 3, could: 0

---

## Spec Scenario 由来 TC（GWT 省略）

### TC-001: fixer round の changed files と指摘要約が message に含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: adr-gen message に post-fix context ブロックを機械注入する > Scenario: fixer round の changed files と指摘要約が message に含まれる

### TC-002: 複数 fixer round の全件が post-fix ブロックに含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: adr-gen message に post-fix context ブロックを機械注入する > Scenario: 複数 fixer round の全件が post-fix ブロックに含まれる

### TC-003: changed files と指摘要約は機械事実のみを真実源にする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: adr-gen message に post-fix context ブロックを機械注入する > Scenario: changed files と指摘要約は機械事実のみを真実源にする

### TC-004: code-review iteration の findings が対応 round に併記される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 各 fixer round は直前の最新 findings-bearing run に対応付ける > Scenario: code-review iteration の findings が対応 round に併記される

### TC-005: code-fixer が一度も走っていない run では従来 message を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fixer が走っていない run では従来 message を維持する > Scenario: code-fixer が一度も走っていない run

### TC-006: listCommitChangedFiles port が不在で null 縮退する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出不能時はブロックを省略し step を正常続行する > Scenario: listCommitChangedFiles port が不在（managed runtime 相当）

### TC-007: commitOid を持つ round が無い場合に null 縮退する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出不能時はブロックを省略し step を正常続行する > Scenario: commitOid を持つ round が無い

### TC-008: listCommitChangedFiles が unavailable / throw する場合に null 縮退する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出不能時はブロックを省略し step を正常続行する > Scenario: listCommitChangedFiles が unavailable / port が throw する

### TC-009: 優先順位規律が system prompt に存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: system prompt に post-fix 優先順位規律を含める > Scenario: 優先順位規律が system prompt に存在する

---

## 非 Scenario 由来 TC（GWT あり）

### TC-010: DynamicContext に postFixContext field が追加され typecheck が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: DynamicContext に postFixContext field を追加する

**GIVEN** `src/git/dynamic-context.ts` の `DynamicContext` interface に `postFixContext?` optional field が追加されている（`priorRoundContext` / `factCheckAttestation` の前例に倣う inline 構造型）
**WHEN** `bun run typecheck` を実行する
**THEN** コンパイルエラーなく green になる。`collectDynamicContext` は本 field を設定しない（既存挙動不変）

### TC-011: resolveCodeFixerRounds — commitOid を持つ run のみ順序保存で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: post-fix-context.ts の resolveCodeFixerRounds

**GIVEN** `state.steps[CODE_FIXER]` に StepRun が複数あり、一部には `commitOid` があり一部には無い
**WHEN** `resolveCodeFixerRounds(state)` を呼ぶ
**THEN** `commitOid` を持つ run のみを宣言順（順序保存）で `{ commitOid, endedAt }` の配列として返す。`commitOid` を持たない run はスキップされる

### TC-012: resolveCodeFixerRounds — code-fixer run 無し / commitOid 無しで空配列

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: post-fix-context.ts の resolveCodeFixerRounds

**GIVEN** `state.steps[CODE_FIXER]` が存在しない、または全 StepRun に `commitOid` が無い
**WHEN** `resolveCodeFixerRounds(state)` を呼ぶ
**THEN** 空配列 `[]` を返す

### TC-013: findFindingsBeforeTimestamp — fixer round 直前の最新 findings-bearing run の findings を射影

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: post-fix-context.ts の findFindingsBeforeTimestamp

**GIVEN** `state.steps` に `endedAt < t` かつ `outcome.toolResult?.findings` が非空の StepRun が複数あり、最も遅い run が timestamp `t_max` を持つ
**WHEN** `findFindingsBeforeTimestamp(state, t)` を呼ぶ（`t > t_max`）
**THEN** `t_max` の run の findings を `{ severity, resolution, file, title }` に射影した配列を返す。`endedAt >= t` の run は選ばれない

### TC-014: findFindingsBeforeTimestamp — 該当する findings-bearing run が無い場合に空配列

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: post-fix-context.ts の findFindingsBeforeTimestamp

**GIVEN** `state.steps` に `endedAt < t` を満たす findings-bearing run が存在しない
**WHEN** `findFindingsBeforeTimestamp(state, t)` を呼ぶ
**THEN** 空配列 `[]` を返す

### TC-015: buildPostFixContextBlock — XML タグで囲まれ round ごとに commitOid・changed files・指摘要約を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: post-fix-context.ts の buildPostFixContextBlock

**GIVEN** `PostFixContext` に 1 件以上の round（`round`, `commitOid`, `changedFiles`, `findings`）がある
**WHEN** `buildPostFixContextBlock(ctx)` を呼ぶ
**THEN** 返り値は `<post-fix-context>...</post-fix-context>` XML タグで囲まれ、各 round について round 番号・`commitOid`・changed files の各パス・findings の各 `{ severity, resolution, file, title }` がブロック文字列に含まれる

### TC-016: buildPostFixContextBlock — changedFiles / findings が空配列の場合に明示文言を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: post-fix-context.ts の buildPostFixContextBlock

**GIVEN** `PostFixContext` の round に `changedFiles: []` または `findings: []` が含まれる
**WHEN** `buildPostFixContextBlock(ctx)` を呼ぶ
**THEN** 空 changedFiles には「変更 file なし（machine-derived）」相当の明示文言が、空 findings には「対応 review 指摘なし」相当の明示文言が含まれる

### TC-017: AdrGenStep.prepareRoundContext が定義され derivePostFixContext に委譲する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03: AdrGenStep に post-fix context を配線する

**GIVEN** `AdrGenStep` に `prepareRoundContext(state, cwd, runtimeStrategy)` が実装されている
**WHEN** mock の `runtimeStrategy`（`listCommitChangedFiles` が success を返す）と commitOid を持つ code-fixer run を含む state を渡して呼ぶ
**THEN** `{ postFixContext: <non-null> }` を返す。`runtimeStrategy` が undefined または `listCommitChangedFiles` 不在の場合は `null` を返す。`spec-review.ts:104-113` の前例と同じ構造を踏襲する

### TC-018: 破壊確認 — 注入配線を無効化すると TC-001 の注入検証が fail する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: 破壊確認（sabotage）

**GIVEN** `AdrGenStep.buildMessage` が `dynamicContext.postFixContext` を参照しないよう配線を無効化（ブロック非注入）する
**WHEN** TC-001 相当のテスト（`postFixContext` を載せた `dynamicContext` を与えて `buildMessage` の返り値に changed files が含まれることを確認するテスト）を実行する
**THEN** 当該テストが RED になる（false-green でないことを確認）。確認後は元の配線に戻す

### TC-019: 破壊確認 — system prompt 規律を削除すると TC-009 の規律検証が fail する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05: 破壊確認（sabotage）

**GIVEN** `src/prompts/adr-gen-system.ts` の優先順位規律文言（「最終実装が正」「Alternatives Considered に書かない」「乖離時はブロックを正」）を削除する
**WHEN** TC-009 相当のテスト（`ADR_GEN_SYSTEM_PROMPT` に規律が含まれることを確認するテスト）を実行する
**THEN** 当該テストが RED になる（false-green でないことを確認）。確認後は規律を復元する

### TC-020: 既存テスト TC-ADR-STEP-02 が契約変更に伴う期待更新のみで green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: 検証・回帰

**GIVEN** `tests/unit/core/step/adr-gen.test.ts` の `TC-ADR-STEP-02` が存在する
**WHEN** `bun run test` を実行する
**THEN** `TC-ADR-STEP-02` は本 change による `buildAdrGenInitialMessage` の message 文言変化（`postFixContextBlock` opts 追加）に起因する期待更新のみを許容して green になる。それ以外のロジック変更は含まない

### TC-021: TC-ADR-STEP-01 系（adr:false 分岐）が無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06: 検証・回帰

**GIVEN** 既存テスト `TC-ADR-STEP-01` / `TC-ADR-STEP-01-step`（`adr: false` 分岐）が存在する
**WHEN** `bun run test` を実行する
**THEN** 当該テストはコード無改変で green になる。`postFixContextBlock` が undefined のときの返り値が現行と byte 同一であることが保証される

### TC-022: 層越え禁止 — post-fix-context.ts が node:child_process / git を直接 import しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: 検証・回帰（層境界チェック）

**GIVEN** `src/core/step/post-fix-context.ts` が実装されている
**WHEN** ファイルの import 文を静的検査する
**THEN** `node:child_process`・`node:child_process/promises`・直接の `git` subprocess import が存在しない。I/O は `runtimeStrategy` port の背後のみに限定される。`src/git/` から `Finding` 等の domain 型を import していない（層越えなし）

### TC-023: collectDynamicContext が postFixContext を設定しない（既存挙動不変）

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01: DynamicContext に postFixContext field を追加する > collectDynamicContext は無改変

**GIVEN** `src/git/dynamic-context.ts` の `collectDynamicContext` を呼ぶ
**WHEN** 任意の入力で `collectDynamicContext` を実行する
**THEN** 返り値の `DynamicContext` オブジェクトに `postFixContext` key が存在しない（`undefined` または absent）。本 field は adr-gen の `prepareRoundContext` のみが populate し、`collectDynamicContext` は設定しない

---

## Result

```yaml
result: completed
total: 23
automated: 23
manual: 0
must: 20
should: 3
could: 0
blocked_reasons: []
```
