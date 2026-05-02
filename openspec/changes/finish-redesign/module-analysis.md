# module-analysis.md — finish-redesign

## 1. 既存コードパターン一覧

> **補注（code-fixer による更新、2026-05-02）**: §1.1 のリスト中、`archive-pr.ts` は本 PR で削除済み。`merge-feature-pr.ts` と `pr-state.ts` は review-feedback-001 の #1/#2 指摘に基づき削除済み（dead code — 2-PR モデル時代の残存）。`escalation.ts` の `getRecommendedAction` も同指摘に基づき削除済み。以下のリストは削除前の propose 段階の観察記録として保持する。

### 1.1 `src/core/finish/` モジュール分割パターン
1 機能 = 1 ファイル + 1 export 関数 + Result discriminated union（`{ ok: true; ... } | { ok: false; escalation: string; exitCode: 1 }`）が一貫している:

- ~~`merge-feature-pr.ts` → `mergeFeaturePr` → `MergeFeaturePrResult`~~ (削除済み — dead code, #1)
- `archive-openspec.ts` → `archiveOpenspec` → `ArchiveOpenspecResult`
- `move-requests-dir.ts` → `moveRequestsDir` → `MoveRequestsDirResult`
- ~~`archive-pr.ts` → `prepareArchiveBranch` / `pushAndCreateArchivePr` / `checkArchivePrAlreadyMerged` → `ArchivePrResult` / `PrepareBranchResult`~~ (削除済み — 1-PR モデル転換)
- ~~`pr-state.ts` → `fetchPrState` + `normalizePrState`（純粋関数併設）~~ (削除済み — dead code, #2)
- `idempotency.ts` → `isFullyFinished`（純粋判定）
- `escalation.ts` → `formatEscalation` ~~+ `getRecommendedAction`~~ (削除済み — dead code, #6)
- `job-state-update.ts` → `assertJobFinishable` + `markJobArchived`

軸: cohesion（1 file 1 責務が観測でき凝集度高い）。

### 1.2 依存性注入の port パターン
- `FinishContext` / `FinishFs` / `SpawnFn`（types.ts:42–57）が unit test の境界を形成
- `DoctorFs` / `DoctorContext` / `ExecFileFunction`（doctor/types.ts:45–103）が同型のパターンで先行
- finish 側は `cwd` / `spawn` / `fs` を関数 params 経由で注入、doctor 側は `DoctorContext` 経由で集約注入

軸: testability（mock 可能な境界が一貫）。

### 1.3 Escalation フォーマットの集約
全 finish モジュールが `formatEscalation({ failedStep, detectedState, recommendedAction, resumeCommand })`（escalation.ts:19）を経由して escalation 文字列を生成する。orchestrator.ts:96–107、118–129 は escalation.ts を経由せず直接配列リテラルで組み立てており、同一フォーマットの 2 系統重複が観測される。

軸: reusability（重複の余地）/ readability。

### 1.4 命名規則
- step module は動詞形（`mergeFeaturePr`、`archiveOpenspec`、`moveRequestsDir`）
- 結果型は `<Verb><Noun>Result`、Result discriminated union の判別子は `ok: boolean`
- escalation field 4 つ（`failedStep` / `detectedState` / `recommendedAction` / `resumeCommand`）が固定
- TC-NNN コメント（spec test case 番号）が各 module 冒頭にあり test との traceability を確保

軸: readability（命名規則の一貫）。

### 1.5 純粋関数 + I/O 関数の混在
- `state/store.ts` は I/O（`loadJobState`、`updateJobState`、`listJobStates`）と純粋なロジックは持たない
- `state/schema.ts` は純粋（`appendHistoryEntry`、`validateJobState`、`normalizeSteps`、`legacyObjectToStepRun`）

軸: SRP / cohesion（store.ts は I/O 寄り、schema.ts は純粋寄りに既に分離済み）。

### 1.6 slug 派生計算の散在
slug が canonical でないため、複数箇所で `path.basename(state.request.path)` が直接書かれている:

- `resolve-target.ts:41` — jobId 経路の slug 計算
- `resolve-target.ts:74` — `--slug` フィルタの右辺
- 加えて propose agent / register_branch handler 側でも slug を独自導出

軸: reusability（複数箇所の重複）/ coupling（`request.path` の形状に強結合）。

---

## 2. 共通化すべき箇所と理由

### 2.1 `getJobSlug(state)` への slug 派生計算の集約 — 軸: reusability
**観測根拠**: `src/core/finish/resolve-target.ts:41`、`src/core/finish/resolve-target.ts:74` で `path.basename(state.request.path)` が直接書かれている。memo "slug dual derivation" でも `run.ts:141` の path.basename と propose agent の独自生成の divergence が記録されており、現状 3 箇所以上で同じ派生がコピーされている。
**推奨**: design D2 で定義された `getJobSlug(state): string` helper を `src/state/job-slug.ts`（または `src/state/helpers.ts` に集約）として独立 module に export し、resolve-target.ts と ps.ts と finish の各 step が必ずこの helper を経由するようにする。

### 2.2 `stripBranchPrefix(branch)` を独立純粋関数として export — 軸: reusability
**観測根拠**: `getJobSlug` の fallback、`register_branch` handler の slug 導出、`--pr` 逆引きの prefix strip（spec.md cli-finish-command Requirement 1）の 3 箇所で同一の prefix（`feat/` / `fix/` / `change/` / `refactor/` / `chore/`）strip ロジックが必要。tasks.md 1.4 で明示的に export 要件化されている。
**推奨**: `src/state/store.ts` ではなく `src/state/job-slug.ts` に純粋関数として配置し、`getJobSlug` と export を共通化する。store.ts は I/O 中心の責務に保つ。

### 2.3 Escalation 構築の orchestrator 側散在を formatEscalation に統一 — 軸: readability
**観測根拠**: `src/core/finish/orchestrator.ts:94–107` と `:115–131` が `formatEscalation` を経由せず生配列リテラルで escalation を組み立てている。一方 step modules（merge-feature-pr.ts:62、archive-openspec.ts:59 等）は `formatEscalation` 経由で統一されている。
**推奨**: orchestrator のローカル escalation も `formatEscalation` を経由させ、フォーマット差分が起きる経路を 1 つに減らす。spec.md cli-finish-command Requirement 「escalation 統一フォーマット」を満たすうえで前提となる。

### 2.4 Result discriminated union の共通基底化（任意） — 軸: readability
**観測根拠**: `MergeFeaturePrResult` / `ArchiveOpenspecResult` / `MoveRequestsDirResult` / `ArchivePrResult` / `PrepareBranchResult` の `{ ok: false; escalation: string; exitCode: 1 }` バリアントが完全同型で 5 箇所重複している。
**推奨**: `type StepFailure = { ok: false; escalation: string; exitCode: 1 }` を `src/core/finish/types.ts` に追加し、各 Result 型で再利用する。観測コストは小、可読性は段階的に改善。implementer 採否は自由。

---

## 3. 既存ヘルパー / ユーティリティの活用候補

### 3.1 `formatEscalation`（`src/core/finish/escalation.ts:19`）— 軸: reusability
新規 `preflight.ts` の Phase 0 失敗 escalation も既存 `formatEscalation` を必ず経由させる。Phase / check 番号は `failedStep` field に `"Phase 0 check 4 (mergeStateStatus)"` のような形でフォーマットすれば既存テンプレで吸収可能。spec.md cli-finish-command Requirement「escalation 統一フォーマット」要件と整合。

### 3.2 `FinishFs` / `SpawnFn` 既存 port — 軸: testability
`preflight.ts` も `FinishFs` + `SpawnFn` 注入で書ける。`fs.exists` で `openspec/changes/<slug>/` 実存確認、`spawn("openspec", ["validate", slug, "--strict"], { cwd })` で validate dry-run、`spawn("which", ["gh"])` 等で binary 存在確認が可能。新規 port を作らず既存 `FinishContext` を pre-flight も共有することを推奨する。

### 3.3 `appendHistoryEntry`（`src/state/schema.ts:136`）— 軸: reusability
Phase 4 の `markJobArchived`（job-state-update.ts:32）が既に活用済み。新たに「Phase 0 pre-flight 結果の history への記録」を入れる場合、既存 helper をそのまま使える。新規追加不要。

### 3.4 `normalizePrState` / `fetchPrState`（`src/core/finish/pr-state.ts`）— 軸: reusability
Phase 0 check 3/4 で再利用可能。retry ループ（3 秒×3 回）は preflight.ts 側に閉じ、`fetchPrState` は 1-shot のままに保つ。retry 責務の混入は避ける（SRP）。

### 3.5 `DoctorCheck` / `DoctorContext` パターン（`src/core/doctor/types.ts:32`）— 軸: testability / readability
Phase 0 を `PreflightCheck` interface（`{ name, check(ctx): Promise<PreflightOutcome> }`）の collection として実装すると、doctor とパターン整合する。check 単位の test fixture 化が容易になる（TC-101〜TC-110 の adversarial fixture を check 単位に並べやすい）。implementer 判断に委ねるが、既存パターンとして強い参照先。

### 3.6 `resolveTarget`（`src/core/finish/resolve-target.ts`）— 軸: reusability
入力解決ロジックは既存実装あり。本 change では `<slug>` 第一形 / `--pr` / `--job` / cwd auto-detect の優先順位を再設計する必要があるが、既存 listJobStates / loadJobState / awaiting-merge readdir のサブルーチンは流用可能。完全書き換えではなく、優先順位の組み替えと slug 派生の getJobSlug 置換に留めるのが coupling 最小化の道。

---

## 4. 分割単位の推奨

### 4.1 削除候補（1-PR モデル転換で物理的に不要）— 軸: cohesion / coupling
- `src/core/finish/archive-pr.ts` 全体（design D3 / tasks 3.1）
- `src/core/finish/orchestrator.ts:17` の archive-pr import
- `orchestrator.ts:153–164`（archivePrAlreadyMerged 分岐）
- `orchestrator.ts:166–181`（prepareArchiveBranch 呼び出し）
- `orchestrator.ts:216–229`（pushAndCreateArchivePr 呼び出し）
- `orchestrator.ts:239` の `git checkout main`（Phase 4 に移管）

削除によって orchestrator から archive-pr.ts への coupling が完全消滅し、step module 数が 7 → 5 に縮約される。

### 4.2 新規モジュール: `src/core/finish/preflight.ts` — 軸: SRP / testability
**推奨**: Phase 0 全 8 check（tasks 4.1–4.9）を 1 module に集約する。1 module 内で check 関数群 + 集約 runner（`runPreflight(ctx, slug): PreflightResult`）を export。

**根拠**:
- check は全て pure-ish（subprocess + filesystem 観察）で副作用は読み取り中心
- doctor の DoctorCheck pattern と同型化することで既存 reader の認知負荷が低い
- TC-101〜TC-110 の adversarial fixture を check 単位で配置できる

**避けるべき分割**: check 1 つ 1 ファイルへの過剰分解は file 数が爆発し readability を下げる。8 check は 1 file（推定 200–300 行）で十分凝集する。

### 4.3 新規モジュール: `src/state/job-slug.ts`（または `src/state/helpers.ts` に追加）— 軸: SRP
**推奨**: `getJobSlug(state)` と `stripBranchPrefix(branch)` を `store.ts` ではなく独立純粋 module に置く。

**根拠**:
- `store.ts` は I/O（fs 読み書き）の責務。純粋 helper を混ぜると test の依存幅が広がる（`getJobSlug` 単体 test に store.ts 全体が type 依存として乗る）
- 既に `src/state/helpers.ts`（run.ts:11 で import 済み）が helper の置き場所として存在する。そこに追加するのが最小 coupling

**注意**: implementer が `store.ts` 内に置く判断をしても可（tasks.md 1.3 が "store.ts または隣接 module" と明示）。本 module-analysis は隣接 module を推奨するが拘束しない。

### 4.4 新規モジュール: `src/core/finish/archive-on-feature-branch.ts`（任意）— 軸: cohesion
**推奨**: Phase 1 の 4 step（checkout / openspec archive / git mv / git commit）を 1 module に集約する代替設計。

**現状**: archive-openspec.ts と move-requests-dir.ts が分離しており、orchestrator が両方を順次呼び出す。1-PR モデルでは「feature branch 上での archive 操作」は単一 atomic な作業単位として読まれ得る。

**判断**:
- 既存 2 module を維持するなら orchestrator 側で sequencing をまとめる必要がある
- 統合する場合 archive-openspec.ts と move-requests-dir.ts を `archive-on-feature-branch.ts` として merge し、idempotent skip 判定を 1 箇所に集約できる

**推奨**: implementer 判断。維持（既存のまま orchestrator で配線）でも統合でも spec の Scenario は満たせる。維持の方が diff が小さく review コストが低い。統合の方が冪等性ロジック（tasks 3.4）が 1 箇所に閉じる。

### 4.5 既存 `resolve-target.ts` の改修方針 — 軸: coupling
**推奨**: 全書き換えではなく以下の最小改修:
- `path.basename(state.request.path)` 2 箇所（41, 74）を `getJobSlug(state)` 呼び出しに置換
- `--pr <num>` 逆引きの新ブランチを追加（gh pr view → headRefName → stripBranchPrefix → slug 解決）
- cwd auto-detect の `awaiting-merge` 単一性判定（既存）に加え、`active/<dir>/` 検知を spec.md Requirement 1 4-a に従い追加
- jobId 直接渡しを廃止、`--job` flag のみに残置（CLI 引数解析側の改修と整合）

### 4.6 register_branch handler 改修 — 軸: SRP / cohesion
**推奨**: handler 内で slug 受領時のみ `state.request.slug` を更新する write path を追加。slug 省略時の `stripBranchPrefix(branch)` 導出は handler が自前で行わず、上記 4.3 で分離した `stripBranchPrefix` を import する。これで handler は「入力受領 → state 書き込み」の最小責務に閉じる。

### 4.7 orchestrator.ts の Phase 配線リファクタ — 軸: readability
**観測根拠**: 現 orchestrator は 11 step / 240 行で逐次配線されている。1-PR モデル転換後は Phase 0 / Phase 1 / Phase 2 / Phase 3 / Phase 4 の 5 Phase 構造に置換される。
**推奨**: orchestrator を Phase 単位の関数（`runPhase0`、`runPhase1`、… `runPhase4`）に分割し、`runFinishOrchestrator` は Phase の sequencing と escalation 経路の集約のみを担う。各 Phase 関数は 30–60 行程度に収まる見込みで、現状 240 行が散発的な branch を持つ状態より読みやすくなる。implementer の判断で採否可（現状フラット書きでも動作は同等）。

---

## Notes

- **author-bias 維持**: 本ファイルは architect への評価入力として使用される想定。code-reviewer / security-reviewer / pattern-reviewer には渡さない（中立性維持）
- **implementer の自由度**: 本推奨は参考情報。tasks.md の指示（特に 1.3 の "store.ts または隣接 module"、3.x の Phase 構造）と矛盾しない範囲で implementer が module 配置を最終決定する
