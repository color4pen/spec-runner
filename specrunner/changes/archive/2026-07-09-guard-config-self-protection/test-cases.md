# Test Cases: fast pipeline のガード構成データを自己保護する

## Summary

- **Total**: 13 cases
- **Automated** (unit/integration): 12
- **Manual**: 1
- **Priority**: must: 9, should: 4, could: 0

---

### TC-001: fast job が config を変更すると conformance breach が検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: config 自身を fast pipeline の forbidden surface として宣言する > Scenario: fast job が config を変更すると breach が検出される

---

### TC-002: config を変更しない fast job は guard-config に起因する breach にならない

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: config 自身を fast pipeline の forbidden surface として宣言する > Scenario: config を変更しない fast job は breach にならない

---

### TC-003: worktree 内 cwd からの job resume は config 読み込み前に拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 内 cwd からの resume を config 読み込み前に拒否する > Scenario: worktree 内 cwd からの resume は拒否される

---

### TC-004: main checkout からの job resume は従来どおり動作する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: worktree 内 cwd からの resume を config 読み込み前に拒否する > Scenario: main checkout からの resume は従来どおり動作する

---

### TC-005: detectSpecrunnerWorktree — specrunner-worktrees 配下の cwd を「内側」と判定し main root を返す

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D3: 判定は specrunner 固有の path-segment 照合で行う / tasks.md > T-04

**GIVEN** 実在するディレクトリ `<root>/.git/specrunner-worktrees/<slug>-<id>` を cwd として与える
**WHEN** `detectSpecrunnerWorktree(cwd)` を呼ぶ
**THEN** `inside: true` かつ `mainCheckoutPath` が `<root>` を返す

---

### TC-006: detectSpecrunnerWorktree — main checkout の cwd を「内側でない」と判定する

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D3: 判定は specrunner 固有の path-segment 照合で行う / tasks.md > T-04

**GIVEN** `.git/specrunner-worktrees/` を含まない通常の main checkout ディレクトリを cwd として与える
**WHEN** `detectSpecrunnerWorktree(cwd)` を呼ぶ
**THEN** `inside: false` が返る

---

### TC-007: detectSpecrunnerWorktree — 無関係パスを「内側でない」と判定する

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D3: 判定は specrunner 固有の path-segment 照合で行う / tasks.md > T-04

**GIVEN** `/tmp/some-unrelated-path` のような `.git/specrunner-worktrees/` を含まないパスを cwd として与える
**WHEN** `detectSpecrunnerWorktree(cwd)` を呼ぶ
**THEN** `inside: false` が返る

---

### TC-008: detectSpecrunnerWorktree — symlink（macOS /private prefix）でも安定判定する

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D3: 判定は specrunner 固有の path-segment 照合で行う / design.md > Risks / Trade-offs

**GIVEN** `<root>/.git/specrunner-worktrees/<slug>-<id>` 内に作成した tempDir を cwd として与え、realpath が symlink 解決後の絶対パス（例: `/private/var/...`）を返す環境
**WHEN** `detectSpecrunnerWorktree(cwd)` を呼ぶ
**THEN** realpath 正規化後の実パスで正しく判定され、`inside` の値が symlink の有無によって変わらない

---

### TC-009: detectSpecrunnerWorktree — realpath 失敗時は fail-open（内側でない）を返す

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D3: 判定は specrunner 固有の path-segment 照合で行う / tasks.md > T-04

**GIVEN** 存在しないパス（`/nonexistent/path/that/does/not/exist`）を cwd として与える
**WHEN** `detectSpecrunnerWorktree(cwd)` を呼ぶ
**THEN** エラーをスローせず `inside: false` が返る（fail-open）

---

### TC-010: config.json に guard-config surface を追加しても validateConfig がエラーを投げない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` に `{ "id": "guard-config", "paths": [".specrunner/config.json"] }` が追加された状態
**WHEN** `validateConfig` を実 config ファイルに対して呼ぶ
**THEN** バリデーションエラーを投げずに通過する

---

### TC-011: dogfooding テストが guard-config surface の id 宣言を固定する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `tests/unit/core/pipeline/resolve-scope.test.ts` の dogfooding describe が実 `.specrunner/config.json` を読む
**WHEN** `pipeline.fast.forbiddenSurfaces` を参照する
**THEN** `surfaces.some((s) => s.id === "guard-config")` が `true` になる assert が通過する

---

### TC-012: dogfooding テストが guard-config surface の path 宣言を固定する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `tests/unit/core/pipeline/resolve-scope.test.ts` の dogfooding describe が実 `.specrunner/config.json` を読む
**WHEN** `pipeline.fast.forbiddenSurfaces` を参照する
**THEN** `surfaces.find((s) => s.id === "guard-config")?.paths` が `.specrunner/config.json` を含む assert が通過する

---

### TC-013: typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 全コード変更（config.json・detection.ts・resume.ts・テストファイル）が完了した状態
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript 型エラーが 0 件で通過する

---

## Result

```yaml
result: completed
total: 13
automated: 12
manual: 1
must: 9
should: 4
could: 0
blocked_reasons: []
```
