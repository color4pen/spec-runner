---
name: acceptance-and-issue-audit
description: >-
  完走済 / merged 済の PR について、受け入れ基準を満たしているかレビューし、issue になり得る構造的問題がないか確認する。
  「受け入れ基準を満たしているかレビューして」「問題点があれば報告」「issue になり得る問題」と言われたら使うこと。
  parallel-request-workflow / rebase-finish の前後どちらでも単独起動可能。
---

# acceptance-and-issue-audit

以下のコマンドを実行して出力に従ってください:

```bash
bun ./bin/specrunner.ts guide audit
```
