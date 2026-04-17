## Code Review Result

**Verdict**: needs-fix
**Score**: 6.72 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: -- (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 6 | 0.25 | 1.50 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 6 | 0.10 | 0.57 |
| **Total** | | | **6.72** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (116/116, 247 expect()) |
| Security | N/A (no scanner configured) |

### Consolidated Findings

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | security | src/lib/bootstrap-actions.ts:362 | `handleBootstrapSessionCompletedWithoutPr` は `'use server'` ファイル内の exported 関数だが、`getAuthenticatedUser()` を呼んでおらず所有権チェックもない。クライアントから直接呼び出された場合、任意の repositoryId/requestId を指定して他ユーザーのリポジトリを uninitialized にリセットし、request を cancelled にできる（IDOR） | 関数冒頭で `getAuthenticatedUser()` を呼び、`repositories.userId === user.dbId` の検証を追加する。あるいは `getRepositoryWithBootstrapStatus(repositoryId)` を呼んで所有権を確認する |
| 2 | HIGH | security | src/lib/bootstrap-actions.ts:408 | `archiveSessionsByRequest` も同様に `'use server'` ファイル内の exported 関数だが認証・認可チェックなし。任意の requestId のセッションをアーカイブ可能 | `getAuthenticatedUser()` で認証し、request の所有者が一致することを検証してからアーカイブする。または Server Action として export せず内部ヘルパーにする（`export` を削除） |
| 3 | MEDIUM | correctness | src/lib/bootstrap-utils.ts:13 | `PR_URL_REGEX` が非アンカーで定義されている。`isValidPrUrl` で使用する際、`https://evil.com/https://github.com/owner/repo/pull/42` や末尾に任意文字が付いた URL を valid と判定する。`extractPrUrl` は自由テキストから抽出用なので非アンカーで問題ないが、`isValidPrUrl` は URL 全体を検証すべき | `isValidPrUrl` 用に `^` と `$` アンカー付きの別 regex を定義する。例: `const PR_URL_STRICT_REGEX = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;` |
| 4 | MEDIUM | correctness | src/lib/bootstrap-actions.ts:392 | `processBooststrapSessionEvent` の関数名にタイポ（"Boosststrap" — `s` が余分）。このまま API として公開されると修正コストが高くなる | `processBootstrapSessionEvent` に修正する |
| 5 | MEDIUM | correctness | src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx | PR URL 検出（TC-028）とセッション完了時のロールバック（TC-029）が workspace-client.tsx の SSE ストリーム処理に統合されていない。`processBooststrapSessionEvent` と `handleBootstrapSessionCompletedWithoutPr` は定義されているが呼び出されていない | SSE の `connectStream` 内で受信する各 event text に対して `processBootstrapSessionEvent` を呼び出す。セッション完了イベント受信時に PR URL 未検出の場合は `handleBootstrapSessionCompletedWithoutPr` を呼び出す |
| 6 | MEDIUM | maintainability | src/lib/bootstrap-actions.ts:55-65 , src/lib/bootstrap-actions.ts:102-112 | `RepositoryWithBootstrap` への変換コードが 5 箇所以上で繰り返されている。フィールドが追加された場合に全箇所の修正が必要 | `toRepositoryWithBootstrap(repo: typeof repositories.$inferSelect): RepositoryWithBootstrap` ヘルパー関数を作成し、各所から呼び出す |
| 7 | LOW | maintainability | src/app/(protected)/repos/_components/repos-page-client.tsx:214 | `BootstrapStatus` 型が `repos-page-client.tsx` 内で再定義されている（`type BootstrapStatus = 'uninitialized' | ...`）。`bootstrap-utils.ts` からインポートすべき | `import type { BootstrapStatus } from '@/lib/bootstrap-utils'` を使用し、ローカル定義を削除する |
| 8 | LOW | performance | src/lib/repository-registration-actions.ts:225-241 | `listUserRepositories` に `ORDER BY` が指定されていない。結果の表示順が不安定になる可能性がある | `.orderBy(desc(repositories.createdAt))` を追加して一貫した順序を保証する |

### Iteration Comparison

-- (initial iteration)

### Summary

- **全体**: 機能的な実装は概ね完了しており、state machine・所有権チェック・ロールバック処理の設計は堅実。Build/Type Check/Lint/Tests 全て PASS
- **承認ブロック要因**: `handleBootstrapSessionCompletedWithoutPr` と `archiveSessionsByRequest` が Server Action として認証なしで公開されている点は IDOR リスクがあり HIGH。review-lessons でも繰り返し指摘されているパターンの再発
- **要修正**: PR URL 検出のストリーム統合が未実装（関数はあるが呼ばれていない）。`isValidPrUrl` のアンカー不足。関数名のタイポ
- **好評点**: N+1 防止のインライン subquery、bootstrap status の state machine 設計、startBootstrap のロールバック処理、createRequest のゲーティング実装
