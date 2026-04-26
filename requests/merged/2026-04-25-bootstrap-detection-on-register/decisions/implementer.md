# Implementer Decisions

## 実装上の判断

- `detectBootstrapStatus` をモジュールプライベート関数として `repository-registration-actions.ts` 内に定義する :: design.md Decision 5 に従い、`registerRepository()` でのみ使用するため export 不要。テスタビリティのため関数として切り出しつつ、将来の再利用が必要になった時点で export に昇格させる
- テストで `mock.module('@/lib/github-api')` を使わず `globalThis.fetch` をモックする :: bun:test の `mock.module` はプロセスグローバルに適用されるため、ファイルレベルで `@/lib/github-api` をモックすると `request-create-propose.test.ts` の `getFileContent`/`getDirectoryContents` 直接テストと干渉する問題が発生した。`globalThis.fetch` のモックに切り替え、テスト間の副作用を排除した
- `ghRepo.default_branch || 'main'` のフォールバックを `detectBootstrapStatus` の引数に渡す :: `ghRepo.default_branch` が空文字や undefined の場合に `detectBootstrapStatus` が空文字のブランチを参照しないよう防御的に `'main'` をフォールバックとして使用する。実用上は発生しないが TypeScript 型安全性のため
- TC-006 (getDirectoryContents throws) の実装: HTTP 500 を返すことで `getDirectoryContents` が throw する状況を再現する :: `getDirectoryContents` は 404 以外の非 OK レスポンスで `throw new Error` する設計のため、500 を返すことでエラースローをシミュレートした
