# Spec Review Result: pr248-followup-cleanup

- **reviewer**: spec-reviewer
- **date**: 2026-05-16
- **verdict**: approved

## Summary

request.md / design.md / tasks.md の 3 ファイルを対象ソースコードと突合検証した。行番号・シンボル名・caller 有無・現行テストの記述すべて正確。scope は PR #248 の後始末に限定されており、機能変更なし。

## Verification

| 項目 | 結果 |
|------|------|
| `src/core/gh/pr.ts` の importer が 0 | `grep` で src/ 内に import 0 hit を確認 |
| `factory.ts:34` の `githubToken: string = ""` | 存在確認。production caller 2 箇所 (`cli/run.ts:50`, `cli/bootstrap.ts:40`) は explicit に渡している |
| `managed.ts:34` の `private readonly githubToken: string = ""` | 存在確認。唯一の caller は `factory.ts:44` で explicit に渡している |
| TC-041 description が outdated | `checkConfigComplete` は `return null` のみ。現 description の "only checks github.accessToken" は誤り |
| TC-CRED-004 に mode assert なし | テストは `loadCredentials` の内容のみ検証、file permission の assert がない |
| `loadCredentials` catch コメント | "treat as empty" — `resolveGitHubToken` の fallback 意図が不明 |

## Findings

### [NIT] Task 3.2: managed.test.ts の 5th 引数 `undefined` が未記載

`tasks.md` Task 3.2 は「第 6 引数に `""` を追加する」とだけ書いているが、5 call sites はいずれも 4 引数しか渡していない。6th に `""` を渡すには 5th の `spawnFn` に `undefined` を明示する必要がある。Task 2.2 ではこの点を「第 5 引数 `undefined` も必要」と正しく記載しているが、3.2 では省略されている。

**影響**: TypeScript compiler が即座にエラーを出すため implementer は自力で修正可能。blocking ではない。

## Security

- `githubToken` default `""` の除去は compile-time safety の向上（empty token での silent fail 防止）
- TC-CRED-004 の `0o600` mode assert 追加は credential file permission 検証の強化
- 認証・入力検証・OWASP 観点の新規リスクなし
