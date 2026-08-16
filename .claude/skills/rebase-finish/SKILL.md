---
name: rebase-finish
description: >-
  完走済 request を順次 archive して main にマージする。各 archive の前に worktree 内で手動 rebase が必要。
  「rebase しながら archive」「順次 merge」「3 件 archive」と言われたら使うこと。
  spec-runner project 専用 (= `bun ./bin/specrunner.ts job archive` 前提)。
---

# rebase-finish

以下のコマンドを実行して出力に従ってください:

```bash
bun ./bin/specrunner.ts guide merge
```
