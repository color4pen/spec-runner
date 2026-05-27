# Test Cases: login-scope-verification

## TC-01: repo scope が含まれる場合は warning なし

- **Category**: Unit / Happy Path
- **Priority**: must
- **Source**: T-02 acceptance, request.md 受け入れ基準「既存の login フロー（正常ケース）の動作が変わらないこと」

```
GIVEN runDeviceFlow() が scopes: ["repo"] を返す
WHEN  runLogin() を呼び出す
THEN  logWarn が呼ばれない
AND   saveCredentials が呼ばれる（token が保存される）
AND   exit code が 0
```

---

## TC-02: repo + 追加 scope が含まれる場合は warning なし

- **Category**: Unit / Happy Path
- **Priority**: must
- **Source**: T-02 acceptance

```
GIVEN runDeviceFlow() が scopes: ["repo", "read:org"] を返す
WHEN  runLogin() を呼び出す
THEN  logWarn が呼ばれない
AND   saveCredentials が呼ばれる
AND   exit code が 0
```

---

## TC-03: repo を含まない scope のみの場合は warning あり + token 保存

- **Category**: Unit / Scope Missing
- **Priority**: must
- **Source**: T-02 acceptance, request.md 受け入れ基準「scope 不足時に warning メッセージが表示されること」「token は保存する」

```
GIVEN runDeviceFlow() が scopes: ["read:org"] を返す（repo なし）
WHEN  runLogin() を呼び出す
THEN  logWarn が 1 回呼ばれる
AND   warning メッセージに "repo" scope への言及が含まれる
AND   warning メッセージに "specrunner doctor" への言及が含まれる
AND   saveCredentials が呼ばれる（token は保存される）
AND   exit code が 0
```

---

## TC-04: scope が空配列の場合は warning あり + token 保存

- **Category**: Unit / Scope Missing
- **Priority**: must
- **Source**: T-02 acceptance, request.md 受け入れ基準「scope 不足時に warning」

```
GIVEN runDeviceFlow() が scopes: [] を返す
WHEN  runLogin() を呼び出す
THEN  logWarn が 1 回呼ばれる
AND   saveCredentials が呼ばれる（token は保存される）
AND   exit code が 0
```

---

## TC-05: scope チェックは saveCredentials の前に実行される

- **Category**: Unit / Ordering
- **Priority**: must
- **Source**: T-01 acceptance「scope チェックが saveCredentials の前に実行される」

```
GIVEN runDeviceFlow() が scopes: ["read:org"] を返す（repo なし）
WHEN  runLogin() を呼び出す
THEN  logWarn の呼び出し順序が saveCredentials より前である
```

---

## TC-06: GitHub が scope を返さない場合（fallback）は warning なし

- **Category**: Unit / Fallback
- **Priority**: must
- **Source**: request.md 受け入れ基準「Device Flow の scope fallback（GitHub が scope を返さない場合）でも warning なしで token が保存されること」、design.md D3

```
GIVEN GitHub が scope フィールドを返さない（github-device.ts の fallback により scopes: ["repo"] になる）
WHEN  runLogin() を呼び出す
THEN  logWarn が呼ばれない
AND   saveCredentials が呼ばれる
AND   exit code が 0
```

---

## TC-07: Device Flow 自体が失敗した場合は scope チェックをスキップ

- **Category**: Unit / Error Path
- **Priority**: must
- **Source**: login.ts 既存の catch ブロック、「既存の login フローの動作が変わらないこと」

```
GIVEN runDeviceFlow() が例外をスローする（expired_token / access_denied）
WHEN  runLogin() を呼び出す
THEN  logWarn が呼ばれない
AND   saveCredentials が呼ばれない
AND   exit code が 1
```

---

## TC-08: typecheck が green

- **Category**: Static Analysis
- **Priority**: must
- **Source**: T-01 acceptance「bun run typecheck が green」、T-03 acceptance

```
GIVEN T-01 の実装が完了した状態
WHEN  bun run typecheck を実行する
THEN  型エラーが 0 件
```

---

## TC-09: github-device.ts と doctor/ に変更がない

- **Category**: Regression / Out-of-Scope Guard
- **Priority**: must
- **Source**: T-03 acceptance「src/auth/github-device.ts に変更なし」「src/core/doctor/ に変更なし」

```
GIVEN 実装が完了した状態
WHEN  git diff main -- src/auth/github-device.ts src/core/doctor/ を確認する
THEN  差分が 0 行
```

---

## TC-10: warning メッセージに "repo" および "specrunner doctor" が含まれる（文言検証）

- **Category**: Unit / Message Content
- **Priority**: should
- **Source**: tasks.md T-01 コードスニペット内のメッセージ文言

```
GIVEN runDeviceFlow() が scopes: [] を返す
WHEN  runLogin() を呼び出す
THEN  logWarn に渡された文字列が "repo" を含む
AND   logWarn に渡された文字列が "specrunner doctor" を含む
```
