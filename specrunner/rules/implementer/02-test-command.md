## テスト実行コマンド

- テストの実行は必ず `bun run test`(= vitest run)を使う。ファイル指定は `bun run test -- <path>`
- `bun test`(bun 内蔵 runner)は使用禁止 — このプロジェクトのテスト資産は vitest 前提で互換がなく、sandbox 環境下では終了せず hang する
