# Tasks: managed-key-present-rename

## Task 1: Rename source files via git mv

```
git mv src/core/doctor/checks/config/anthropic-key-present.ts src/core/doctor/checks/config/managed-key-present.ts
git mv src/core/doctor/checks/auth/anthropic-key-valid.ts src/core/doctor/checks/auth/managed-key-valid.ts
```

- [x] Done

## Task 2: Rename symbol in `managed-key-present.ts`

- `anthropicKeyPresentCheck` → `managedKeyPresentCheck`

- [x] Done

## Task 3: Rename symbol in `managed-key-valid.ts`

- `anthropicKeyValidCheck` → `managedKeyValidCheck`

- [x] Done

## Task 4: Update `src/core/doctor/checks/index.ts`

- Import path: `./config/anthropic-key-present.js` → `./config/managed-key-present.js`
- Import path: `./auth/anthropic-key-valid.js` → `./auth/managed-key-valid.js`
- Symbol: `anthropicKeyPresentCheck` → `managedKeyPresentCheck` (import, array usage, re-export)
- Symbol: `anthropicKeyValidCheck` → `managedKeyValidCheck` (import, array usage, re-export)

- [x] Done

## Task 5: Rename test files via git mv

```
git mv tests/core/doctor/checks/config/anthropic-key-present.test.ts tests/core/doctor/checks/config/managed-key-present.test.ts
git mv tests/core/doctor/checks/auth/anthropic-key-valid.test.ts tests/core/doctor/checks/auth/managed-key-valid.test.ts
```

- [x] Done

## Task 6: Update renamed test file `managed-key-present.test.ts`

- Import path: `anthropic-key-present.js` → `managed-key-present.js`
- Symbol: `anthropicKeyPresentCheck` → `managedKeyPresentCheck`
- describe string: `"anthropicKeyPresentCheck (managed/api-key-present)"` → `"managedKeyPresentCheck (managed/api-key-present)"`

- [x] Done

## Task 7: Update renamed test file `managed-key-valid.test.ts`

- Import path: `anthropic-key-valid.js` → `managed-key-valid.js`
- Symbol: `anthropicKeyValidCheck` → `managedKeyValidCheck`
- describe string: `"anthropicKeyValidCheck (managed/api-key-valid)"` → `"managedKeyValidCheck (managed/api-key-valid)"`

- [x] Done

## Task 8: Update `tests/unit/remove-session-timeout.test.ts`

- L188: it description `"anthropic-key-valid.ts に..."` → `"managed-key-valid.ts に..."`
- L191: path string `"../../src/core/doctor/checks/auth/anthropic-key-valid.ts"` → `"../../src/core/doctor/checks/auth/managed-key-valid.ts"`

- [x] Done

## Task 9: Verify

```
bun run typecheck && bun run test
```

Confirm: `grep -rn "anthropicKeyPresentCheck\|anthropicKeyValidCheck\|anthropic-key-present\|anthropic-key-valid" src/ tests/` returns 0 hits.

- [x] Done — 162 test files / 1924 tests passed, grep returned 0 hits
