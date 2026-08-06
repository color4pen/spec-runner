# Test Cases: run の detach 内蔵と `job wait`

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
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration/gate): 30
- **Manual**: 1
- **Priority**: must: 26, should: 5, could: 0

---

## --detach spawn 契約・再帰防止

### TC-001: `--detach` 指定で detached spawn が正しい形で行われる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--detach` は CLI を切り離して再 spawn し親は即 exit 0 する > Scenario: `--detach` 指定で detached spawn が正しい形で行われる

### TC-002: detach 親は pipeline を実行せず案内して exit 0 する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--detach` は CLI を切り離して再 spawn し親は即 exit 0 する > Scenario: detach 親は pipeline を実行せず案内して exit 0 する

### TC-003: 破壊確認 — detached / マーカーを外すとテストが落ちる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--detach` は CLI を切り離して再 spawn し親は即 exit 0 する > Scenario: 破壊確認 — detached / マーカーを外すとテストが落ちる

### TC-004: `--detach` と `--json` の同時指定は ARG_ERROR（exit 2）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--detach` は CLI を切り離して再 spawn し親は即 exit 0 する > Scenario: `--detach` と `--json` の同時指定は ARG_ERROR（exit 2）

### TC-005: マーカー付き子は foreground を実行し spawn しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 内部マーカー付きで起動された子は再 spawn しない > Scenario: マーカー付き子は foreground を実行し spawn しない

---

## detach log 保全・job show 表示

### TC-006: detach log の path が logs ディレクトリ配下で slug から解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detach 子の出力は slug-keyed log へ保全され `job show` から辿れる > Scenario: detach log の path が logs ディレクトリ配下で slug から解決される

### TC-007: job show が detach log の所在を表示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: detach 子の出力は slug-keyed log へ保全され `job show` から辿れる > Scenario: job show が detach log の所在を表示する

### TC-021: detach log ファイルは 0o600 モードで作成される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / T-02 Acceptance Criteria

**GIVEN** `getDetachLogPath(repoRoot, "foo")` で解決した path に対して `spawnBackground` の log redirect が fd を開く
**WHEN** `openSync` が呼ばれる
**THEN** フラグは `'a'`（append）、モードは `0o600` で開かれる

### TC-022: log redirect fd は追記モード（'a'）で開かれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `spawnBackground` が `logFilePath` オプション付きで呼ばれる
**WHEN** ファイル記述子を生成する
**THEN** `openSync(path, 'a', 0o600)` が呼ばれ、append で開かれた fd が stdio に渡される

### TC-025: detach log が存在しない場合 job show に Detach log 行は出ない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** detach log ファイルが存在しない slug の job
**WHEN** `job show <slug>` を実行する
**THEN** 出力に `Detach log:` 行は含まれず、既存の `Log:` 行は無変更である

---

## spawnBackground 拡張・既存呼び出し元無変更

### TC-008: 新オプション未指定で spawnBackground の既存挙動が保たれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `spawnBackground` は detach 用途に拡張され既存呼び出し元は無変更である > Scenario: 新オプション未指定で既存挙動が保たれる

### TC-009: detach 経路の子 env に credential とマーカーが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `spawnBackground` は detach 用途に拡張され既存呼び出し元は無変更である > Scenario: detach 経路の子 env に credential とマーカーが含まれる

---

## CLI 配線（--detach flag・SLUG_REGEX 検証・job wait registry）

### TC-023: --detach flag が run / job start / job resume で Unknown flag エラーにならない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** `run <slug> --detach`、`job start <slug> --detach`、`job resume <slug> --detach` のそれぞれ
**WHEN** CLI が flag を解析する
**THEN** "Unknown flag" / 引数エラーは発生しない

### TC-024: detach 経路で SLUG_REGEX 検証が失敗した場合 spawn せず非ゼロ終了する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria / design.md > D5

**GIVEN** `run <slug> --detach` で解決した request.md の slug が `SLUG_REGEX` に不一致（例: 大文字を含む）
**WHEN** 親が detach 経路で slug を検証する
**THEN** 子プロセスは spawn されず、親は非ゼロで終了する

---

## job wait — process-death gate

