# PR #248 followup の dead code 削除と test 品質改善

## Meta

- **type**: bug-fix
- **slug**: pr248-followup-cleanup
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

PR #248 (github-credential-env-separation) の code-review iter 2 で MINOR / NIT として残された 2 件 (issue #249, #250) を統合的に片付ける。性質はいずれも「機能影響なし、code/test の整理」で、ファイルも近いため 1 request に束ねる方が PR review コストに見合う。

関連 issue:
- https://github.com/color4pen/spec-runner/issues/249
- https://github.com/color4pen/spec-runner/issues/250

## 目的

PR #248 の後始末を完了し、参照のない symbol と読者を誤解させる test description / コメントを除去する。

## 要件

### A. dead code / unsafe default の除去 (#249)

1. `src/core/gh/pr.ts:34` の `runGhPrCreate` を **削除**する。production caller がゼロ（finish orchestrator は `spawnCommand` を直接呼ぶ）であり、test 経路でしか走らない実装を残すと future reader が混乱する。
2. `src/core/runtime/factory.ts:34` と `src/core/runtime/managed.ts:34` の `githubToken: string = ""` default を **削除**し required parameter にする。functional 変化なし、`LocalRuntime` 側で必要なら `""` を explicit に渡す。compile-time safety が上がり、managed runtime に token なしで session を作る silent fail を防ぐ。

### B. test description / コメントの精度向上 (#250)

1. `tests/unit/config/runtime-config.test.ts:344` の `TC-041` description を、新挙動 (`checkConfigComplete` は `null` unconditional 返却) に合わせて書き換える。例: `"TC-041: checkConfigComplete always returns null (GitHub token check moved to runPreflight)"`.
2. `tests/core/credentials/github.test.ts:77-85` の `TC-CRED-004` に `fs.stat(credPath)` で **mode が 0o600 であることを assert** する 1 行を追加する。
3. `src/core/credentials/github.ts:58-60` の `loadCredentials` の catch block 内 `// Malformed JSON — treat as empty` コメントを、`resolveGitHubToken` 経由で user-facing error を出す意図に置き換える（test-cases.md TC-05 の "throw" 期待との divergence を明示）。

## スコープ外

- `resolveGitHubToken` の `source` field 利活用は別 request (`github-token-source-visibility`) で扱う。
- credentials.json の暗号化 / OS keychain 連携。

## 受け入れ基準

- [ ] `runGhPrCreate` symbol が `src/core/gh/pr.ts` から消えており、`grep -r "runGhPrCreate" src/ tests/` で 0 hit
- [ ] `createRuntime` / `ManagedRuntime` の signature から `githubToken` の default 値が消えている
- [ ] `tests/unit/config/runtime-config.test.ts:344` の TC-041 description が新挙動を語っている
- [ ] `tests/core/credentials/github.test.ts` の TC-CRED-004 が `0o600` mode を assert している
- [ ] `src/core/credentials/github.ts` の `loadCredentials` catch block コメントが intent を説明している
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
