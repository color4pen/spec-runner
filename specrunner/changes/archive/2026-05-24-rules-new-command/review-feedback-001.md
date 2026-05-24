# Code Review: rules-new-command — Iteration 1

- **verdict**: approved

---

## Summary

実装は設計仕様 (design.md / tasks.md) を正確にカバーしており、全 2747 テストが green。must-priority の受け入れ基準はほぼ網羅されている。1 件の低 severity 指摘あり (動作への影響なし)。

---

## Findings

### [LOW] dead code: slug space-warning の if/else 両 branch が同一

**File**: `src/core/command/rules-new.ts`, lines 62–72

```typescript
if (sanitized.includes(" ")) {
  sanitized = sanitized.replace(/ /g, "-");
  if (!warned) {
    process.stderr.write(
      `Warning: spaces in slug replaced with '-'. Using '${sanitized}'.\n`,
    );
  } else {
    process.stderr.write(
      `Warning: spaces in slug replaced with '-'. Using '${sanitized}'.\n`,
    );
  }
}
```

`if (!warned)` の両 branch の内容が完全に同一。`warned` フラグは `_` 置換時にセットされるが、ここでは分岐の意味がない。動作は正しいが dead code として残っている。

**修正案**:
```typescript
if (sanitized.includes(" ")) {
  sanitized = sanitized.replace(/ /g, "-");
  process.stderr.write(
    `Warning: spaces in slug replaced with '-'. Using '${sanitized}'.\n`,
  );
}
```

---

## Test Coverage Against test-cases.md

| TC | Priority | Covered | Notes |
|---|---|---|---|
| TC-RULES-001 | must | ✅ | rules-new.test.ts TC-RULES-001 |
| TC-RULES-002 | must | ✅ | 既存ファイルあり → 次番号採番 |
| TC-RULES-003 | must | ✅ | max+1 採番 (gap at 02) |
| TC-RULES-004 | must | ✅ | README.md NaN 除外 |
| TC-RULES-005 | must | ✅ | invalid step-name + candidates |
| TC-RULES-006 | must | ✅ | verification/pr-create/delta-spec-validation |
| TC-RULES-007 | must | ✅ | pr-create |
| TC-RULES-008 | must | ✅ | delta-spec-validation |
| TC-RULES-009 | must | ✅ | slug `_` → warning + convert |
| TC-RULES-010 | must | ✅ | slug space → warning + convert |
| TC-RULES-011 | must | ✅ | path traversal / uppercase / leading hyphen |
| TC-RULES-012 | should | ✅ | uppercase (TC-RULES-007 test で網羅) |
| TC-RULES-013 | must | ✅ | slug-level collision → exit 1 |
| TC-RULES-014 | must | ✅ | template 3 sections |
| TC-RULES-015 | must | ✅ | leading comment + CLI 解釈なし / recency bias |
| TC-RULES-016 | must | ✅ | string const, 外部ファイル読み込みなし (静的確認) |
| TC-RULES-017 | must | ⚠️ | `specrunner rules --help` の自動テストなし (bin/ entrypoint は慣例的に非単体テスト対象) |
| TC-RULES-018 | should | ⚠️ | 同上 |
| TC-RULES-019 | should | ⚠️ | 同上 |
| TC-RULES-020 | must | ⚠️ | `specrunner --help` の Rules セクション自動テストなし (USAGE 文字列は静的確認可能) |
| TC-RULES-021 | must | ✅ | typo step-name → candidates 表示 |
| TC-RULES-022 | should | ✅ | 衝突エラーに既存ファイル名 + hint 含む |
| TC-RULES-023 | must | ✅ | flag-parser 1-15 |
| TC-RULES-024 | must | ✅ | positional == positionals[0] 後方互換 |
| TC-RULES-025 | must | ✅ | count:2 で 1 つのみ → FlagParseError |
| TC-RULES-026 | must | ✅ | 既存テスト全 pass (2747 passed) |
| TC-RULES-027 | should | ✅ | subcommands 構造, 将来拡張可能 (静的確認) |
| TC-RULES-028 | must | ✅ | AGENT_STEP_NAMES import, step 名ハードコードなし |
| TC-RULES-029 | must | ✅ | typecheck 0 errors, test 2747 passed |

TC-RULES-017/020 の未自動化は `bin/specrunner.ts` のエントリポイントが慣例的に単体テスト対象外であることによるもので、当コードベースの既存パターンと一致する。該当ロジックは 3 行程度の単純な条件分岐であり、静的確認で代替可能と判断。

---

## Positive Observations

- `AGENT_STEP_NAMES` を single source of truth として使用。ステップ名のハードコードなし (D3 準拠)
- slug sanitize の warn+convert → regex validate の順序が要件 4 の記述通り正確に実装されている
- collision check が slug suffix ベース (`-${sanitized}.md` の末尾一致) で、番号プレフィックスに依存しない設計が堅牢
- `RULE_TEMPLATE` が source code 内 const として保持 (D2 準拠)
- `positionals: string[]` の追加が `positional?: string` の後方互換エイリアスを壊さない形で実装されている
- 全 AGENT_STEP_NAMES を `it.each` で一括検証するカバレッジテストが追加されている
