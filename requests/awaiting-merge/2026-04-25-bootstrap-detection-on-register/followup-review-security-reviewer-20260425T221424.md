# Security Review: 2026-04-25-bootstrap-detection-on-register

**Reviewer**: security-reviewer
**Date**: 2026-04-25
**Phase**: followup (post-merge recommendation from pipeline-context Step 9.5)
**Focus**: GitHub API token handling, SSRF/injection, information disclosure, error handling

## Verdict

- **verdict**: approved
- **security score**: 8 / 10
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | security | src/lib/github-api.ts:264,315 | `getDirectoryContents` と `getFileContent` の `path` パラメータが URL パスセグメントに直接補間されており `encodeURIComponent` されていない。`detectBootstrapStatus` からの呼び出しはハードコード文字列(`'openspec/project.md'`, `'requests/active/'`)のため本変更では問題ないが、`propose-actions.ts` など他の call site ではユーザー由来の値が渡される可能性がある。パス内の `#` や `?` がクエリ文字列を汚染するリスクがある（pre-existing issue） | `path` パラメータの各セグメントを `encodeURIComponent` で個別エンコードするか、`new URL()` で安全に URL を構築する。GitHub Contents API は `/` を含むパスをそのまま受け付けるため、セグメント単位のエンコードが適切 |
| 2 | MEDIUM | security | src/lib/github-api.ts:264,315 | `owner` と `repo` パラメータも URL パスに直接補間されている（全関数共通の pre-existing pattern）。`registerRepository` では `REPO_NAME_PATTERN` で検証済みだが、`github-api.ts` 自体は caller の検証に依存しており、defensive coding の観点で不十分 | `github-api.ts` の各関数で `owner`/`repo` に対して `encodeURIComponent` を適用するか、入力検証ガード（`REPO_NAME_PATTERN` 相当）を共通ユーティリティとして追加する |
| 3 | LOW | security | src/lib/repository-registration-actions.ts:59 | `detectBootstrapStatus` の catch ブロックがエラーを完全に握りつぶしている。安全側倒し（`'uninitialized'` 返却）は設計意図通りだが、GitHub API の 401 Unauthorized（トークン失効）や 403 Rate Limit Exceeded も黙殺されるため、運用時のデバッグが困難になる | catch ブロック内で `console.warn` 等のログ出力を追加し、エラー種別（status code）を記録する。トークンや Authorization ヘッダの値はログに含めないこと |
| 4 | LOW | security | src/__tests__/bootstrap-detection-on-register.test.ts:39 | テスト内の mock accessToken `'gho_test_token'` がハードコードされている。テストファイルであり false positive 判定基準に該当するが、`gho_` プレフィックスは GitHub OAuth トークンの実際のフォーマットと一致する。secret scanning ツールが誤検出する可能性がある | `'test_mock_token_not_real'` のように明示的にフェイクであることがわかる命名にする（任意） |

## OWASP Top 10 Assessment

### 1. Injection
- **Status**: PASS
- `detectBootstrapStatus` に渡される `owner`/`repo` は `registerRepository` の `REPO_NAME_PATTERN` (`/^[a-zA-Z0-9._-]+$/`) で検証済み。`path` はハードコード文字列リテラル。SQL 操作は Drizzle ORM のパラメータ化クエリ。文字列結合による SQL は使用されていない。

### 2. Broken Authentication
- **Status**: PASS
- `registerRepository` は冒頭で `getAuthenticatedUser()` を呼び出し、セッション未認証時は `AuthenticationError` をスロー。`detectBootstrapStatus` は認証済みユーザーの `accessToken` のみを使用。トークンのスコープは GitHub OAuth のアクセス権限に制限される。

### 3. Sensitive Data Exposure
- **Status**: PASS
- `accessToken` はエラーメッセージに含まれない。`detectBootstrapStatus` の catch ブロックは固定文字列 `'uninitialized'` のみ返却。`github-api.ts` のエラーメッセージは `response.status` と `response.statusText` のみ（トークンは含まない）。`console.log` 等によるトークンのログ出力は存在しない。

### 4. XXE
- **Status**: N/A
- XML パーサーは使用されていない。GitHub API レスポンスは JSON のみ。

