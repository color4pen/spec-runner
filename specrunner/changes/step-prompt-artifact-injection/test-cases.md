# Test Cases: step-prompt-artifact-injection

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 16
- **Manual**: 0
- **Priority**: must: 14, should: 3, could: 0

---

### TC-001: 存在する artifact が同梱される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 存在する入力 artifact を prompt に同梱する > Scenario: 存在する artifact が同梱される

---

### TC-002: 存在しない artifact はスキップされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 存在する入力 artifact を prompt に同梱する > Scenario: 存在しない artifact はスキップされる

---

### TC-003: 出力系 artifact が除外される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 出力系 artifact は同梱しない > Scenario: 出力系 artifact が除外される

---

### TC-004: 上限超過で同梱なしにフォールバックする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 合計サイズ上限超過時は同梱しない（fail-open）> Scenario: 上限超過で同梱なしにフォールバックする

---

### TC-005: change folder に入力 artifact が無い場合も従来動作になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 合計サイズ上限超過時は同梱しない（fail-open）> Scenario: change folder に入力 artifact が無い場合も従来動作になる

---

### TC-006: buildMessage 文言が変わらない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step 文言不変・探索非制限 > Scenario: buildMessage 文言が変わらない

---

### TC-007: 2 ファイルの合計が 64KB 超でも空文字を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 (d)

**GIVEN** change folder に 2 つの入力 artifact（各 32KB 超）を書き、合計が 64KB を超える状態
**WHEN** `buildArtifactBundle(cwd, slug)` を呼ぶ
**THEN** 返り値が `""` であり、どちらのファイルも同梱ブロックに含まれない

---

### TC-008: change folder 不在 slug で空文字を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 (e-1)

**GIVEN** temp cwd 配下に `specrunner/changes/<slug>/` ディレクトリを作成しない
**WHEN** `buildArtifactBundle(cwd, slug)` を呼ぶ
**THEN** 返り値が `""` である

---

### TC-009: change folder 存在・artifact 0 件で空文字を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 (e-2)

**GIVEN** temp cwd 配下に `specrunner/changes/<slug>/` ディレクトリを作成するが、入力 artifact を 1 つも置かない
**WHEN** `buildArtifactBundle(cwd, slug)` を呼ぶ
**THEN** 返り値が `""` である

---

### TC-010: 非 ENOENT エラーファイルをスキップし他 artifact を収集する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 (f)

**GIVEN** `design.md` は正常に読めるが `tasks.md` の `fs.readFile` が `EACCES`（権限エラー）を throw するようにモックされている
**WHEN** `buildArtifactBundle(cwd, slug)` を呼ぶ
**THEN** 返り値に `design.md` の内容が含まれ、`tasks.md` のパスヘッダは含まれず、エラーで中断しない

---

### TC-011: allowlist 外ファイルを read・glob しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** change folder に `design.md`（入力系）と `verification-result.md`（出力系）と `unknown-file.md`（allowlist 外）が存在し、`fs.readFile` の呼び出しをスパイする
**WHEN** `buildArtifactBundle(cwd, slug)` を呼ぶ
**THEN** `fs.readFile` が `INPUT_ARTIFACT_NAMES` に含まれるパスのみで呼ばれ、`verification-result.md` / `unknown-file.md` のパスでは呼ばれない

---

### TC-012: codex adapter で prompt に bundled-change-artifacts ブロックが挿入される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** temp cwd を用意し `specrunner/changes/<slug>/design.md` に "DESIGN_CONTENT" を書いた状態で codex adapter runner を初期化する
**WHEN** `runner.run(ctx)` を実行しキャプチャした prompt を取得する
**THEN** prompt に `<bundled-change-artifacts>` タグと `specrunner/changes/<slug>/design.md` パスヘッダおよび "DESIGN_CONTENT" が含まれる

---

### TC-013: claude-code adapter で prompt に bundled-change-artifacts ブロックが挿入される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** temp cwd を用意し `specrunner/changes/<slug>/design.md` に "DESIGN_CONTENT" を書いた状態で claude-code adapter runner を初期化する
**WHEN** `runner.run(ctx)` を実行しキャプチャした prompt を取得する
**THEN** prompt に `<bundled-change-artifacts>` タグと `specrunner/changes/<slug>/design.md` パスヘッダおよび "DESIGN_CONTENT" が含まれる

---

### TC-014: artifactBundle 空文字時に claude-code の baseFullPrompt がバイト同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** ctx.cwd の change folder に入力 artifact が 1 つも存在しない（`buildArtifactBundle` が `""` を返す状態）
**WHEN** claude-code adapter が `baseFullPrompt` を組み立てる
**THEN** `baseFullPrompt` の値が同梱機能導入前のバイト列と同一である

---

### TC-015: artifactBundle 空文字時に codex の baseFullPrompt がバイト同一

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** ctx.cwd の change folder に入力 artifact が 1 つも存在しない（`buildArtifactBundle` が `""` を返す状態）、既存の `resume-prompt-injection.test.ts` の「resume 未指定時にプロンプトがバイト同一」ケース
**WHEN** codex adapter が `baseFullPrompt` を組み立てる
**THEN** `baseFullPrompt` の値が同梱機能導入前のバイト列と同一である（既存テストが無改変で green）

---

### TC-016: completion directive が baseFullPrompt 末尾に残る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** change folder に入力 artifact が存在し `buildArtifactBundle` が非空文字を返す状態で claude-code adapter を実行する
**WHEN** `baseFullPrompt` の末尾を確認する
**THEN** `firstTurnCompletionDirective` が `baseFullPrompt` の末尾に付いており、artifactSection の挿入によって位置がずれていない

---

### TC-017: typecheck && test gate

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06

`bun run typecheck` および `bun run test`（新規テスト含む全スイート）が green であることを verification フェーズで確認する。`src/core/step/` 配下の既存 buildMessage テストが無改変で green であることを含む。

---

## Result

```yaml
result: completed
total: 17
automated: 16
manual: 0
must: 14
should: 3
could: 0
blocked_reasons: []
```
