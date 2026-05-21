# Tasks: request-show-rm-removal

## Task 1: ソースファイル削除

- [x] `src/core/command/request-show.ts` を削除する
- [x] `src/core/command/request-rm.ts` を削除する

## Task 2: command-registry.ts からの登録解除

- [x] L24 `import { executeShow } from "../core/command/request-show.js";` を削除する
- [x] L25 `import { executeRm as executeRequestRm } from "../core/command/request-rm.js";` を削除する
- [x] L182-195 の `show` / `rm` subcommand 定義ブロックを削除する
- [x] USAGE 定数 (L58-59) から以下 2 行を削除する:
  - `  request show <slug>             request.md の本文を表示`
  - `  request rm <slug>               active 配下から削除`

## Task 3: テストファイル削除

- [x] `tests/unit/core/command/request-show.test.ts` を削除する
- [x] `tests/unit/core/command/request-rm.test.ts` を削除する

## Task 4: 共有テストの修正

### help-output-tc.test.ts

- [x] L29 `expect(USAGE).toContain("request show");` を `expect(USAGE).not.toContain("request show");` に変更する
- [x] L30 `expect(USAGE).toContain("request rm");` を `expect(USAGE).not.toContain("request rm");` に変更する

### validation-tc.test.ts

- [x] TC-46 (L44-55): `request-rm.js` の path traversal テストを削除する（ソースファイルが消えるため）
- [x] TC-47 (L57-68): `request-show.js` の invalid slug テストを削除する（ソースファイルが消えるため）
- [x] TC-48 (L70-81): `request-show.js` の valid slug テストを削除する（ソースファイルが消えるため）
- [x] ファイル冒頭コメント (L4-8) から TC-46 / TC-47 / TC-48 の記載を削除する

## Task 5: ビルド・テスト検証

- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green であることを確認する
