# Code Review Feedback — readme-command-sync — iter 1

- **verdict**: approved

## Summary

README.md の 3 点の drift がすべて正しく修正されている。CI green。スコープ逸脱なし。

## Findings

### INFO-1: `job cancel <jobId>` の引数表記と実装の軽微な不一致

- **severity**: info
- **location**: README.md L59 / `src/cli/command-registry.ts` L314
- **detail**: README は `job cancel <jobId>`（山括弧 = 必須の慣習）と記載しているが、command-registry.ts の `cancel` は `positional: { required: false }` — `--all-terminated` フラグで引数なし実行を許容するため。本件スコープ外（`job rm` → `job cancel` の置換が目的）であり、本 fix で新たに生じた不一致でもない。別 issue 候補として記録のみ。

## TC Checklist

| TC | Priority | Result |
|----|----------|--------|
| TC-01: `request show` が README から除去 | must | ✓ pass |
| TC-02: `request rm` が README から除去 | must | ✓ pass |
| TC-03: `job rm` が README から除去 | must | ✓ pass |
| TC-04: `job cancel <jobId>` が README に存在 | must | ✓ pass |
| TC-05: managed Quick Start に `init --runtime managed` なし | must | ✓ pass |
| TC-06: managed Quick Start が正しい手順順序 | must | ✓ pass |
| TC-07: Request commands が command-registry.ts と 1:1 対応（6 コマンド） | must | ✓ pass |
| TC-08: Job commands が command-registry.ts と 1:1 対応（6 コマンド） | must | ✓ pass |
| TC-09: `bun run typecheck` green | must | ✓ pass |
| TC-10: `bun run test` green（2651 tests） | must | ✓ pass |
| TC-11: 変更対象は README.md のみ（pipeline artifacts を除く） | must | ✓ pass |
| TC-12: env / alias セクションが USAGE 定数と一致 | should | ✓ pass |
| TC-13: `managed setup` の記載が README に存在しない | could | ✓ pass |

## Verification Cross-check

- build / typecheck / test すべて passed（verification-result.md と一致）
- test-coverage: 11/11 must TCs covered

## diff 実装確認

```diff
- specrunner request show <slug>             Print request.md content to stdout
- specrunner request rm <slug>               Delete from active/
- specrunner job rm <jobId>                  Remove job state file
+ specrunner job cancel <jobId>              Cancel job and cleanup
- export SPECRUNNER_API_KEY=sk-ant-...
- specrunner init --runtime managed
+ specrunner init
  specrunner login
+ export SPECRUNNER_API_KEY=sk-ant-...
  specrunner runtime setup
```

3 点すべて design.md / tasks.md の仕様どおり。command-registry.ts の USAGE 定数・COMMANDS 定義との照合も一致。
