# Test Cases: reconcile-and-ps-filter

Generated from: proposal.md, design.md, tasks.md

---

## Phase 1 — reconcile モジュール

### TC-01: reconcileStaleRunning — running 以外は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.2

**GIVEN** status が `"running"` 以外（例: `"awaiting-merge"`）の JobState  
**WHEN** `reconcileStaleRunning(state)` を呼ぶ  
**THEN** `null` を返す

---

### TC-02: reconcileStaleRunning — PID が alive の場合は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.2, design.md D2

**GIVEN** status が `"running"` で `pid` が有効な（生存中の）プロセス ID を持つ JobState  
**WHEN** `reconcileStaleRunning(state)` を呼ぶ  
**THEN** `null` を返す（stale でないと判定）

---

### TC-03: reconcileStaleRunning — PID が dead の場合は TransitionResult を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.2, design.md D2

**GIVEN** status が `"running"` で `pid` が存在しないプロセス ID を持つ JobState  
**WHEN** `reconcileStaleRunning(state)` を呼ぶ  
**THEN** `TransitionResult` を返し、その `status` が `"awaiting-resume"` であり、`trigger` が `"reconcile"` で `reason` が `"stale running detected"` である

---

### TC-04: reconcileStaleRunning — PID なし + updatedAt が 15 分以内は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.2

**GIVEN** status が `"running"` で `pid` が null/undefined かつ `updatedAt` が現在時刻から 14 分以内の JobState  
**WHEN** `reconcileStaleRunning(state)` を呼ぶ  
**THEN** `null` を返す

---

### TC-05: reconcileStaleRunning — PID なし + updatedAt が 15 分超は TransitionResult を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.2

**GIVEN** status が `"running"` で `pid` が null/undefined かつ `updatedAt` が現在時刻から 16 分以上前の JobState  
**WHEN** `reconcileStaleRunning(state)` を呼ぶ  
**THEN** `TransitionResult` を返し、`status` が `"awaiting-resume"` である

---

### TC-06: reconcileStaleRunning — updatedAt がちょうど 15 分は stale 扱い（境界値）

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 4.2（境界条件）

**GIVEN** status が `"running"` で `pid` なし かつ `updatedAt` がちょうど 15 分前（STALE_THRESHOLD_MS = 900000ms）の JobState  
**WHEN** `reconcileStaleRunning(state)` を呼ぶ  
**THEN** `null` または `TransitionResult` のいずれかを返す（実装の `>` / `>=` に依存）。どちらかの一貫した動作を確認する

---

### TC-07: reconcilePrState — awaiting-merge 以外は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.3

**GIVEN** status が `"running"` など `"awaiting-merge"` 以外の JobState  
**WHEN** `reconcilePrState(state, "MERGED")` を呼ぶ  
**THEN** `null` を返す

---

### TC-08: reconcilePrState — awaiting-merge + OPEN は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.3

**GIVEN** status が `"awaiting-merge"` の JobState  
**WHEN** `reconcilePrState(state, "OPEN")` を呼ぶ  
**THEN** `null` を返す

---

### TC-09: reconcilePrState — awaiting-merge + CLOSED は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.3

**GIVEN** status が `"awaiting-merge"` の JobState  
**WHEN** `reconcilePrState(state, "CLOSED")` を呼ぶ  
**THEN** `null` を返す

---

### TC-10: reconcilePrState — awaiting-merge + MERGED は TransitionResult を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.3, 受け入れ基準

**GIVEN** status が `"awaiting-merge"` の JobState  
**WHEN** `reconcilePrState(state, "MERGED")` を呼ぶ  
**THEN** `TransitionResult` を返し、`status` が `"archived"` で `trigger` が `"reconcile"`、`reason` が `"PR merged externally"` である

---

### TC-11: reconcile モジュールの export 確認

- **Category**: correctness
- **Priority**: must
- **Source**: 受け入れ基準（reconcile.ts が reconcileStaleRunning と reconcilePrState を export する）

**GIVEN** `src/state/reconcile.ts` が存在する  
**WHEN** `import { reconcileStaleRunning, reconcilePrState } from "./reconcile.js"` を実行する  
**THEN** どちらの関数も `undefined` ではなく呼び出し可能である

---

### TC-12: isProcessAlive — EPERM は alive 扱い（権限なしプロセス）

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 1.3（EPERM handling）

