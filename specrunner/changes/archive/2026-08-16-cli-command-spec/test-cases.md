# Test Cases: CLI command interface の正本化 — CommandSpec から parser / help / dispatch を導出する

## Summary

- **Total**: 39 cases
- **Automated** (unit/integration): 37
- **Manual**: 0
- **Priority**: must: 35, should: 4, could: 0

---

## 列挙 API — canonical / alias 区別

### TC-001: canonical のみの列挙に alias が含まれない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 public command path が単一 registry から列挙でき、canonical と alias を区別する > Scenario: canonical のみの列挙に alias が含まれない

### TC-002: alias を含む列挙に alias が現れる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 public command path が単一 registry から列挙でき、canonical と alias を区別する > Scenario: alias を含む列挙に alias が現れる

### TC-003: alias 入力を canonical + invokedAs に解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 public command path が単一 registry から列挙でき、canonical と alias を区別する > Scenario: alias 入力を canonical + invokedAs に解決する

### TC-004: 全 public command path が spec から取得できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 全 public command path が単一 registry から列挙でき、canonical と alias を区別する > Scenario: 全 public command path が spec から取得できる

---

## alias(`run`)の継承

### TC-005: run の flags が job start と同一に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `run` は `job start` の alias として解決され契約を target から継承する > Scenario: run の flags が job start と同一に解決される

### TC-006: run の worktree guard が job start と同一に働く

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `run` は `job start` の alias として解決され契約を target から継承する > Scenario: run の worktree guard が job start と同一に働く

---

## doctor default-action + child repair

### TC-007: doctor が repo 外で実行できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `doctor` は default action、`doctor repair <slug>` は child command として表現される > Scenario: doctor が repo 外で実行できる

### TC-008: doctor repair が repo を要求する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `doctor` は default action、`doctor repair <slug>` は child command として表現される > Scenario: doctor repair が repo を要求する

### TC-009: doctor repair が command path として列挙される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `doctor` は default action、`doctor repair <slug>` は child command として表現される > Scenario: doctor repair が command path として列挙される

### TC-010: child が parent の requiresRepo を継承する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: requiresRepo は parent から継承し child で override できる > Scenario: child が parent の requiresRepo を継承する

### TC-011: child が parent の requiresRepo を override する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: requiresRepo は parent から継承し child で override できる > Scenario: child が parent の requiresRepo を override する

### TC-012: job 配下の repo-optional leaf が保存される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: requiresRepo は parent から継承し child で override できる > Scenario: job 配下の repo-optional leaf が保存される

---

## worktree guard の spec 導出

### TC-013: guarded leaf が worktree 内で拒否される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree guard は spec 宣言から導出される > Scenario: guarded leaf が worktree 内で拒否される

### TC-014: 非 guarded leaf が worktree 内で拒否されない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: worktree guard は spec 宣言から導出される > Scenario: 非 guarded leaf が worktree 内で拒否されない

---

## deprecated flag — help 非表示 / 移行エラー保存

### TC-015: login help に --provider が出ない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: deprecated flag は通常 help に出ず移行エラー挙動を保つ > Scenario: login help に --provider が出ない

### TC-016: login --provider が移行エラーで拒否される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: deprecated flag は通常 help に出ず移行エラー挙動を保つ > Scenario: login --provider が移行エラーで拒否される

---

## help 生成 — pin 文言保持

### TC-017: top-level help がグループ見出しと実コマンドを含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: help(top-level / parent / leaf) は CommandSpec から生成され pin 文言を保持する > Scenario: top-level help がグループ見出しと実コマンドを含む

### TC-018: leaf help が pin された flag 群を含む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: help(top-level / parent / leaf) は CommandSpec から生成され pin 文言を保持する > Scenario: leaf help が pin された flag 群を含む

### TC-019: top-level help に detach 説明と job wait 誘導が残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: help(top-level / parent / leaf) は CommandSpec から生成され pin 文言を保持する > Scenario: top-level help に detach 説明と job wait 誘導が残る

---

## parser 型検証 — integer FlagSpec

