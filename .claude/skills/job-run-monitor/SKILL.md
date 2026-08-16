---
name: job-run-monitor
description: >-
  spec-runner job の起動 → 監視 → halt 対応 → 取り込みの運用手順。
  「job 起動して」「run して」「監視して」「resume して」「archive して」と言われたら、
  または agent session が pipeline job を扱う前に使うこと。
  spec-runner project 専用 (= `bun ./bin/specrunner.ts` 前提)。
---

# job-run-monitor

以下のコマンドを実行して出力に従ってください:

```bash
bun ./bin/specrunner.ts guide jobs
```
