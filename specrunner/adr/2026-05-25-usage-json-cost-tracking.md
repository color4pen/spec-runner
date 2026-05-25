# usage.json による全フェーズ token usage の永続化と集計

**Date**: 2026-05-25
**Status**: accepted

## Context

spec-runner の運用では request 起票から finish まで複数フェーズで LLM コストが発生するが、コスト観測の基盤が存在しなかった。

1. `request review` / `request generate` のコストは一切記録されない
2. pipeline 内 step のコストは `state.steps[N][attempt].modelUsage` に存在するが、state file は `.specrunner/jobs/` に置かれ `.gitignore` 対象であるため、マシンをまたいだ retrospective や過去 PR の振り返りが不可能
3. 集計・可視化する CLI surface がなく、ユーザーが手動 `jq` で掘り出すしかなかった

152 PR の cost 集計が偶然実施できたのは、state file が旧パス (`~/.local/share/specrunner/`) に残存していたからであり、再現性がない。

cost 観測の問題には 2 つの軸がある：
- **可視性**: どのフェーズにコストが偏っているかが見えない
- **永続性**: 過去 PR のコストを後から参照できない

この 2 軸を最小 scope で解決する構造として、slug 単位の `usage.json` に全フェーズの usage を蓄積し、既存の artifact lifecycle（draft → change folder → archive）に乗せる設計を採用した。

## Decision

### D1: append-only な `usage.json` を新たなアーカイブ用アーティファクトとして導入する

`specrunner/drafts/<slug>/usage.json`（起票時） → `specrunner/changes/<slug>/usage.json`（pipeline 中） → `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/usage.json`（archive 後）という lifecycle を持つファイルを新設する。

スキーマ:

```typescript
interface UsageFile {
  commandInvocations: CommandInvocation[];
}

interface CommandInvocation {
  command: "request-review" | "request-generate" | "job";
  timestamp: string;          // ISO 8601
  modelUsage: Record<string, ModelUsage> | null;
  jobId?: string;             // job のみ
  stepName?: string;          // job の step 別記録
}
```

全 entry は **append のみ**、削除・上書きしない。複数回 review / 複数 step 実行を全 history として残すことで、retrospective が可能になる。

このファイルは `archive-change-folder.ts` が directory ごと `git mv` する既存の仕組みにより、特別な永続化コードを追加せずに archive に含まれる。

### D2: state file を source of truth とし、usage.json は finish 時に一括 derive する

pipeline 実行中は引き続き state file（`.specrunner/jobs/<id>.json`）のみに `StepRun.modelUsage` を記録する。`usage.json` へのパイプライン step の反映は `finish Phase 1` の `archiveChangeFolder()` 直前に一括で行う。

```
finish Phase 1:
  1. git checkout <feature-branch>     (既存)
  2. mergeSpecsForChange()             (既存)
  3. ★ deriveAndWriteUsage()           (新規)
     - state = load job state
     - entries = deriveFromJobState(state)
     - for each entry: appendInvocation(changes/<slug>/usage.json, entry)
     - git add changes/<slug>/usage.json
  4. archiveChangeFolder()             (既存)
  5. commitArchive()                   (既存)
```

state file は **source of truth**、usage.json は **archive 用 derived view** として位置づける。両者が二重管理になるが、state file は gitignore（per-machine の揮発的データ）、usage.json は git 管理（恒久的な観測ログ）で **目的が異なる**ため意図的に分離している。

### D3: OneShotQueryResult port に modelUsage を追加する

`queryOneShot()` は既に `SDKResultSuccess` から `result` と `session_id` を取り出していたが、`modelUsage` は破棄していた。`ClaudeCodeRunner.run()`（L240-254）と同型の extraction パターンを `OneShotQueryResult` にも適用し、`request review` / `request generate` の LLM コストを捕捉できるようにする。

```typescript
// src/core/port/one-shot-query-client.ts
export interface OneShotQueryResult {
  text: string;
  sessionId?: string;
  turnCount?: number;
  stopReason?: string;
  modelUsage?: Record<string, ModelUsage>;  // 追加
}
```

port interface の拡張は additive であり、既存 callers への破壊的変更はない。

### D4: usage.json の read/write を store module に集約する

`src/core/usage/store.ts` に `readUsageFile` / `appendInvocation` / `deriveFromJobState` を集約する。callers（request-review, generator, finish）はこの module のみを参照し、ファイル操作の実装詳細を持たない。`appendInvocation` は既存の `atomicWriteJson`（`src/util/atomic-write.ts`）を使用して read → append → write の atomic 操作を保証する。

