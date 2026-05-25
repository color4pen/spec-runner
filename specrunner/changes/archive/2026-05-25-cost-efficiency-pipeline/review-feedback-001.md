# Code Review Feedback — cost-efficiency-pipeline — iter 1

## Summary

全体的に設計に忠実で実装品質は高い。型安全・エラーハンドリング・テストカバレッジ (38/38 must TC) すべて green。
以下の指摘はすべて LOW severity であり、correctness に影響しない。

---

## Findings

### F-01 [LOW] 未使用 import — `derive-usage.ts`

- **Location**: `src/core/finish/derive-usage.ts` L9
- **Description**: `readUsageFile` を import しているが、関数本体で一切使用していない。`appendInvocation` の内部で `readUsageFile` を呼ぶため機能的な問題はないが、dead import として残っている。
- **Recommendation**: import から `readUsageFile` を削除する。

```typescript
// before
import { deriveFromJobState, appendInvocation, readUsageFile } from "../usage/store.js";

// after
import { deriveFromJobState, appendInvocation } from "../usage/store.js";
```

---

### F-02 [LOW] `deriveFromJobState` が不必要に `async`

- **Location**: `src/core/usage/store.ts` L58
- **Description**: 関数シグネチャは `async` だが内部に `await` が一切ない。Promise を返すという点では問題なく動作するが、意味的にミスリーディング。`Promise<CommandInvocation[]>` を返す設計とするなら同期実装でも型が通る。
- **Recommendation**: `async` を外して `Promise.resolve(entries)` を返すか、シグネチャを `CommandInvocation[]` に変更してもよい。ただし callers が `await` している現状コードとの互換性に注意。

---

### F-03 [LOW] `showUsageSummary` の try-catch が misleading

- **Location**: `src/core/command/usage-summary.ts` L47–51
- **Description**: `readUsageFile` は ENOENT を内部で処理して `{ commandInvocations: [] }` を返すため、ファイル不在の場合に try-catch はヒットしない。実際の「skip」は L54 の `commandInvocations.length === 0` チェックで行われている。try-catch に入るのは EACCES 等の予期しないエラーのみで、コードの意図と実際の挙動が一致していない。
- **Recommendation**: コメントを「ファイル不在・パース失敗・アクセス不可いずれも skip」と明示するか、`readUsageFile` が返す空構造を利用していることを示す形にリファクタする。現状の動作は正しいため必須修正ではない。

---

### F-04 [LOW] `deriveAndWriteUsage` 内の N 回 appendInvocation ループ

- **Location**: `src/core/finish/derive-usage.ts` L65–68
- **Description**: entries の数だけ `appendInvocation` を呼ぶため、各呼び出しで read→append→write が発生する。pipeline step が最大 10 件程度という前提では実用上問題ないが、コストパフォーマンスとしては非効率。
- **Recommendation**: 現状で問題ないが、将来的には「一度 read → 全 entries push → 一度 write」のバッチ化が望ましい。今 request の scope 外でよい。

---

## TC Coverage Check

| Category | Must TCs | Status |
|---|---|---|
| Path utilities (TC-01〜03) | 3 | ✓ covered (paths.test.ts) |
| Usage store read/append (TC-04〜08) | 5 | ✓ covered (store.test.ts) |
| deriveFromJobState (TC-10〜11) | 2 | ✓ covered (store.test.ts) |
| OneShotQueryResult modelUsage (TC-14〜16) | 3 | ✓ covered (query-one-shot.test.ts TC-OSQ-06) |
| request review tracking (TC-17〜19, 21〜22) | 5 | ✓ covered (verification 38/38) |
| request generate tracking (TC-23〜24) | 2 | ✓ covered |
| setupWorkspace copy (TC-25〜27) | 3 | ✓ covered |
| finish derive (TC-29〜31, 34〜35) | 5 | ✓ covered |
| CLI usage show (TC-36〜39) | 4 | ✓ covered |
| CLI usage summary (TC-40〜41) | 2 | ✓ covered |
| step model config (TC-44〜46) | 3 | ✓ covered (step-config.test.ts TC-032〜033) |
| build/test green (TC-49) | 1 | ✓ verification-result: passed |
| **Total** | **38** | **38/38** |

---

## Acceptance Criteria Check

| 受け入れ基準 | Status |
|---|---|
| `request review <slug>` 後 `drafts/<slug>/usage.json` に entry append | ✓ |
| 同一 draft を 2 回 review → 2 entry 蓄積 | ✓ |
| `request generate` でも同様 | ✓ |
| `job start` 後 `drafts/<slug>/usage.json` → `changes/<slug>/usage.json` コピー | ✓ |
| pipeline 完走後 `changes/<slug>/usage.json` に各 step entry | ✓ |
| `finish` 後 `archive/<YYYY-MM-DD>-<slug>/usage.json` 永続化 | ✓ |
| `specrunner usage <slug>` で total / step 別 / model 別 token 数表示 | ✓ |
| `specrunner usage` (引数なし) で全 archive サマリ | ✓ |
| `usage.json` 不在 archive は silent skip | ✓ |
| step model config 切替が機能する | ✓ |
| `bun run typecheck && bun run test` が green | ✓ |

---

## Verdict

- **verdict**: approved
