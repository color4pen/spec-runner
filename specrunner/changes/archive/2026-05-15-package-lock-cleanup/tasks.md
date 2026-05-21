# Tasks: package-lock-cleanup

## Task 1: package-lock.json を git から削除

- **file**: `package-lock.json`
- **action**: `git rm package-lock.json`
- **verify**: `git ls-files package-lock.json` が空出力

- [x] 完了

## Task 2: .gitignore に package-lock.json と yarn.lock を追加

- **file**: `.gitignore`
- **action**: `# pnpm (not used)` セクションの直前に以下を追加:

```gitignore
# npm (not used — bun.lock is the single lockfile)
package-lock.json

# yarn (not used)
yarn.lock
```

- **note**: 既存の `pnpm-lock.yaml` ignore と同じパターンでグルーピング
- **verify**: `grep package-lock.json .gitignore` がヒットすること

- [x] 完了

## Task 3: package.json に engines.bun を追加

- **file**: `package.json`
- **action**: `"private": true` の後に `engines` フィールドを追加:

```json
"engines": {
  "bun": ">=1.0.0"
}
```

- **verify**: `bun run typecheck && bun run test` が green

- [x] 完了

## 検証（全タスク完了後）

```bash
git ls-files package-lock.json          # 空であること
grep package-lock.json .gitignore       # ヒットすること
bun install                             # 成功すること
bun run typecheck && bun run test       # green であること
```
