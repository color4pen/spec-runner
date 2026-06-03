# finish はプロジェクトの merge gate を bypass せず尊重する

## Meta

- **type**: spec-change
- **slug**: finish-respect-branch-protection
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`finish` の Phase 3（`mergeFeaturePrPhase3`, `src/core/finish/orchestrator.ts`）は admin token で branch protection を bypass して squash merge している（コメントに「D4: admin bypass is implicit via token permissions」と明記）。merge 前の gate は `checkMergeableForMerge`（`mergeable` = CONFLICTING / MERGEABLE）と `pollMergeStateAfterPush`（`mergeStateStatus` = CLEAN / DIRTY）の conflict 判定のみで、required check が落ちている状態（`mergeStateStatus` = BLOCKED / UNSTABLE）を検出して止める経路が存在しない。結果として CI が赤でも admin token があれば無人で merge が通る。

加えて `finish` の既マージ経路（PR が既に MERGED の場合の `prAlreadyMerged` 分岐, `src/core/finish/orchestrator.ts`）は Phase 1（change folder の `changes/<slug>/ → changes/archive/<slug>/` 移動）を skip して `markJobArchived` のみを実行する。このため change folder が archive されていないのに job status だけ `archived` になる不整合が生じる。

## 要件

### 1. admin bypass を廃止し merge gate を尊重する

- merge 実行前に `mergeStateStatus` が BLOCKED（required check / required review 未充足）または UNSTABLE（required check 失敗）の場合は merge を試みず escalation する（現状の CONFLICTING 同様の扱い）。
- merge API が branch protection 由来で reject した場合、admin で再試行せず escalation し、「branch protection を満たしてから再実行せよ」という actionable な hint を出す。squash merge の REST API が branch protection で拒否される際の status は 405 / 409（`mergePullRequest` port contract は 405 / 409 / 403 / 423 を surface し 422 は返さない — `src/core/port/github-client.ts`, `src/adapter/github/github-client.ts`）。
- `isMergeTransientFailure`（`src/adapter/github/github-client.ts`）の "required status check" 分類を見直す。CI 実行中の race（pending）は retry を維持し、required check が失敗 / BLOCKED の状態は retry せず escalation する。

### 2. least-privilege

- 無人運用に必要な GitHub token 権限を「push + PR 作成」までと定義し、merge は branch protection 充足に委ねる。admin 権限を前提にしない。
- doctor / 関連 spec に「merge gate はプロジェクトの branch protection で構成する」前提を記述する。

### 3. `archived` は archive 完了を含意する

- 既マージ経路で change folder の archive 移動を skip したまま status を `archived` にする不整合を解消する。
- change folder の archive 移動が完了できない場合は status を `archived` にせず escalation し、status と実態（archive 済みか否か）を一致させる。
- change folder が存在しない（archive 対象が無い）場合は escalation せず正常に `archived` とする。

## 受け入れ基準

- [ ] `finish` の Phase 3 が `mergeStateStatus` BLOCKED / UNSTABLE を検出して merge せず escalation する
- [ ] branch protection 由来の merge reject（405 / 409）時に admin 再試行せず escalation し、actionable hint を出す
- [ ] `isMergeTransientFailure` の "required status check" 分類が pending（retry 維持）と failed / blocked（escalation）に分かれる
- [ ] admin 権限を前提とするコメント / 実装が解消されている
- [ ] doctor および関連 spec に merge gate 設計前提（branch protection で構成する）の記述が追加されている
- [ ] 既マージ経路で change folder が未 archive のまま status が `archived` にならない
- [ ] `bun run typecheck && bun run test` が green
