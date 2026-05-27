# Design: CLI exit code standardization

## 概要

全 CLI コマンドの exit code を 0/1/2 に統一し、`SpecRunnerError` からの exit code 導出を宣言的に行う。

## 現状分析

### exit code が既に 0/1/2 で設計されているコマンド

- `finish` — `FinishResult` 型で `exitCode: 0 | 1 | 2` を明示
- `cancel` — `exitCode: 0 | 1` + 引数エラーで `return 2`
- `resume` — `PrepareError(exitCode: 1 | 2)` で制御
- `request new` — `return 2` (slug validation), `return 1`, `return 0`
- `doctor` — exit 0/1、crash は `command-registry.ts` 側で exit 2

### exit code が不統一なコマンド

| コマンド | 問題 |
|---|---|
| `init` | `process.exit(1)` で引数エラー（`--runtime` 非推奨）を返しているが、これは exit 2 であるべき |
| `login` | `github-device.ts` 内で `process.exit(1)` を直接呼ぶ（expired/denied）。exit code は 1 で妥当だがハンドラ外で直接 exit している |
| `run` | `runRunCore` は 0/1 のみ返す。引数エラー（slug not found 等）も exit 1 |
| `job ls` / `ps` | `process.exit()` なし。void を返す（暗黙の exit 0）|
| `job show` | handler 内で `process.exit(1)` を直接呼ぶ |
| `managed setup/status/reset` | handler 内で `process.exit(1)` を直接呼ぶ |
| `request validate` | 0/1 のみ（引数エラーの区別は `command-registry.ts` 側で exit 2）|
| `request review` | 0/1 のみ（引数エラーの区別は `command-registry.ts` 側で exit 2）|
| `command-registry.ts` | 引数バリデーション（slug regex）を handler 内で exit 2 するケースと、`bin/specrunner.ts` の `FlagParseError` catch で exit 2 するケースが混在 |

## 設計

### D1: `ExitCode` 型と定数

```typescript
// src/errors.ts に追加
export const EXIT_CODE = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  ARG_ERROR: 2,
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];
```

名前付き定数にすることでマジックナンバーを排除し、意図を明示する。

### D2: `SpecRunnerError` への `exitCode` プロパティ追加

`SpecRunnerError` に `exitCode` フィールドを追加し、エラーコード → exit code のマッピングを宣言的に定義する。

```typescript
export class SpecRunnerError extends Error {
  public readonly exitCode: ExitCode;

  constructor(
    public readonly code: string,
    public readonly hint: string,
    message: string,
    exitCode?: ExitCode,
  ) {
    super(message);
    this.name = "SpecRunnerError";
    this.exitCode = exitCode ?? EXIT_CODE_MAP[code as ErrorCode] ?? EXIT_CODE.GENERAL_ERROR;
  }
}
```

### D3: `EXIT_CODE_MAP` — エラーコード → exit code の宣言的マッピング

```typescript
// src/errors.ts に追加
const EXIT_CODE_MAP: Record<string, ExitCode> = {
  // 引数エラー → exit 2
  CONFIG_MISSING: EXIT_CODE.ARG_ERROR,        // 前提条件不足
  CONFIG_INCOMPLETE: EXIT_CODE.ARG_ERROR,     // 前提条件不足
  CONFIG_INVALID: EXIT_CODE.ARG_ERROR,        // 設定ファイル不正
  REQUEST_MD_INVALID: EXIT_CODE.ARG_ERROR,    // 入力ファイル不正
  NOT_GIT_REPO: EXIT_CODE.ARG_ERROR,          // 前提条件不足
  REMOTE_NOT_GITHUB: EXIT_CODE.ARG_ERROR,     // 前提条件不足
  WORKTREE_GUARD: EXIT_CODE.ARG_ERROR,        // 実行コンテキスト不正

  // 一般エラー → exit 1 (デフォルト)
  // 明示的にリストする必要はないが、可読性のために列挙
};
```

**設計判断**: `CONFIG_MISSING` / `CONFIG_INCOMPLETE` / `NOT_GIT_REPO` / `REMOTE_NOT_GITHUB` を exit 2 に分類する。これらは「コマンドを実行するための前提条件が整っていない」= ユーザーの環境設定不足であり、引数エラーの広義の定義（BSD sysexits の EX_USAGE に相当）に該当する。

**代替案（不採用）**: `CONFIG_MISSING` 等を exit 1 のままにする案。しかし「`specrunner init` を先に実行してください」は本質的に setup error であり、pipeline halt と区別すべき。

### D4: handler 内の `process.exit()` 直接呼び出しの排除

**方針**: handler は `Promise<number>` (exit code) を返し、`command-registry.ts` の handler ラッパーまたは `bin/specrunner.ts` が `process.exit()` を呼ぶ。

影響範囲:
- `init.ts` — `runInit()` を `Promise<number>` に変更
- `login.ts` — `runLogin()` を `Promise<number>` に変更
- `job-show.ts` — `runJobShow()` を `Promise<number>` に変更
- `managed.ts` — `runManagedSetup/Status/Reset()` を `Promise<number>` に変更
- `ps.ts` — `runPs()` を `Promise<number>` に変更（現状 void、暗黙 exit 0）
- `github-device.ts` — `process.exit(1)` をエラー throw に変更

### D5: `command-registry.ts` の整理方針

- 引数バリデーション（slug regex チェック等）は handler 内に残すが、`process.exit(2)` ではなく `return 2` を使う（handler が `Promise<number>` を返す前提）
- handler wrapper で `process.exit(returnValue)` を統一的に呼ぶ
- handler 内の try-catch で `SpecRunnerError` を捕捉し、`err.exitCode` を返すパターンを標準化
- slug 解決失敗（ファイルも slug も存在しない）は exit 1 のまま維持する。引数フォーマット自体は正しく、存在しないリソースへの参照は runtime error 扱い。`request validate` / `request review` との一貫性も保つ

### D6: `bin/specrunner.ts` の catch ハンドラ改善

現在:
```typescript
if (e instanceof SpecRunnerError) {
  process.exit(1);
}
```

変更後:
```typescript
if (e instanceof SpecRunnerError) {
  process.exit(e.exitCode);
}
```

これにより、`SpecRunnerError` が throw された場合は宣言的マッピングに基づく exit code が自動的に使われる。

## 変更しないもの

- `process.exit(130)` (SIGINT handler) — シグナル規約として対象外
- `FinishResult` / `CancelResult` 型の `exitCode` フィールド — 既に 0/1/2 で正しく設計されている。`SpecRunnerError.exitCode` は throw 経路のフォールバックであり、結果型を持つコマンドはそちらが優先される
- `FlagParseError` → exit 2 の経路 — `bin/specrunner.ts` で既に正しくハンドルされている