### TC-020: --issue の非整数が parser で拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parser は spec 宣言由来で型検証し、複合 positional の domain を狭めない > Scenario: --issue の非整数が parser で拒否される

### TC-021: --issue の正整数が数値として受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parser は spec 宣言由来で型検証し、複合 positional の domain を狭めない > Scenario: --issue の正整数が数値として受理される

### TC-022: request validate が file 入力を slug 検証で狭めない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: parser は spec 宣言由来で型検証し、複合 positional の domain を狭めない > Scenario: request validate が file 入力を slug 検証で狭めない

---

## dispatch 単一 flow — SpecRunnerError 正規化

### TC-023: subcommand 経路の SpecRunnerError が Error/Hint/exitCode で表示される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dispatch は単一 flow に統一され SpecRunnerError を両経路で正規化する > Scenario: subcommand 経路の SpecRunnerError が Error/Hint/exitCode で表示される

### TC-024: 未知コマンド / 未知サブコマンドの文言が保存される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dispatch は単一 flow に統一され SpecRunnerError を両経路で正規化する > Scenario: 未知コマンド / 未知サブコマンドの文言が保存される

---

## hint / guide 実在検査 — 列挙 API 移行

### TC-025: alias を参照する hint が実在扱いされる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: hint / guide の実在検査は spec 由来の列挙 API を使う > Scenario: alias を参照する hint が実在扱いされる

### TC-026: 存在しないコマンドを参照する hint が検出される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: hint / guide の実在検査は spec 由来の列挙 API を使う > Scenario: 存在しないコマンドを参照する hint が検出される

---

## --merge-wait-ms lenient 契約保存

### TC-027: --merge-wait-ms 不正値が lenient に無視される

**Category**: integration
**Priority**: must
**Source**: design.md > D2: 型検証は parser 層。ただし「既存契約と等価に表現可能な値」に限る

**GIVEN** `job wait` コマンド（または `job resume`）を実行し、`--merge-wait-ms abc`（非数値文字列）を渡す
**WHEN** dispatch が parseFlags を実行する
**THEN** `FlagParseError` は投げられず exit 2 にならない。コマンドは続行し、lenient domain parse が不正値を無視するか既定値にフォールバックする

---

## --limit 型検証

### TC-028: --limit 非整数が parser 層で exit 2 になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: flag-parser を spec 型宣言由来の検証に拡張する

**GIVEN** `--limit` が `integer(min 0)` として FlagSpec に宣言される
**WHEN** `--limit abc` を parseFlags で解析する
**THEN** `FlagParseError` が投げられ、dispatch が exit 2（ARG_ERROR）で終了する

### TC-029: --limit 非負整数が数値として handler に渡る

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: flag-parser を spec 型宣言由来の検証に拡張する

**GIVEN** 同じ FlagSpec
**WHEN** `--limit 0` および `--limit 5` を parseFlags で解析する
**THEN** `ParsedArgs.flags["limit"]` が `typeof number` であり、それぞれ `0` / `5` として格納される（handler 内再検証なし）

---

## FlagParseError の dispatch 表示

### TC-030: FlagParseError が dispatch で error message + exit 2

**Category**: integration
**Priority**: must
**Source**: design.md > D6: dispatch を単一 flow に統一し、SpecRunnerError を両経路で正規化 / tasks.md > T-04 AC

**GIVEN** integer FlagSpec を持つコマンド（例 `run --issue abc`）
**WHEN** dispatch が parseFlags を呼び FlagParseError を捕捉する
**THEN** stderr にエラーメッセージと該当コマンドの usage が出力され、exit code 2 で終了する（subcommand 経路・normal 経路とも同一フォーマット）

---

## doctor repair — slug なし時の案内

### TC-031: doctor repair slug なしが exit 2 で usage を案内する

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 AC（`doctor repair`(無 slug) が exit 2 で `specrunner doctor repair` を案内）

**GIVEN** `doctor repair` が child spec（slug 必須 positional）として実装されている
**WHEN** `specrunner doctor repair`（slug 引数なし）を実行する
**THEN** `Usage: specrunner doctor repair <slug>` に相当する案内を出力し exit 2 で終了する