## Alternatives Considered

### Alternative 1: step ごとに dual write する（StepExecutor.finalizeStep 内）

state file への書き込みと同時に `changes/<slug>/usage.json` も更新する案。

- **Pros**: pipeline 実行中にリアルタイムで usage.json を観測できる。finish 前に中断しても途中の usage が残る
- **Cons**: StepExecutor に change folder path の解決という責務が追加される。state file と usage.json の二重管理で不整合リスクが生じる。pipeline コードへの侵入が大きい
- **Why not**: リアルタイム観測の要件は本 request に含まれない（retrospective 用途）。source of truth 一元化と pipeline 無改修を優先した

### Alternative 2: job show / ps コマンドに usage 集計を統合する

新規 subcommand ではなく既存コマンドを拡張する案。

- **Pros**: コマンド体系を増やさない
- **Cons**: usage は job 単位ではなく slug 単位（draft 段階の cost を含む）。job show/ps は active job の状態表示に特化しており、archive 横断の集計は責務外
- **Why not**: 概念の粒度が合わない。usage は lifecycle 全体（draft 含む）の観測であり、job は pipeline 実行の観測

### Alternative 3: usage.json を state file の隣に置き gitignore 対象から外す

`.specrunner/jobs/<id>-usage.json` として state file と同じ場所に置き、gitignore から除外する案。

- **Pros**: archive 移動の必要がない。state file と同一 lifecycle
- **Cons**: `.specrunner/` は per-machine の実行状態ディレクトリとして設計されており、git 管理対象を混在させると責務が不明確になる。slug ではなく job ID 単位のファイルになるため、同一 slug の複数 run を集約するクエリが複雑になる
- **Why not**: `.specrunner/` の設計原則（per-machine 実行状態）を変えるコストが高く、change folder の artifact lifecycle への乗り入れが単純

### Alternative 4: USD 換算を含めて price table を同時実装する

token 数と同時にモデル別単価を embed して USD 表示まで含める案。

- **Pros**: ユーザーに即価値のある情報を提供できる
- **Cons**: price table は変動する。単価をハードコードすると陳腐化する。動的取得には外部 API 依存が生じる。token 追跡と価格計算は独立した関心事
- **Why not**: token 追跡基盤の確立と価格計算を段階的に分離する。価格計算は別 request で扱う

## Consequences

### Positive

- request 起票から finish までの全フェーズのコストが slug 単位で観測・永続化される
- archive が git 管理対象になることで、過去 PR の cost retrospective が再現可能になる
- pipeline コード（StepExecutor / CommandRunner）に改修なし。finish orchestrator の 1 step 追加のみ
- `usage.json` 不在の旧 archive は silent skip されるため、導入前後の互換性が保たれる
- `OneShotQueryResult.modelUsage` の追加は additive で既存 callers を破壊しない
- 将来の model 切替（step model config）実施時に、切替前後のコスト比較が直接できる

### Negative

- state file（source of truth）と usage.json（derived view）の二重管理が発生する。両者の乖離が将来の混乱を招く可能性がある（ただし設計として意図的に分離している）
- finish が halt した場合、usage.json は change folder に残るが archive されない。partial usage の回復は本 request 対象外
- `deriveAndWriteUsage` では entries 数だけ `appendInvocation`（read → write）を繰り返す。step 最大 10 件程度では問題ないが、スケールしない実装（将来バッチ化が望ましい）

### Known Debt

- `appendInvocation` の N 回ループ（read → write 繰り返し）は将来バッチ化が望ましい。現状の規模では問題なし
- USD 換算 / price table は scope 外。token 数の追跡基盤が確立した後、別 request で実装する
- 過去 archive（本 feature 導入前）への usage.json retrofit は対象外。旧 archive は集計から silent skip される

## References

- Request: `specrunner/changes/cost-efficiency-pipeline/request.md`
- Design: `specrunner/changes/cost-efficiency-pipeline/design.md`
- Related: `specrunner/adr/2026-05-22-one-shot-query-client-port.md`（OneShotQueryClient port 確立）
- Related: `specrunner/adr/2026-05-01-cli-finish-command.md`（finish orchestrator の原型）
- Related: `specrunner/adr/2026-05-24-drafts-directory-structure.md`（draft → change folder lifecycle）
- Related: `specrunner/adr/2026-05-21-dated-archive-folders.md`（archive 命名規則）