### TC-010: pid 生存中は awaiting-resume でも待ち続ける（disk-lag 吸収の歯）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait <slug>` はプロセス生存を gate にして settle まで block する > Scenario: pid 生存中は awaiting-resume でも待ち続ける（disk-lag 吸収の歯）

### TC-011: 破壊確認 — status 先行で settle するとテストが落ちる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait <slug>` はプロセス生存を gate にして settle まで block する > Scenario: 破壊確認 — status 先行で settle するとテストが落ちる

### TC-012: プロセス死亡後に確定 status を読む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait <slug>` はプロセス生存を gate にして settle まで block する > Scenario: プロセス死亡後に確定 status を読む

### TC-013: プロセス死亡後に disk status が running のままなら awaiting-resume として扱う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait <slug>` はプロセス生存を gate にして settle まで block する > Scenario: プロセス死亡後に disk status が `running` のままなら awaiting-resume として扱う

### TC-014: pid 不在の後方互換 state は isStaleRunning fallback に従う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait <slug>` はプロセス生存を gate にして settle まで block する > Scenario: pid 不在の後方互換 state は isStaleRunning fallback に従う

---

## job wait — 終了コードと 1 行報告

### TC-015: awaiting-archive は exit 0 で archive アクションを案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait` は settle 時に 1 行報告し規約通りの終了コードを返す > Scenario: awaiting-archive は 0 で archive アクションを案内する

### TC-016: awaiting-resume は exit 1 で resume アクションを案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait` は settle 時に 1 行報告し規約通りの終了コードを返す > Scenario: awaiting-resume は 1 で resume アクションを案内する

### TC-017: failed / terminated / canceled は exit 1 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait` は settle 時に 1 行報告し規約通りの終了コードを返す > Scenario: failed / terminated / canceled は 1 を返す

### TC-018: slug 不在は 2 秒 × 5 回リトライ後に exit 2 を返す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `job wait` は settle 時に 1 行報告し規約通りの終了コードを返す > Scenario: slug 不在は 2 秒 × 5 回リトライ後に exit 2 を返す

### TC-029: archived status は exit 0 を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D7 次アクション写像

**GIVEN** プロセスが死亡しており、on-disk status が `archived` の job
**WHEN** `job wait` の settle 判定を評価する
**THEN** settled と判定し exit code 0 を返す（awaiting-archive と同じ成功扱い）

---

## 運用知識の出力面注入

### TC-019: foreground 起動時案内・detach 親出力・help の文言が存在する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 運用知識をコマンド出力面に注入する > Scenario: foreground 起動時案内・detach 親出力・help の文言が存在する

### TC-020: `--detach` なしの foreground 挙動が無変更である

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 運用知識をコマンド出力面に注入する > Scenario: `--detach` なしの foreground 挙動が無変更である

### TC-026: foreground notice は stderr にのみ書かれ stdout に一切書かない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D8

**GIVEN** `--detach` なし、マーカー env 未設定の foreground run
**WHEN** pipeline が起動される
**THEN** foreground notice は stderr に出力され、stdout には一切書かれない

### TC-027: foreground notice は --quiet で抑制される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D8

**GIVEN** `run <slug> --quiet`（`--detach` なし、マーカー env 未設定）
**WHEN** pipeline が起動される
**THEN** foreground notice は出力されない

### TC-028: detach 子（マーカー設定）は foreground notice を出さない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D8

**GIVEN** `SPECRUNNER_DETACHED` 環境変数が設定された状態（detach 子として起動）で foreground 実行
**WHEN** foreground notice の出力判定を評価する
**THEN** notice は一切出力されない

---

## 最終検証

### TC-030: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-12 Acceptance Criteria

`bun run typecheck` および `bun run test` の両コマンドが green で完了すること。

---

## ドキュメント追随

### TC-031: docs/operations.md に detach + wait 標準フローが記載される

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-11 Acceptance Criteria

**GIVEN** `docs/operations.md` を確認する
**WHEN** run の起動・監視に関する記述を読む
**THEN** `--detach` + `job wait` を用いた標準フロー、SIGTERM idle-timeout の背景、opt-in であること（既定は foreground）の 3 点が明記されている

---

## Result

```yaml
result: completed
total: 31
automated: 30
manual: 1
must: 26
should: 5
could: 0
blocked_reasons: []
```