---

## help pin 文言 — leaf レベル追加確認

### TC-032: job archive help に "Archive the completed change folder" が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: pin 文言リスト（`Archive the completed change folder`）

**GIVEN** `job archive` の `CommandHelp` に `"Archive the completed change folder"` が文言として保持されている
**WHEN** `specrunner job archive --help` の help を生成する
**THEN** 出力に `Archive the completed change folder` が含まれる

### TC-033: runtime reset help に "Delete the Anthropic Environment" が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06: pin 文言リスト（`Delete the Anthropic Environment`）

**GIVEN** `runtime reset` の `CommandHelp` に `"Delete the Anthropic Environment"` が文言として保持されている
**WHEN** `specrunner runtime reset --help` の help を生成する
**THEN** 出力に `Delete the Anthropic Environment` が含まれる

---

## hint 実在検査 — 既存 hint セットの通過確認

### TC-034: STATUS_HINTS / PROVIDER_READINESS_HINTS / doctor hints が実在検査を通過する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 AC（既存の hint 参照検査が green）

**GIVEN** `hint-command-references.test.ts` が `listCommandPaths({ includeAliases: true })` を正本とし、`STATUS_HINTS` / `PROVIDER_READINESS_HINTS` / doctor hints / local-state-writable hint の実在検査を行う
**WHEN** 列挙 API で各 hint が参照するコマンドを検査する
**THEN** 全て実在扱いされ violations が出ない（破壊確認: 架空コマンド `specrunner frobnicate` は未登録として検出される）

---

## 旧構造の削除確認

### TC-035: worktree guard 手書き Set がコードベースに不在

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 AC / T-09 AC（`WORKTREE_GUARDED_COMMANDS` / `guardedSubcommands` の削除）

**GIVEN** リファクタリング完了後のコードベース
**WHEN** `bin/specrunner.ts` と `src/cli/command-registry.ts` を静的検査する
**THEN** `WORKTREE_GUARDED_COMMANDS`（bin の手書き Set）と `guardedSubcommands`（registry の parent 単位 Set）がいずれも存在しない

### TC-036: repo-required コマンドの requiresRepo が移行後も true

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 AC（全 public command の repo requirement が移行前と意味的に同一）

**GIVEN** 移行後の CommandSpec registry
**WHEN** `init` / `request new` / `job cancel` / `job attach` / `job prune` / `job stats` / `inbox run` の実効 `requiresRepo` を解決する
**THEN** 全て `true` である（`doctor` は `false`、`doctor repair` は `true` の override、`job start` / `job ls` / `job show` / `job wait` は `false` で TC-012 が固定する）

### TC-037: 旧 CommandDef / ParentCommandDef / CommandEntry 型がコードベースから削除されている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09 AC（旧 2 階層固定型の削除）

**GIVEN** リファクタリング完了後のコードベース
**WHEN** `src/cli/command-registry.ts` を静的検査する
**THEN** `CommandDef` / `ParentCommandDef` / `CommandEntry` の型定義が存在せず、互換 shim として再 export もされていない

---

## Gate

### TC-038: CWD allowlist / B-18 import 境界が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09 AC / design.md > Context（B-18 / CWD allowlist ratchet）

verification: `bun test tests/unit/architecture/core-invariants.test.ts` および `bun test tests/unit/architecture/request-entrance-llm-boundary.test.ts` が green。TC-010（converted 3 site は allowlist に足さない）が絶対 false のまま。

### TC-039: typecheck && test が全て green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-01 / T-02 / T-03 / T-04 / T-08 / T-09 AC（`typecheck && test` が green）

verification: `bun tsc --noEmit && bun test` が全て green。既存の behavioral / output contract テスト（`removed-commands` / `specrunner-worktree-guard` / `help-flag-dispatch` / `doctor-cli` / `attach-cli` 等）が無改変で green。

---

## Result

```yaml
result: completed
total: 39
automated: 37
manual: 0
must: 35
should: 4
could: 0
blocked_reasons: []
```
