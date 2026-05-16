# Design: managed-key-present-rename

## Overview

`anthropic-key-present` / `anthropic-key-valid` のファイル名・export 名を `managed-key-present` / `managed-key-valid` に rename する純粋リファクタリング。

## Approach

git mv + symbol rename + import path 更新。挙動変更なし。

## Affected Files

| Action | Path |
|--------|------|
| rename | `src/core/doctor/checks/config/anthropic-key-present.ts` → `managed-key-present.ts` |
| rename | `src/core/doctor/checks/auth/anthropic-key-valid.ts` → `managed-key-valid.ts` |
| rename | `tests/core/doctor/checks/config/anthropic-key-present.test.ts` → `managed-key-present.test.ts` |
| rename | `tests/core/doctor/checks/auth/anthropic-key-valid.test.ts` → `managed-key-valid.test.ts` |
| edit | `src/core/doctor/checks/index.ts` — import path + symbol name |
| edit | renamed test files — import path + describe string + symbol references |
| edit | `tests/unit/remove-session-timeout.test.ts` — path string + it description |

## Constraints

- `check.name` フィールド (`"managed/api-key-present"`, `"managed/api-key-valid"`) は変更しない (spec contract)
- 他 request (`credentials-provider-parity`) 内の path 参照は触らない (scope 外)

## Risks

なし。純粋な命名変更であり型チェック・テストで完全検証可能。
