# Test Cases: verification result の絶対パス正規化

## Summary

- **Total**: 11 cases
- **Automated** (unit/integration): 11
- **Manual**: 0
- **Priority**: must: 5, should: 5, could: 1

---

### TC-001: cwd 配下の絶対パスが repo 相対化される

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: verification result は実行マシンの絶対パスを含んではならない > Scenario: cwd 配下の絶対パスが repo 相対化される

---

### TC-002: cwd 外の $HOME 配下パスがプレースホルダ化される

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: verification result は実行マシンの絶対パスを含んではならない > Scenario: cwd 外の $HOME 配下パスがプレースホルダ化される

---

### TC-003: verdict 判定と phase 実行の挙動が不変

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: verification result は実行マシンの絶対パスを含んではならない > Scenario: verdict 判定と phase 実行の挙動が不変

---

### TC-004: cwd が homeDir 配下にある場合、cwd 相対化が homeDir 置換より優先される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `cwd = "/home/user/repos/project"`, `homeDir = "/home/user"`, テキスト = `"built /home/user/repos/project/src/foo.ts"`  
**WHEN** `maskAbsolutePaths` を呼ぶ  
**THEN** 結果は `"built src/foo.ts"` であり、`~/repos/project/src/foo.ts` にはならない

---

### TC-005: VerificationResult オブジェクトの stdout / stderr / verdict / exitCode は正規化されない

**Category**: integration  
**Priority**: must  
**Source**: tasks.md > T-02

**GIVEN** コマンド出力に `cwd` 配下の絶対パス（例 `<cwd>/src/foo.ts`）を含む phase が存在する  
**WHEN** verification runner を実行し `VerificationResult` を受け取る  
**THEN** 返却された `PhaseResult.stdout` / `stderr` および `VerificationResult.verdict` / `exitCode` は生の値のままであり、正規化されていない

---

### TC-006: パスを含まないテキストは不変

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-03

**GIVEN** テキスト = `"build succeeded in 1.2s\nAll tests passed."`  
**WHEN** `maskAbsolutePaths` を任意の `cwd` / `homeDir` で呼ぶ  
**THEN** 返却値は入力と完全に一致する

---

### TC-007: cwd 単体の出現がドット（`.`）に置換される

**Category**: unit  
**Priority**: should  
**Source**: design.md > D3

**GIVEN** テキスト = `"project root: /home/user/repos/project"`, `cwd = "/home/user/repos/project"`  
**WHEN** `maskAbsolutePaths` を呼ぶ  
**THEN** 結果 = `"project root: ."`

---

### TC-008: homeDir 単体の出現がチルダ（`~`）に置換される

**Category**: unit  
**Priority**: should  
**Source**: design.md > D3

**GIVEN** テキスト = `"home dir: /home/user"`, `cwd = "/tmp/other"`, `homeDir = "/home/user"`  
**WHEN** `maskAbsolutePaths` を呼ぶ  
**THEN** 結果 = `"home dir: ~"`

---

### TC-009: cwd が空文字列の場合は cwd 置換をスキップし過剰置換しない

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-01

**GIVEN** `cwd = ""`, `homeDir = "/home/user"`, テキスト = `"/home/user/file.txt"`  
**WHEN** `maskAbsolutePaths` を呼ぶ  
**THEN** クラッシュせず、`/home/user/file.txt` → `~/file.txt` に正規化される（cwd 空でも homeDir 置換は機能する）

---

### TC-010: homeDir が空文字列の場合は homeDir 置換をスキップし過剰置換しない

**Category**: unit  
**Priority**: should  
**Source**: tasks.md > T-01

**GIVEN** `cwd = "/tmp/project"`, `homeDir = ""`, テキスト = `"/home/user/file.txt"`  
**WHEN** `maskAbsolutePaths` を呼ぶ  
**THEN** クラッシュせず、`/home/user/file.txt` は置換されずそのまま残る

---

### TC-011: `src/util/path-mask.ts` が `src/` 内モジュールを import しない

**Category**: unit  
**Priority**: could  
**Source**: tasks.md > T-01

**GIVEN** `src/util/path-mask.ts` のソースコードを参照する  
**WHEN** import 宣言を確認する  
**THEN** `node:os` / `node:path` 等の Node.js 標準モジュールのみを import しており、`src/` 配下のモジュールを import していない

---

## Result

```yaml
result: completed
total: 11
automated: 11
manual: 0
must: 5
should: 5
could: 1
blocked_reasons: []
```
