# CommitOrchestrator の逐次 / round projection を共通 projector に統合する（挙動不変）

## Meta

- **type**: refactoring
- **slug**: commit-projection-unify
- **base-branch**: main
- **pipeline**: standard
- **adr**: false

## 背景

`src/core/step/commit-orchestrator.ts` の `commitRound` が、逐次経路 `commitSuccess` / `commitSkipped` / `commitHalt` の projection（`pushStepResult` / history append / usage `appendInvocation` / lineage `appendLineage` / `verdict:parsed` emit）を "mirrors commit\*" / "matches commit\*" コメント付きで複製している。逐次は step ごとに persist+emit を inline で行い、round は全 member を in-memory fold して単一 persist + post-persist で effect をまとめる差異がある。projection の核（state→state の写像）と post-persist effect を共通化し、両経路が同一 projector を共有する形にする。挙動は変えない。

## 現状コードの前提

- `commit-orchestrator.ts:140-259` `commitSuccess`: `pushStepResult`(success) → `{step}-verdict` history → branch/pullRequest 反映 → usage → `store.persist` → lineage → `verdict:parsed` emit（step ごとに persist）。
- `commit-orchestrator.ts:266-302` `commitSkipped`: `pushStepResult`(skipped) → `{step}-skipped` history → `verdict:parsed` emit → `store.persist`。
- `commit-orchestrator.ts:312-` `commitHalt`: `recordFailedStepResult` →（failed: `store.fail` / awaiting-resume: `transitionJob`+`appendInterruption`）→ history → `store.persist` → rethrow（`Promise<never>`）。
- `commit-orchestrator.ts:379-573` `commitRound`: member を in-memory fold（success: `pushStepResult`+`{step}-started` history+`{step}-verdict` history; skipped: `pushStepResult`+`{step}-started`+`{step}-skipped` history; halt: `recordFailedStepResult`+`halt.history`）→ coordinator patch（`reviewerStatuses` / coordinator `StepRun` / `error` / `updatedAt`）→ **単一** `store.persist` → post-persist loop（usage / lineage / `verdict:parsed`）。
- "mirrors commit\*" / "matches commit\*" コメントは `commit-orchestrator.ts:405, 428, 439, 459, 507, 523, 553, 564` 付近に分散。
- 保持すべき差異:
  - round のみ member ごとに `{step}-started` history を付与する（逐次は `begin()` が付与するため commitSuccess/Skipped には無い）。
  - round は単一 persist・post-persist batch（逐次は inline persist+emit）。
  - halt は round では `recordFailedStepResult` のみ（`store.fail` / `transitionJob` を呼ばない）。

## 要件

1. step 成功 / skip の **in-memory projection**（`pushStepResult` + 対応 history append）を純粋関数 projector として抽出し、`commitSuccess` / `commitSkipped` と `commitRound` の fold が同一 projector を共有する。
2. **post-persist effect**（usage `appendInvocation` / lineage `appendLineage` / `verdict:parsed` emit）を共通ヘルパへ抽出し、逐次と round が共有する。
3. "mirrors commit\*" / "matches commit\*" の複製コメントと重複ロジックを除去する。
4. 逐次 / round の差異（round のみ `{step}-started` history、round は単一 persist・post-persist batch、halt は `recordFailedStepResult` のみ）は projector の**合成点で明示的に扱い**、振る舞いを変えない。

## スコープ外（越えたら別 request）

- persist 回数（逐次: step ごと / round: 単一）を変えない。
- halt の lifecycle（failed transition / awaiting-resume）を変えない。
- B-13（単一 persist point）/ B-14（halt application locality）の不変を変えない。
- coordinator patch（`reviewerStatuses` / `error` / `updatedAt`）の内容を変えない。
- `architecture/` には触れない。

## 受け入れ基準（機械検証可能な構造 gate を必須）

- [ ] **構造 gate test（新規・必須）**: `commit-orchestrator.ts` のソースに "mirrors commit" / "matches commit" 文字列が **0 件**であることを grep で検査する test を追加し green にする。加えて、共通 projector シンボルが逐次経路（`commitSuccess`/`commitSkipped`）と round 経路（`commitRound`）の**両方から参照される**ことを検査する。行移動だけで緑になる失敗類型をこの構造 assertion で塞ぐ。
- [ ] B-13 / B-14 の architecture test が green のまま。
- [ ] 既存テストの期待振る舞いを書き換えない（挙動不変）。
- [ ] `typecheck && test` が green。

## 設計判断（drift 抑止）

- projector は state と step 結果を受け新 state を返す**純粋関数**（`store` 呼び出しを含めない）。persist・emit のタイミング（逐次 inline / round batch）は呼び出し側が制御する。
- `{step}-started` history は round 専用の合成として projector の**外**で付与する（逐次は `begin()` が担う現状を維持）。