### 5. Broken Access Control
- **Status**: PASS
- `registerRepository` は `getAuthenticatedUser()` でユーザー認証し、DB 操作時に `userId` でフィルタ。GitHub API の `repos/{owner}/{repo}` エンドポイントは OAuth トークンの権限で自動的にアクセス制御される。他ユーザーのリポジトリへの bootstrap status 検出は GitHub API レベルで 404/403 となり、catch ブロックで `'uninitialized'` にフォールバック。

### 6. Security Misconfiguration
- **Status**: PASS (with note)
- デバッグモードの露出なし。`'use server'` ディレクティブにより Server Action として正しくマーク。`detectBootstrapStatus` は export されておらず、外部から直接呼び出し不可。

### 7. XSS
- **Status**: N/A
- サーバーサイドロジックのみ。HTML 出力は関与しない。

### 8. Insecure Deserialization
- **Status**: PASS
- `response.json()` による JSON パース。GitHub API レスポンスの型は `as` キャストだが、`getDirectoryContents` は `Array.isArray` チェックを実施。`getFileContent` は `data.encoding !== 'base64'` チェックを実施。ユーザー入力のデシリアライズではない。

### 9. Known Vulnerabilities
- **Status**: PASS (pre-existing only)
- `bun audit`: postcss XSS (moderate, transitive dep via @tailwindcss/postcss, next), esbuild dev server (moderate, transitive dep via drizzle-kit). いずれも本変更で導入されたものではない。本変更に新規の依存パッケージ追加なし。

### 10. Insufficient Logging
- **Status**: NOTED (Finding #3)
- `detectBootstrapStatus` のエラーが完全に黙殺される。セキュリティイベント（トークン失効、レート制限超過）のログ記録がない。

## Token Handling Analysis

| Aspect | Assessment |
|--------|-----------|
| Token source | `getAuthenticatedUser().accessToken` — セッションから取得。外部入力ではない |
| Token scope | GitHub OAuth token — ユーザーがアプリに許可した scope に限定 |
| Token passing | 関数引数として `detectBootstrapStatus` → `getFileContent`/`getDirectoryContents` へ直接渡し |
| Token in logs | なし。`console.log/warn/error` にトークンを渡すコードは存在しない |
| Token in errors | なし。全エラーメッセージは `response.status` + `response.statusText` のみ |
| Token in URL | `Authorization: Bearer ${token}` ヘッダのみ。クエリパラメータに含まない |
| Token storage | メモリ上のみ（関数スコープ）。DB やファイルに永続化しない |

## SSRF / Injection Analysis

| Vector | Assessment |
|--------|-----------|
| URL injection via owner/repo | `REPO_NAME_PATTERN` (`/^[a-zA-Z0-9._-]+$/`) で検証済み。`/`, `?`, `#`, `@`, `\n` 等の URL 操作文字は排除される |
| URL injection via path | ハードコード文字列リテラル (`'openspec/project.md'`, `'requests/active/'`)。ユーザー入力は含まれない |
| URL injection via defaultBranch | `ghRepo.default_branch` は GitHub API レスポンス由来。`encodeURIComponent(ref)` で query parameter にエンコード済み |
| SSRF via redirect | `fetch` はデフォルトでリダイレクトを追従するが、ドメインは `https://api.github.com` 固定。GitHub API が 3xx を返した場合でも GitHub 内部のリダイレクトに限定される |

## Summary

`detectBootstrapStatus` のセキュリティ設計は適切。認証済みトークンの取り扱い、エラー時の情報非開示、入力検証（`REPO_NAME_PATTERN`）、安全側倒し（catch → `'uninitialized'`）が確認できる。

MEDIUM 2 件は `github-api.ts` の URL 構築における pre-existing issue（`owner`/`repo`/`path` の未エンコード）であり、本変更で導入されたリスクではない。ただし `getFileContent`/`getDirectoryContents` が新たに `detectBootstrapStatus` から呼ばれるようになったことで、これらの関数の attack surface が認識として広がったため指摘として記録する。

本変更に起因する CRITICAL/HIGH の脆弱性は検出されなかった。
