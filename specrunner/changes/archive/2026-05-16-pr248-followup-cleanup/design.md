# Design: pr248-followup-cleanup

## Overview

PR #248 の code-review iter 2 で MINOR/NIT として残された dead code と test 品質の 2 件（#249, #250）を一括で片付ける。機能変更なし。

## Changes

### A. Dead code / unsafe default の除去

#### A-1. `src/core/gh/pr.ts` ファイル削除

`runGhPrCreate` / `GhPrCreateInput` / `GhPrCreateResult` はすべて production caller がゼロ。ファイルを import するモジュールも存在しない（`grep "from.*core/gh/pr"` で 0 hit）。ファイルごと削除する。

#### A-2. `createRuntime` の `githubToken` default 除去

`src/core/runtime/factory.ts:34` の `githubToken: string = ""` を `githubToken: string` に変更する。

呼び出し元:
- `src/cli/run.ts:50` — `resolveGitHubToken()` の結果を明示的に渡している
- `src/cli/bootstrap.ts:40` — 同上

テスト呼び出し元（`tests/unit/core/runtime/factory.test.ts`）:
- TC-RT-001 (line 48): `createRuntime(config, "/repo", githubClient, repo)` — `githubToken` を渡していない。`""` を追加する。
- TC-RT-002 (line 60): 同上（`sessionClient` は渡すが `githubToken` なし）。`""` を追加する。
- TC-RT-003 (line 72): 同上。`""` を追加する。

#### A-3. `ManagedRuntime` constructor の `githubToken` default 除去

`src/core/runtime/managed.ts:34` の `private readonly githubToken: string = ""` を `private readonly githubToken: string` に変更する。

呼び出し元:
- `src/core/runtime/factory.ts:44` — `githubToken` を明示的に渡している（A-2 で required になった値をそのまま転送）

テスト呼び出し元（`tests/unit/core/runtime/managed.test.ts`）:
- 5 箇所 (lines 53, 67, 80, 97, 114): いずれも `githubToken` を渡していない。第 6 引数に `""` を追加する。

### B. Test description / コメントの精度向上

#### B-1. TC-041 description 更新

`tests/unit/config/runtime-config.test.ts:344` の describe テキストを、`checkConfigComplete` が `null` を unconditional に返す現挙動を反映した記述に変更する。

#### B-2. TC-CRED-004 に mode assert 追加

`tests/core/credentials/github.test.ts:78` の TC-CRED-004 テスト内で `saveCredentials` 呼び出し後に `fs.stat(credPath())` で file mode を取得し、`mode & 0o777` が `0o600` であることを assert する 1 行を追加する。

#### B-3. `loadCredentials` catch block コメント修正

`src/core/credentials/github.ts:58-60` の `// Malformed JSON — treat as empty` コメントを、`resolveGitHubToken` 経由で呼ばれた場合は空 credentials 返却により次の priority に fallback する（env → throw）という意図を説明する記述に書き換える。

## 影響範囲

| ファイル | 変更種別 | 影響 |
|---------|---------|------|
| `src/core/gh/pr.ts` | 削除 | 0 caller、0 importer |
| `src/core/runtime/factory.ts` | signature 変更 | caller 2 箇所は既に explicit |
| `src/core/runtime/managed.ts` | signature 変更 | factory 経由のみ |
| `tests/unit/core/runtime/factory.test.ts` | 引数追加 | compile fix |
| `tests/unit/core/runtime/managed.test.ts` | 引数追加 | compile fix |
| `tests/unit/config/runtime-config.test.ts` | description text | 動作変更なし |
| `tests/core/credentials/github.test.ts` | assert 追加 | TC-CRED-004 強化 |
| `src/core/credentials/github.ts` | コメント変更 | 動作変更なし |

## Risk

- 機能変更なし。signature 変更は compile-time で捕捉可能。
- ファイル削除は importer 0 を確認済み。
