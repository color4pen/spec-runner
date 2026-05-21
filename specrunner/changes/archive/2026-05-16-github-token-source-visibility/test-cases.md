# Test Cases: github-token-source-visibility

## TC-01: runPreflight — credentials 経由で githubTokenSource が伝搬される

- **Category**: Unit / preflight
- **Priority**: must
- **Source**: T-01, 受け入れ基準 (a)

```
GIVEN resolveGitHubToken が { token: "ghp_test", source: "credentials" } を返す
WHEN  runPreflight を実行する
THEN  PreflightResult.githubTokenSource === "credentials"
```

---

## TC-02: runPreflight — env 経由で githubTokenSource が伝搬される

- **Category**: Unit / preflight
- **Priority**: must
- **Source**: T-01, 受け入れ基準 (b)

```
GIVEN resolveGitHubToken が { token: "ghp_test", source: "env" } を返す
WHEN  runPreflight を実行する
THEN  PreflightResult.githubTokenSource === "env"
```

---

## TC-03: runPreflight — info ログに token source が出力される (credentials)

- **Category**: Unit / preflight
- **Priority**: must
- **Source**: T-01-c, 受け入れ基準 (d)

```
GIVEN resolveGitHubToken が { token: "ghp_test", source: "credentials" } を返す
  AND logInfo が vi.mock でスパイされている
WHEN  runPreflight を実行する
THEN  logInfo が "GitHub token source: credentials" を含む引数で呼ばれている
```

---

## TC-04: runPreflight — info ログに token source が出力される (env)

- **Category**: Unit / preflight
- **Priority**: must
- **Source**: T-01-c, 受け入れ基準 (d)

```
GIVEN resolveGitHubToken が { token: "ghp_test", source: "env" } を返す
  AND logInfo が vi.mock でスパイされている
WHEN  runPreflight を実行する
THEN  logInfo が "GitHub token source: env" を含む引数で呼ばれている
```

---

## TC-05: github-token-present check — credentials のとき pass message に source が含まれる

- **Category**: Unit / doctor check
- **Priority**: must
- **Source**: T-04, T-05-b, 受け入れ基準 (c)

```
GIVEN DoctorContext に resolvedGitHubToken: "ghp_test", githubTokenSource: "credentials" が設定されている
WHEN  github-token-present check を実行する
THEN  result.status === "pass"
  AND result.message に "(source: credentials)" が含まれる
```

---

## TC-06: github-token-present check — env のとき pass message に source が含まれる

- **Category**: Unit / doctor check
- **Priority**: must
- **Source**: T-04, T-05-b, 受け入れ基準 (c)

```
GIVEN DoctorContext に resolvedGitHubToken: "ghp_test", githubTokenSource: "env" が設定されている
WHEN  github-token-present check を実行する
THEN  result.status === "pass"
  AND result.message に "(source: env)" が含まれる
```

---

## TC-07: github-token-present check — token なしのとき fail になる (回帰)

- **Category**: Unit / doctor check
- **Priority**: must
- **Source**: T-04 (防御的処理確認)

```
GIVEN DoctorContext に resolvedGitHubToken: null, githubTokenSource: null が設定されている
WHEN  github-token-present check を実行する
THEN  result.status === "fail"
  AND result.message に "(source:" が含まれない
```

---

## TC-08: github-token-present check — githubTokenSource が null でも pass になる (防御)

- **Category**: Unit / doctor check
- **Priority**: should
- **Source**: T-04 (null 防御分岐)

```
GIVEN DoctorContext に resolvedGitHubToken: "ghp_test", githubTokenSource: null が設定されている
WHEN  github-token-present check を実行する
THEN  result.status === "pass"
  AND result.message === "GitHub token is available"  (source ラベルなし)
```

---

## TC-09: DoctorContext — token 解決成功時に githubTokenSource が設定される

- **Category**: Unit / doctor.ts integration
- **Priority**: must
- **Source**: T-02, T-03, 受け入れ基準

```
GIVEN resolveGitHubToken が { token: "ghp_test", source: "credentials" } を返す
WHEN  doctor.ts の pre-resolve ブロックを実行する
THEN  DoctorContext.githubTokenSource === "credentials"
  AND DoctorContext.resolvedGitHubToken === "ghp_test"
```

---

## TC-10: DoctorContext — token 解決失敗時に githubTokenSource が null になる

- **Category**: Unit / doctor.ts integration
- **Priority**: must
- **Source**: T-02, T-03

```
GIVEN resolveGitHubToken が例外を throw する
WHEN  doctor.ts の pre-resolve ブロックを実行する
THEN  DoctorContext.githubTokenSource === null
  AND DoctorContext.resolvedGitHubToken === null
```

---

## TC-11: PreflightResult 型 — githubTokenSource が non-optional field として存在する

- **Category**: Type / static
- **Priority**: must
- **Source**: T-01-a

```
GIVEN PreflightResult interface の定義
WHEN  TypeScript の型チェックを行う
THEN  githubTokenSource: "credentials" | "env" が必須 field として存在する
  AND githubTokenSource を省略した object は型エラーになる
```

---

## TC-12: DoctorContext 型 — githubTokenSource が null 許容 field として存在する

- **Category**: Type / static
- **Priority**: must
- **Source**: T-02

```
GIVEN DoctorContext interface の定義
WHEN  TypeScript の型チェックを行う
THEN  githubTokenSource: "credentials" | "env" | null が field として存在する
  AND null を代入できる
```

---

## TC-13: buildMockContext — デフォルトで githubTokenSource が設定されている

- **Category**: Unit / test helper
- **Priority**: should
- **Source**: T-05-a

```
GIVEN buildMockContext をオーバーライドなしで呼び出す
WHEN  返値の githubTokenSource を参照する
THEN  "credentials" が返る  (resolvedGitHubToken デフォルト値 "ghp_test123" と整合)
```

---

## TC-14: github-token-valid check — pass message に source が含まれない (回帰)

- **Category**: Unit / doctor check
- **Priority**: should
- **Source**: design.md (変更しないファイル確認)

```
GIVEN github-token-valid check に有効なトークンが渡される
WHEN  check を実行する
THEN  result.status === "pass"
  AND result.message に "(source:" が含まれない  (責務分離の確認)
```

---

## TC-15: bun run typecheck && bun run test が green

- **Category**: Build / CI
- **Priority**: must
- **Source**: 受け入れ基準

```
GIVEN 全変更ファイルが実装済みの状態
WHEN  bun run typecheck && bun run test を実行する
THEN  型エラーがゼロ
  AND テストが全件 pass
```
