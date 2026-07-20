# Test Cases: CI の package smoke を初回接触契約の assert に拡張する

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

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

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

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 15
- **Manual**: 5
- **Priority**: must: 15, should: 5, could: 0

---

### TC-001: repo 外 init — 非ゼロ exit と XDG 含む無書き込み

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: init outside a git repository writes nothing including under isolated XDG

---

### TC-002: subdirectory init — repo root 着地・入れ子なし・created 項目報告

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: init from a subdirectory lands scaffold at repo root without nesting and reports created

---

### TC-003: 2 回目 init — 全項目 already-exists の冪等報告

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: second init reports per-item already-exists (idempotent)

---

### TC-004: 半初期化からの補完 — created / already-exists の項目別分離

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: half-initialized repo is completed with a per-item created / already-exists split

---

### TC-005: 隔離 XDG init → doctor の config-file-exists = pass（per-check 判定）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: isolated XDG init then doctor reports config-file-exists pass judged per-check

---

### TC-006: doctor の per-check 結果が root / subdirectory で同値

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: doctor per-check results are identical from root and subdirectory

---

### TC-007: --help — exit 0 と "Usage: specrunner" 出力の assert

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: help output includes usage text

---

### TC-008: subdirectory request new — repo root 着地・入れ子なし

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: request new from a subdirectory lands at repo root without nesting

---

### TC-009: smoke が bun / repo src/ を参照しない（ソース純粋性）

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Packaged smoke SHALL assert first-contact contracts through the real npm entry (`npx --no-install specrunner`) on the packed tarball > Scenario: the smoke does not reference bun or repository sources

---

### TC-010: token 有無に依存しない assert 構成

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Smoke SHALL run hermetically and token-free, isolated from developer and runner state > Scenario: assertions hold regardless of ambient tokens

---

### TC-011: fixtures と config がホスト環境から隔離される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Smoke SHALL run hermetically and token-free, isolated from developer and runner state > Scenario: fixtures and config are isolated from the host

---

### TC-012: CI が smoke を gate として実行し、契約違反で job が失敗する

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: CI SHALL run the smoke as a gate and the smoke SHALL be locally runnable > Scenario: CI runs the smoke script and fails on a broken contract

---

### TC-013: 開発者がローカルで同一 smoke を実行できる

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: CI SHALL run the smoke as a gate and the smoke SHALL be locally runnable > Scenario: a developer runs the same smoke locally

---

### TC-014: 期待値反転で当該 assert のみが fail し他は通過する（個別 falsifiable）

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Each smoke assertion SHALL be independently falsifiable > Scenario: inverting one expectation fails exactly that assertion

---

### TC-015: dist 未 build 時のスクリプト明示エラー停止

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01: smoke スクリプトのハーネス（pack → install → dist 解決）

**GIVEN** `dist/specrunner.js` が存在しない（build 前または意図的に削除）状態でリポジトリ root にいる
**WHEN** `bash scripts/smoke/package-smoke.sh` を実行する
**THEN** スクリプトが非ゼロ exit し、「dist/specrunner.js が存在しない / 先に build せよ」旨の明示エラーを stdout または stderr に出力する。pack / install ステップには進まない

---

### TC-016: tarball install 後の bin 配線（node_modules/.bin/specrunner）の存在確認

**Category**: integration
**Priority**: must
**Source**: design.md > D2: tarball を fixture project 自身に install し、すべての CLI 実行を `npx --no-install specrunner` で行う

**GIVEN** fixture project で `npm install --omit=optional <tarball>` が完了した直後の状態
**WHEN** スクリプトが `node_modules/.bin/specrunner` の存在を前提条件チェックとして確認する
**THEN** `node_modules/.bin/specrunner` が存在して bin 配線の成立を証明し、存在しない場合はスクリプトが即時 fail して後続 scenario に進まない

---

### TC-017: GIT_CEILING_DIRECTORIES による S1 fixture の repo 外保証

**Category**: integration
**Priority**: should
**Source**: design.md > D3: fixture は mktemp 配下に作り、XDG_CONFIG_HOME / HOME を隔離し、非対話で起動する / tasks.md > T-02

**GIVEN** mktemp が `$TMPDIR` に非 git fixture ディレクトリを作成する環境で、`$TMPDIR` が偶発的に git repo 配下に存在する可能性がある
**WHEN** S1（repo 外 init）の実行前に `GIT_CEILING_DIRECTORIES` を fixture の親に設定し、`git rev-parse --show-toplevel` で fixture が repo 外であることを確認する
**THEN** git の上位探索が temp 境界で止まり fixture が repo 外と判定される。もし fixture が repo 内と判定された場合はスクリプトが環境エラーとして明示 fail し、S1 の assert は実行されない

---

### TC-018: temp ディレクトリと tarball の cleanup（trap による後片付け）

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-01: スクリプト終了時に temp ディレクトリ・生成 tarball を後片付けする

**GIVEN** スクリプトが `mktemp -d` で temp ディレクトリを作成し、`npm pack` で tarball を生成した状態
**WHEN** スクリプトが正常終了（全 PASS）または途中エラーで終了する
**THEN** trap により temp ディレクトリと tarball が削除され、CI runner や開発者機のファイルシステムに残留しない

---

### TC-019: package.json の smoke convenience スクリプトエントリ

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06: S5 — help 維持（T5）と CI / ローカル起動口の配線

**GIVEN** `package.json` の `scripts` に `"smoke": "bash scripts/smoke/package-smoke.sh"` エントリが追加された状態
**WHEN** `npm run smoke`（または `bun run smoke`）を実行する
**THEN** `bash scripts/smoke/package-smoke.sh` が呼び出されて同一の smoke assertions が走る。既存の `build` / `test` / `lint` 等の script エントリは変更されていない

---

### TC-020: CI workflow の smoke step 配置と内容

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-06: S5 — help 維持（T5）と CI / ローカル起動口の配線

**GIVEN** `.github/workflows/ci.yml` が変更された状態
**WHEN** smoke 相当 step の内容と位置を確認する
**THEN** 既存の smoke step が `scripts/smoke/package-smoke.sh` を呼ぶ step に置き換わり、step が `bun run build`（dist 生成）より後に位置し、他の job / step（build / lint / test 等）は変更されていない

---

## Result

```yaml
result: completed
total: 20
automated: 15
manual: 5
must: 15
should: 5
could: 0
blocked_reasons: []
```
