# Test Cases: verification に lockfile 整合 gate を追加する

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

- **Total**: 25 cases
- **Automated** (unit/integration): 24
- **Manual**: 1
- **Priority**: must: 12, should: 9, could: 4

---

## Scenario 由来 TC

### TC-001: 依存追加 + lockfile 変更なし → failed（#935 の再現）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 依存変更に lockfile 同期が伴わなければ gate は fail する > Scenario: 依存追加 + lockfile 変更なし → failed（#935 の再現）

### TC-002: 依存追加 + lockfile 変更あり → passed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 依存変更に lockfile 同期が伴わなければ gate は fail する > Scenario: 依存追加 + lockfile 変更あり → passed

### TC-003: workspace 配下 package.json の依存変更でも検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 依存変更に lockfile 同期が伴わなければ gate は fail する > Scenario: workspace 配下 package.json の依存変更でも検出される

### TC-004: scripts / version のみの変更 → 非 failed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 依存関連セクションに差の無い package.json 変更は偽陽性にしない > Scenario: scripts / version のみの変更 → 非 failed

### TC-005: lockfile 非追跡 repo → skipped

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 検査対象外・検査不能は fail させず可視化する > Scenario: lockfile 非追跡 repo → skipped

### TC-006: diff 導出不能 → skipped + 検査不能の明示

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 検査対象外・検査不能は fail させず可視化する > Scenario: diff 導出不能 → skipped + 検査不能の明示

### TC-007: phases 経路で gate が実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: gate は commands 経路 / phases 経路の両方で主検証の後に実行される > Scenario: phases 経路で gate が実行される

### TC-008: commands 経路で gate が実行される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: gate は commands 経路 / phases 経路の両方で主検証の後に実行される > Scenario: commands 経路で gate が実行される

### TC-009: baseBranch 未指定なら gate は走らない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: gate は commands 経路 / phases 経路の両方で主検証の後に実行される > Scenario: baseBranch 未指定なら gate は走らない

### TC-010: 両分岐の user message に lockfile 同期指示が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer の手順に lockfile 同期指示が含まれる > Scenario: 両分岐の user message に lockfile 同期指示が含まれる

---

## 非 Scenario 由来 TC

### TC-011: `isLockfileName` が既知の lockfile 名を正しく判定する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `isLockfileName` に各種ファイル名を渡す
**WHEN** 判定を実行する
**THEN** `bun.lock` / `package-lock.json` / `pnpm-lock.yaml` / `bun.lockb` / `yarn.lock` は `true` を返し、`package.json` / `foo.lock` / `some-package.json` は `false` を返す

### TC-012: `findLockfile` が lockfile を持つディレクトリで正しく検出する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `bun.lock` を持つディレクトリを模した `fsLike`（`existsSync` が `true` を返す）を注入して `findLockfile(cwd, fsLike)` を呼ぶ
**WHEN** `findLockfile` を実行する
**THEN** `{ pm: "bun", filename: "bun.lock", root: cwd }` が返る

### TC-013: `findLockfile` が lockfile を持たないディレクトリで `null` を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `existsSync` が常に `false` を返す `fsLike` を注入して `findLockfile(cwd, fsLike)` を呼ぶ（ファイルシステム root まで探索しても見つからない状態）
**WHEN** `findLockfile` を実行する
**THEN** `null` が返る

### TC-014: `getChangedFileList` が stdout を改行区切りでパースしファイル配列を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `spawn` を注入し、`git diff --name-only --diff-filter=d main...HEAD` の stdout として `"src/index.ts\npackage.json\n"` を返すよう設定する
**WHEN** `getChangedFileList({ cwd, baseBranch: "main", spawn })` を実行する
**THEN** `["src/index.ts", "package.json"]` を返す（末尾空行・空文字は除外される）

### TC-015: `getChangedFileList` が git 非 0 終了で throw する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** 注入した `spawn` が非 0 終了コードを返すよう設定する
**WHEN** `getChangedFileList` を実行する
**THEN** エラーを throw する（`runLockfileSyncGate` が catch して skipped に倒すことを担保する前提となる挙動）

### TC-016: `depSectionsDiffer` — `dependencies` に追加がある場合は `true` を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `basePkg = { "dependencies": { "foo": "1.0.0" } }`, `headPkg = { "dependencies": { "foo": "1.0.0", "bar": "2.0.0" } }` を用意する
**WHEN** `depSectionsDiffer(basePkg, headPkg)` を実行する
**THEN** `true` を返す（`bar` の追加を依存変更として検出する）

