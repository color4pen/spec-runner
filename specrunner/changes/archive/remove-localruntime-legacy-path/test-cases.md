# Test Cases: remove-localruntime-legacy-path

## Overview

`LocalRuntime` コンストラクタから positional legacy パスを削除し、`LocalRuntimeOptions` のみ受け付けるよう統一するリファクタリングのテストシナリオ。

---

## TC-01: コンストラクタシグネチャが named options のみ受け付ける

- **Category**: constructor-signature
- **Priority**: must
- **Source**: tasks.md / Task 2a, request.md 要件2

```
GIVEN  src/core/runtime/local.ts の LocalRuntime クラスを参照する
WHEN   コンストラクタのシグネチャを確認する
THEN   パラメータが `opts: LocalRuntimeOptions` の単一引数のみである
AND    `cwdOrOpts` という名前のパラメータが存在しない
AND    `string | LocalRuntimeOptions` の union 型が存在しない
AND    optional な `githubClient?`, `manager?`, `spawnFn?`, `queryFn?` パラメータが存在しない
```

---

## TC-02: legacy 分岐が削除されている

- **Category**: constructor-signature
- **Priority**: must
- **Source**: tasks.md / Task 2b

```
GIVEN  src/core/runtime/local.ts のコンストラクタ本体を参照する
WHEN   実装を確認する
THEN   `typeof cwdOrOpts === "string"` の条件分岐が存在しない
AND    `// Legacy positional constructor` コメントが存在しない
```

---

## TC-03: non-null assertion が除去されている

- **Category**: constructor-signature
- **Priority**: must
- **Source**: tasks.md / Task 2b, request.md 要件3

```
GIVEN  src/core/runtime/local.ts を参照する
WHEN   コンストラクタ本体を確認する
THEN   `githubClient!` の non-null assertion が存在しない
AND    `this.githubClient = opts.githubClient` の直接代入になっている
```

---

## TC-04: テストファイルの positional 呼び出し（4-arg）が named options に変換されている

- **Category**: test-migration
- **Priority**: must
- **Source**: tasks.md / Task 1 (4-arg パターン 11 箇所)

```
GIVEN  tests/unit/core/runtime/local.test.ts を参照する
WHEN   LocalRuntime のインスタンス生成箇所（lines 163, 183, 204, 216, 234, 251, 417, 453, 481, 560, 587）を確認する
THEN   いずれも `new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn })` の形式である
AND    `new LocalRuntime(tempDir, githubClient, manager, spawnFn)` の positional 形式が存在しない
```

---

## TC-05: テストファイルの positional 呼び出し（3-arg）が named options に変換されている

- **Category**: test-migration
- **Priority**: must
- **Source**: tasks.md / Task 1 (3-arg パターン 8 箇所)

```
GIVEN  tests/unit/core/runtime/local.test.ts を参照する
WHEN   LocalRuntime のインスタンス生成箇所（lines 266, 290, 309, 327, 352, 371, 392, 433）を確認する
THEN   いずれも `new LocalRuntime({ cwd: tempDir, githubClient, manager })` の形式である
AND    `new LocalRuntime(tempDir, githubClient, manager)` の positional 形式が存在しない
```

---

## TC-06: positional 呼び出しパターンがテストファイルに残存しない

- **Category**: test-migration
- **Priority**: must
- **Source**: tasks.md / Task 1 完了条件

```
GIVEN  tests/unit/core/runtime/local.test.ts を参照する
WHEN   ファイル全体を検索する
THEN   `new LocalRuntime(tempDir,` のパターンが 0 件である
```

---

## TC-07: 比較テストケースが削除されている

- **Category**: test-migration
- **Priority**: must
- **Source**: tasks.md / Task 1 (比較テストの削除)

```
GIVEN  tests/unit/core/runtime/local.test.ts を参照する
WHEN   ファイル全体を確認する
THEN   "named options and positional constructor produce equivalent runtimes" のテストケース（it ブロック）が存在しない
AND    positional 呼び出しと named options を比較するアサーションが存在しない
```

---

## TC-08: 振る舞い保持 — cwd の代入

- **Category**: behavior-preservation
- **Priority**: must
- **Source**: design.md / Target State, request.md 受け入れ基準「振る舞いが変わらない」

```
GIVEN  LocalRuntime を named options `{ cwd: "/tmp/test", githubClient, manager, spawnFn }` でインスタンス化する
WHEN   インスタンスの cwd プロパティを参照する
THEN   `this.cwd === "/tmp/test"` である
```

---

## TC-09: 振る舞い保持 — githubClient の代入

- **Category**: behavior-preservation
- **Priority**: must
- **Source**: design.md / Target State

```
GIVEN  LocalRuntime を named options `{ cwd, githubClient: mockClient, manager, spawnFn }` でインスタンス化する
WHEN   インスタンスの githubClient プロパティを参照する
THEN   `this.githubClient === mockClient` である
```

---

## TC-10: 振る舞い保持 — manager のデフォルト値

- **Category**: behavior-preservation
- **Priority**: must
- **Source**: design.md / Target State (manager ?? createWorktreeManager())

```
GIVEN  LocalRuntime を named options `{ cwd, githubClient }` (manager を省略) でインスタンス化する
WHEN   インスタンスの manager プロパティを参照する
THEN   `createWorktreeManager()` の戻り値が代入されている
```

---

## TC-11: 振る舞い保持 — spawnFn のデフォルト値

- **Category**: behavior-preservation
- **Priority**: should
- **Source**: design.md / Target State (spawnFn ?? spawnCommand)

```
GIVEN  LocalRuntime を named options `{ cwd, githubClient, manager }` (spawnFn を省略) でインスタンス化する
WHEN   インスタンスの spawnFn プロパティを参照する
THEN   `spawnCommand` が代入されている
```

---

## TC-12: 振る舞い保持 — queryFn のデフォルト値

- **Category**: behavior-preservation
- **Priority**: should
- **Source**: design.md / Target State (queryFn ?? sdkQuery)

```
GIVEN  LocalRuntime を named options `{ cwd, githubClient, manager }` (queryFn を省略) でインスタンス化する
WHEN   インスタンスの queryFn プロパティを参照する
THEN   `sdkQuery` が代入されている
```

---

## TC-13: typecheck が pass する

- **Category**: verification
- **Priority**: must
- **Source**: tasks.md / Task 3, request.md 受け入れ基準

```
GIVEN  全変更（TC-01〜TC-07）が適用されている
WHEN   `bun run typecheck` を実行する
THEN   型エラーが 0 件で終了する（exit code 0）
```

---

## TC-14: テストスイートが全 pass する

- **Category**: verification
- **Priority**: must
- **Source**: tasks.md / Task 3, request.md 受け入れ基準

```
GIVEN  全変更（TC-01〜TC-07）が適用されている
WHEN   `bun run test` を実行する
THEN   全テストケースが PASS する（失敗 0 件）
```

---

## TC-15: factory.ts が変更されていない

- **Category**: scope-guard
- **Priority**: should
- **Source**: design.md / 変更対象外

```
GIVEN  src/core/runtime/factory.ts を参照する
WHEN   LocalRuntime のインスタンス生成箇所を確認する
THEN   既に named options 形式 `new LocalRuntime({ ... })` を使用しており、変更が加えられていない
```

---

## TC-16: LocalRuntimeOptions インターフェースが変更されていない

- **Category**: scope-guard
- **Priority**: should
- **Source**: design.md / 変更対象外

```
GIVEN  src/core/runtime/local.ts の LocalRuntimeOptions インターフェース定義を参照する
WHEN   定義を確認する
THEN   インターフェースのフィールド（cwd, githubClient, manager, spawnFn, queryFn）が変更されていない
```
