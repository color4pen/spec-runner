# Implementer Decisions — finish-redesign

## 判断ログ（現在形・事前宣言）

- `src/state/job-slug.ts` を新規作成する :: `getJobSlug` と `stripBranchPrefix` は純粋関数なので store.ts（I/O責務）と分離し、testability を高める
- `validateJobState` の `slug` field 補完は `null` で行う :: `undefined` は JSON serialize 時に field 消去される（null は保持される）
- `resolve-target.ts` は slug 解決優先順位を `<slug引数>` > `--pr` > `--job` > auto-detect に再構成する :: design B章の仕様通り
- `preflight.ts` を単一ファイルに集約する :: 8 check を 1 file に閉じることで module-analysis.md の推奨通り check 単位 fixture が容易になる
- `fetchPrState` に mergeStateStatus を追加して raw を返す設計を維持する :: check 4 の retry ロジックは preflight 側に閉じ、fetchPrState は 1-shot のままにする（SRP）
- UNKNOWN retry ループは `sleep` を `setTimeout` + `Promise` で実装する :: node:child_process 標準 API、Bun.* 禁止
- `archive-pr.ts` は全削除する :: 1-PR モデルに archive-pr.ts の機能は不要、テストも合わせて削除
- Phase 3 `--admin` は `mergeStateStatus=BLOCKED` かつ `OPEN_CHECKS_FAILING` の場合のみ付与する :: spec D4 check 4 の条件
- `checkoutFeatureBranch` helper を preflight または Phase 1 ヘルパーとして実装する :: `git fetch origin <branch>` + `git checkout -B <branch> origin/<branch>` の固定パターン（constraints.md参照）
- `formatJobRow` の SLUG 列は `JOB_ID` の次に追加する :: design D6 指定通り、truncate しない
- `runPs` に `--all` オプションを追加し、デフォルトは archived を非表示にする :: spec E章
- `register_branch` handler は `slug` optional input を受け付け、空文字列は branch derivation に fallback する :: TC-148 準拠
- escalation は全パスで `formatEscalation` を経由させる :: constraints.md「grep `escalation:` で formatEscalation 経由でない usage を 0 件化」に従う
- `JobStatus` の `archived` は既に schema.ts に存在するため追加不要 :: 確認済み
- existing finish-orchestrator.test.ts は 2-PR モデル前提のテストが多い :: 2-PR モデル前提のアサーション（archive PR create 等）を削除し新 Phase 構造に更新する
- finish-archive-pr.test.ts は全削除対象 :: archive-pr.ts 削除に合わせて削除
- dry-run mode は orchestrator 内の Phase 0-4 全体で `dryRun` フラグを通じて制御する :: Phase 0 のみ実行し destructive op の spawn を呼ばない