### TC-017: `depSectionsDiffer` — `scripts` / `version` のみ異なる場合は `false` を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** base と HEAD で `scripts`・`version` のみ異なり、依存関連 7 セクション（dependencies / devDependencies / peerDependencies / optionalDependencies / overrides / resolutions / packageManager）は同一の package.json を用意する
**WHEN** `depSectionsDiffer(basePkg, headPkg)` を実行する
**THEN** `false` を返す（非依存セクションの変更は偽陽性にならない）

### TC-018: `depSectionsDiffer` — key 並び替えのみの差は `false` を返す

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-03

**GIVEN** `basePkg = { "dependencies": { "a": "1.0.0", "b": "2.0.0" } }`, `headPkg = { "dependencies": { "b": "2.0.0", "a": "1.0.0" } }` を用意する（key の順序のみ異なり値は同一）
**WHEN** `depSectionsDiffer(basePkg, headPkg)` を実行する
**THEN** `false` を返す（canonical JSON 化により key 並び替えは吸収される）

### TC-019: `depSectionsDiffer` — `base=null` かつ HEAD に依存あり → `true` を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `basePkg = null`（新規追加ファイルを表す）、`headPkg = { "dependencies": { "foo": "1.0.0" } }` を用意する
**WHEN** `depSectionsDiffer(null, headPkg)` を実行する
**THEN** `true` を返す（新規 workspace パッケージの依存追加も lockfile 同期対象として検出される）

### TC-020: `depSectionsDiffer` — HEAD package.json が parse 不能の場合は `false` を返す

**Category**: unit
**Priority**: could
**Source**: design.md > D4（Alternatives: malformed JSON は build/typecheck phase が拾う）

**GIVEN** `basePkg` は正常な package.json、`headPkg` には malformed な JSON が渡される（`JSON.parse` が例外を投げる入力）
**WHEN** `depSectionsDiffer` を実行する
**THEN** `false` を返す（parse 不能ファイルは「依存変更なし」扱いとし gate を fail させない）

### TC-021: `runLockfileSyncGate` — 変更集合に `package.json` が含まれない場合は `skipped`

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** 変更ファイル集合が `["src/index.ts", "README.md"]` のみ（package.json を含まない）となるよう `spawn` を注入する
**WHEN** `runLockfileSyncGate({ slug, cwd, baseBranch, spawn })` を実行する
**THEN** 返り値の `status` が `"skipped"` になる

### TC-022: `runLockfileSyncGate` — `some-package.json` は `basename` 比較で対象外になる

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04（「`endsWith` ではなく `basename` 比較を使うこと。`some-package.json` の偽陽性を防ぐため」）

**GIVEN** 変更ファイル集合が `["lib/some-package.json"]` のみとなるよう `spawn` を注入する
**WHEN** `runLockfileSyncGate` を実行する
**THEN** `some-package.json` は `basename` 比較により `package.json` と一致せず、gate は `skipped` を返す（偽陽性にならない）

### TC-023: `runLockfileSyncGate` — HEAD package.json が `fs` 読取不能の場合は該当ファイルを対象外にする

**Category**: unit
**Priority**: could
**Source**: design.md > D4（HEAD 版 package.json が parse 不能は「依存変更なし」扱い）

**GIVEN** 変更集合に `package.json` を含み、`fs.readFile` が当該ファイルに対してエラーを返すよう `fsLike` を注入する
**WHEN** `runLockfileSyncGate` を実行する
**THEN** 該当 package.json は「依存変更なし」扱いになり、gate は `skipped` を返す（読取不能は failed にしない）

### TC-024: runner — 先行 phase が failed の場合 `lockfile-sync` は fail-fast で `skipped` になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `baseBranch` を指定した runner 呼び出しで、先行 phase/command が `failed` になる設定を用意する
**WHEN** verification を実行する
**THEN** `lockfile-sync` phase の `status` が `"skipped"` になる（fail-fast により `runLockfileSyncGate` は呼ばれない）

### TC-025: 新規 runtime 依存が `package.json` に追加されていない

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07（「`package.json` に**新規 runtime 依存が追加されていない**ことを確認する」）

**GIVEN** 実装完了後の `package.json` の `dependencies` セクション
**WHEN** base branch との diff を確認する
**THEN** `dependencies` に新規エントリが一切追加されていない（gate 実装は `node:*` 組み込みと既存 util のみを使用している）

## Result

```yaml
result: completed
total: 25
automated: 24
manual: 1
must: 12
should: 9
could: 4
blocked_reasons: []
```