**GIVEN** 別ユーザー所有のプロセス（kill 権限なし）の PID  
**WHEN** `isProcessAlive(pid)` を呼ぶ  
**THEN** `true` を返す（EPERM はプロセスが存在することを意味する）

---

### TC-13: isProcessAlive — pid <= 0 は dead 扱い

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 1.3

**GIVEN** `pid` が `0` または負の値  
**WHEN** `isProcessAlive(pid)` を呼ぶ  
**THEN** `false` を返す

---

## Phase 2 — ps --status フラグ

### TC-14: ps --status awaiting-merge でフィルタ

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.4, 受け入れ基準

**GIVEN** `awaiting-merge` のジョブ 2 件と `running` のジョブ 1 件が存在する  
**WHEN** `runPs({ status: "awaiting-merge" })` を実行する  
**THEN** 出力に `awaiting-merge` のジョブ 2 件のみ含まれ、`running` のジョブは含まれない

---

### TC-15: ps --status archived でフィルタ

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.4, 受け入れ基準

**GIVEN** `archived` のジョブ 1 件と `running` のジョブ 1 件が存在する  
**WHEN** `runPs({ status: "archived" })` を実行する  
**THEN** 出力に `archived` のジョブのみ含まれる

---

### TC-16: ps --status が --active より優先される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.4, design.md D6

**GIVEN** `awaiting-merge` のジョブと `running` のジョブが混在する  
**WHEN** `runPs({ status: "awaiting-merge", active: true })` を実行する  
**THEN** `awaiting-merge` のジョブのみ表示される（`--active` の効果は無視される）

---

### TC-17: ps --status が --all より優先される

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.4, design.md D6

**GIVEN** `archived` を含む複数 status のジョブが存在する  
**WHEN** `runPs({ status: "running", all: true })` を実行する  
**THEN** `running` のジョブのみ表示される（`--all` の効果は無視される）

---

### TC-18: ps --status に無効な値を渡すとエラー

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.4, design.md D3

**GIVEN** flag-parser に `--status foo` を渡す  
**WHEN** コマンドラインをパースする  
**THEN** flag-parser がエラーを返す（`values` 制約に引っかかる）

---

### TC-19: ps デフォルト（引数なし）は archived を除外

- **Category**: correctness
- **Priority**: must
- **Source**: proposal.md（後方互換）

**GIVEN** `archived` のジョブと `running` のジョブが存在する  
**WHEN** `runPs({})` を実行する（引数なし）  
**THEN** `running` のジョブは表示され、`archived` のジョブは表示されない

---

### TC-20: ps --all は archived を含む全ジョブを表示

- **Category**: correctness
- **Priority**: must
- **Source**: proposal.md, 受け入れ基準

**GIVEN** `archived` のジョブと `running` のジョブが存在する  
**WHEN** `runPs({ all: true })` を実行する  
**THEN** `archived` のジョブも `running` のジョブも両方表示される

---

### TC-21: ps --status で該当ジョブが 0 件の場合

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 4.4（edge case）

**GIVEN** `failed` のジョブが 0 件の状態  
**WHEN** `runPs({ status: "failed" })` を実行する  
**THEN** ジョブ一覧が空（0 行）で表示され、エラーにならない

---

### TC-22: ps USAGE に --status オプションが記載されている

- **Category**: maintainability
- **Priority**: should
- **Source**: tasks.md 2.3

**GIVEN** `specrunner ps --help` を実行する  
**WHEN** 出力を確認する  
**THEN** `--status=<status>` と有効な status 値の一覧が `Ps Options` セクションに含まれる

---

## Phase 3 — ps PR hint 表示

### TC-23: awaiting-merge ジョブで PR がマージ済みなら hint を表示

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.5, 受け入れ基準

**GIVEN** `formatJobRow` を `prMerged: true` で呼ぶ  
**WHEN** 出力文字列を確認する  
**THEN** STATUS 列に `"awaiting-merge (PR merged, run finish)"` が含まれる

---

### TC-24: prMerged が false の場合は通常表示

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.5

**GIVEN** `formatJobRow` を `prMerged: false` で呼ぶ  
**WHEN** 出力文字列を確認する  
**THEN** STATUS 列に `"(PR merged, run finish)"` が含まれない（通常の `"awaiting-merge"` が表示される）

---

