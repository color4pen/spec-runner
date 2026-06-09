# Test Cases: --help フラグが positional 必須チェックより先に評価されるようにする

## Summary

- **Total**: 18 cases
- **Automated** (unit/integration): 18
- **Manual**: 0
- **Priority**: must: 11, should: 6, could: 1

---

## Flag Parser — help reservation

### TC-001: --help は flagDefs に help 定義がなくても受理される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parser SHALL reserve --help / -h as a common flag > Scenario: --help is accepted without a help flag definition

---

### TC-002: -h が help にマッピングされる（既存挙動の維持）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parser SHALL reserve --help / -h as a common flag > Scenario: -h maps to help (existing behavior preserved)

---

### TC-003: --help=value 形式でも help が立つ

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: parser SHALL reserve --help / -h as a common flag > Scenario: --help with a value part still sets help

---

### TC-004: -h とともに required positional が欠如していても throw しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** `positionalDef` が `{ name: "slug", required: true }` で `flagDefs` に `help` が未定義
**WHEN** `parseFlags(["-h"], {}, { name: "slug", required: true })` を呼ぶ
**THEN** throw されず、戻り値の `flags["help"]` が `true` になる

---

## Flag Parser — positional check skip

### TC-005: --help 付きで required positional が欠如しても throw しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parser SHALL skip the required positional check when help is requested > Scenario: required positional missing but --help given

---

### TC-006: --help なしで required positional が欠如すると FlagParseError（regression guard）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: parser SHALL skip the required positional check when help is requested > Scenario: required positional missing and no help (regression guard)

---

### TC-007: --help=value 形式でも required positional チェックをスキップする

**Category**: unit
**Priority**: could
**Source**: design.md > D2: help 時に required positional チェックをスキップ

**GIVEN** `positionalDef` が `{ name: "slug", required: true }` で `flagDefs` に `help` が未定義
**WHEN** `parseFlags(["--help=anything"], {}, { name: "slug", required: true })` を呼ぶ
**THEN** throw されず、戻り値の `flags["help"]` が `true` になる

---

## Dispatch — subcommand path

### TC-008: job archive --help が exit 0 と ARCHIVE_USAGE を出力する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dispatch SHALL emit usage and exit 0 when help is requested > Scenario: subcommand with usage field shows its usage

---

### TC-009: job resume --help が exit 0 と汎用 fallback を出力する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dispatch SHALL emit usage and exit 0 when help is requested > Scenario: subcommand without usage field shows generic fallback

---

### TC-010: request review --help が slug なしで exit 0 になる（エラーにならない）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dispatch SHALL emit usage and exit 0 when help is requested > Scenario: required-positional subcommand shows help without a slug

---

### TC-011: job resume を slug なし・--help なしで実行すると exit 2 になる（regression guard）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: dispatch SHALL emit usage and exit 0 when help is requested > Scenario: no help and no slug still errors

---

### TC-012: job archive -h（短縮形）が exit 0 と ARCHIVE_USAGE を出力する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `detectWorktree` を `{ isWorktree: false }` に mock し、`process.exit` を throw に置換、stdout を spy した状態
**WHEN** `specrunner job archive -h` を実行する
**THEN** exit 0 で終了し、stdout に `ARCHIVE_USAGE` 由来の文字列を含む

---

### TC-013: job resume --help 時に runResume が呼ばれない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `runResume` を spy しており、`detectWorktree` を `{ isWorktree: false }` に mock した状態
**WHEN** `specrunner job resume --help` を実行する
**THEN** exit 0 で終了し、`runResume` が一度も呼ばれていない

---

## Dispatch — normal command path

### TC-014: specrunner run --help が exit 0 になる（normal 経路）

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `runRun` を spy しており、`detectWorktree` を `{ isWorktree: false }` に mock した状態
**WHEN** `specrunner run --help` を実行する
**THEN** exit 0 で終了し、stdout に usage または fallback メッセージを含む

---

### TC-015: specrunner run --help 時に runRun が呼ばれない

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `runRun` を spy しており、`detectWorktree` を `{ isWorktree: false }` に mock した状態
**WHEN** `specrunner run --help` を実行する
**THEN** `runRun` が一度も呼ばれていない

---

## Backward compatibility — archive / runtime reset

### TC-016: runtime reset --help が RUNTIME_RESET_USAGE を出力する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: individual --help handling in archive / runtime reset SHALL be removed and remain backward compatible > Scenario: runtime reset --help still shows RUNTIME_RESET_USAGE

---

### TC-017: runtime reset --force が個別 help 分岐除去後も正常にリセットを実行する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: individual --help handling in archive / runtime reset SHALL be removed and remain backward compatible > Scenario: runtime reset --force still resets (no regression)

---

### TC-018: job archive subDef から help フラグ定義が除去されている

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: individual --help handling in archive / runtime reset SHALL be removed and remain backward compatible > Scenario: archive subDef no longer declares a help flag

---

## Result

```yaml
result: completed
total: 18
automated: 18
manual: 0
must: 11
should: 6
could: 1
blocked_reasons: []
```