### TC-25: prMerged が undefined の場合は通常表示

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 4.5

**GIVEN** `formatJobRow` を `prMerged` 引数なしで呼ぶ  
**WHEN** 出力文字列を確認する  
**THEN** STATUS 列に `"(PR merged, run finish)"` が含まれない

---

### TC-26: checkPrMerged — pullRequest がない場合は null を返す

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 3.1

**GIVEN** `pullRequest` フィールドが存在しない（または null の）JobState  
**WHEN** `checkPrMerged(job)` を呼ぶ  
**THEN** `null` を返す（gh CLI を実行しない）

---

### TC-27: checkPrMerged — gh CLI がない場合は null を返す（エラーにならない）

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 3.1, 受け入れ基準（gh CLI がない環境でもエラーにならない）

**GIVEN** `pullRequest` を持つ JobState で `gh` コマンドが PATH に存在しない環境  
**WHEN** `checkPrMerged(job)` を呼ぶ  
**THEN** 例外を throw せずに `null` を返す

---

### TC-28: checkPrMerged — gh pr view が MERGED を返す場合は true

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 3.1

**GIVEN** `pullRequest.number` と `repository.owner/name` を持つ JobState で `gh pr view` が `"MERGED"` を返す  
**WHEN** `checkPrMerged(job)` を呼ぶ  
**THEN** `true` を返す

---

### TC-29: checkPrMerged — gh pr view が OPEN を返す場合は false

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 3.1（暗黙の非 MERGED ケース）

**GIVEN** `gh pr view` が `"OPEN"` を返す  
**WHEN** `checkPrMerged(job)` を呼ぶ  
**THEN** `false` を返す

---

### TC-30: checkPrMerged — gh pr view が非 0 終了コードの場合は null を返す

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 3.1

**GIVEN** `gh pr view` がエラー終了コードを返す（例: PR が存在しない）  
**WHEN** `checkPrMerged(job)` を呼ぶ  
**THEN** 例外を throw せずに `null` を返す

---

### TC-31: ps 実行時に awaiting-merge ジョブのみ PR チェックが走る

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md 3.2, design.md D4（rate limit 最小化）

**GIVEN** `running` のジョブ 1 件と `awaiting-merge` のジョブ 1 件が存在する  
**WHEN** `runPs({})` を実行する  
**THEN** `gh pr view` は `awaiting-merge` のジョブに対してのみ呼ばれ、`running` のジョブには呼ばれない

---

### TC-32: ps は PR hint 表示後に自動 state 変更しない

- **Category**: correctness
- **Priority**: must
- **Source**: design.md D5, request.md スコープ外

**GIVEN** `awaiting-merge` のジョブで PR が MERGED の状態  
**WHEN** `runPs({})` を実行する  
**THEN** ジョブの status ファイルは変更されず、`"awaiting-merge"` のまま（`(PR merged, run finish)` は表示のみ）

---

## Phase 4 — 型安全性・ビルド

### TC-33: typecheck が green

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 5.1, 受け入れ基準

**GIVEN** 実装完了後の codebase  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-34: テストスイートが green

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md 5.2, 受け入れ基準

**GIVEN** 実装完了後の codebase  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS する（既存テストに regression がない）

---

### TC-35: reconcile.ts が state → core 方向の import をしない

- **Category**: architecture
- **Priority**: should
- **Source**: design.md D2（module-boundary）

**GIVEN** `src/state/reconcile.ts`  
**WHEN** import 文を確認する  
**THEN** `src/core/` 以下のモジュールを import していない（`isStaleRunning` は inline されている）

---

## 後方互換性

### TC-36: 既存の ps --active 動作が変わらない

- **Category**: correctness
- **Priority**: must
- **Source**: proposal.md（後方互換）

**GIVEN** 複数 status のジョブが存在する  
**WHEN** `runPs({ active: true })` を実行する  
**THEN** `ACTIVE_STATUSES` に含まれるジョブのみ表示される（変更前と同じ動作）

---

### TC-37: --status と他フラグを組み合わせてもクラッシュしない

- **Category**: correctness
- **Priority**: should
- **Source**: design.md D6（フラグ優先度）

**GIVEN** `--status running --all` を同時に指定する  
**WHEN** `runPs({ status: "running", all: true })` を実行する  
**THEN** クラッシュせず `running` のジョブのみ表示される
