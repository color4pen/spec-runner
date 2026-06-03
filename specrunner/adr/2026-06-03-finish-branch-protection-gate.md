# ADR-20260603: finish は admin bypass をせず branch protection を尊重する

## ステータス

accepted

## コンテキスト

`finish` の 1-PR モデル（[ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md)）は、Phase 3 の squash merge を admin token で branch protection を暗黙的に bypass する設計を含んでいた。merge 前 gate は conflict 判定（`mergeable` = CONFLICTING、`mergeStateStatus` = DIRTY）のみで、required check 未充足（BLOCKED）や required check 失敗（UNSTABLE）を検出して止める経路がなかった。CI が赤でも admin token があれば無人で merge が通ってしまう。

また 1-PR モデルには `--force` フラグが存在し、`OPEN_CHECKS_FAILING` 状態の PR を `--admin` 付き merge で通す抜け道として設計上定義されていた。

加えて、既マージ経路（PR が既に MERGED の場合の `prAlreadyMerged` 分岐）は Phase 1（change folder の archive 移動）を skip して `markJobArchived` のみを実行するため、change folder が archive されていないのに job status だけ `archived` になる不整合が生じていた。

## 決定

### D1: BLOCKED / UNSTABLE を Phase 2 post-push polling で検出して escalation する

`pollMergeStateAfterPush`（`pr-status.ts`）で DIRTY と同様に BLOCKED / UNSTABLE を即座に return し、`runPhase2Push`（`orchestrator.ts`）で escalation する。

**採用理由**: Phase 3（merge API 呼び出し）の前に止めることで不要な merge 試行と retry を回避する。admin token があれば BLOCKED のまま merge API が成功してしまうため、merge API レベルでの reject に頼るより Phase 2 pre-guard の方が確実。

**却下案**:
- Phase 3 の merge API reject のみに頼る → admin token がある場合は branch protection を bypass して成功してしまい、pre-guard が必要

### D2: merge API reject（merged:false）時に branch protection hint を出す

`mergeFeaturePrPhase3`（`orchestrator.ts`）の `merged === false` 経路の `recommendedAction` に「branch protection を満たしてから再実行」という actionable hint を追加する。

**採用理由**: D1 で事前に止めても、race condition 等で merge API まで進んで reject される場合がある。その際のメッセージを具体的にすることでユーザーの次アクション（CI を通す / required review を取得する）が明確になる。

**却下案**:
- merge API の response body を parse して branch protection 由来かを判別する → GitHub REST API の error body は安定していないため status code ベースで十分

### D3: `isMergeTransientFailure` の "required status check" 分類を pending と failed に分離する

現状は `msg.includes("required status check")` で全パターンを transient（retry 対象）に分類していた。GitHub API の 405 response message を観察すると:

- `"Required status check \"...\" is expected"` → CI が pending（race condition）。retry 維持が妥当
- `"Required status check \"...\" has failed"` → CI が失敗。retry しても変わらない

"is expected"（pending）は retry 維持し、"has failed" は permanent（escalation）とする。どちらにも該当しない未知パターンは安全側に倒して permanent とする。

**採用理由**: CI 失敗状態で retry を繰り返しても merge は成功しない。`maxAttempts`（4 回）× backoff の無駄な待機を排除する。

**却下案**:
- "required status check" 全てを permanent にする → pending 状態の race condition で merge が通らないケースが増える

### D4: `--force` フラグと admin bypass を廃止する

`--force` フラグ（`FinishFlags.force`）を CLI / types / orchestrator から完全削除し、"admin bypass" を意図するコメントを解消する。merge は branch protection 充足に委ねる。

**採用理由**: `--force` は admin bypass 経路として設計されていたが、orchestrator で `flags.force` を参照する実装が存在せず dead code だった。least-privilege 原則として、specrunner に admin 権限を前提とする設計を持たせない。

**却下案**:
- `--force` を残して help text だけ書き換える → admin bypass を意図するインターフェースが残存し、ユーザーに誤解を与える

### D5: 既マージ経路（`prAlreadyMerged`）で change folder archive を実行してから `markJobArchived` を呼ぶ

`prAlreadyMerged` 分岐で skip していた change folder archive を実行する。

具体的フロー:
1. change folder が存在する → archive 移動を実行 → 成功したら `markJobArchived`
2. change folder が存在しない → archive 対象なし → `markJobArchived`（正常）
3. archive 移動が失敗 → `markJobArchived` を呼ばず escalation

**採用理由**: `archived` status は archive 完了を含意する。archive なしに status だけ更新すると後続の整合性検証で矛盾が生じる。finish コマンド内で完結させる方が単純。

**却下案**:
- 既マージ経路では archive をスキップし、別コマンドで後始末 → 状態の不整合が長期間残る

### D6: merge gate 設計前提を `rules.md` の System Facts に記述する

`specrunner/changes/<slug>/rules.md` の System Facts セクションに「merge gate はプロジェクトの branch protection で構成する。specrunner は admin bypass を行わない」を追記する。

**採用理由**: rules.md は全 agent が参照するため、設計前提の伝達に最適。doctor check は token の有効性を検証するもので merge 権限の設計方針を伝える場ではない。

**却下案**:
- doctor に新しい check を追加して branch protection 設定を検証する → GitHub API で branch protection rule の取得には admin 権限が必要で least-privilege に反する

## 検討した代替案

### A1: branch protection bypass を `--force` オプションとして明示的に残す

specrunner が admin 権限を持つ場合に限り `--force` で bypass を許可する案。

- **Pros**: 緊急時の脱出ルートとして機能する可能性がある
- **Cons**: admin bypass を意図するインターフェースが残存する。実装上 `flags.force` は orchestrator で参照されておらず dead code であり、機能保証なしに誤解を与えるだけ
- **Why not**: least-privilege 原則として specrunner は branch protection を尊重する設計に一本化する。緊急時は GitHub 上で手動 merge すればよい

### A2: BLOCKED / UNSTABLE を Phase 3 後の merge API reject でのみ検出する

Phase 2 の pre-guard を設けず、merge API の reject（405 / 409）だけで分岐する案。

- **Pros**: 実装変更が少ない
- **Cons**: admin token を持つ環境では BLOCKED のまま merge API が成功してしまう。pre-guard で止める方が確実かつ escalation メッセージが明快
- **Why not**: D1 と D2 を二重防御として両立させる

### A3: 既マージ経路では archive を skip して `archived` status にする（現状維持）

archive 操作は finish の正常経路（Phase 1）で完了しているはずであり、`prAlreadyMerged` は replay ケースなので archive 不要とする案。

- **Pros**: コード変更が不要
- **Cons**: `prAlreadyMerged` は Phase 1 完了前に PR が外部から merge された場合にも到達する。この場合 change folder が archive されていないのに `archived` になる
- **Why not**: `archived` status は archive 完了を含意するという不変条件を守るため D5 を採用する

## 影響

### Positive

- CI が赤・required review 未充足の PR が無人で merge されなくなる
- least-privilege 原則に沿い、admin token を前提としない運用が可能になる
- `archived` status が archive 完了を確実に含意する
- `isMergeTransientFailure` の pending/failed 分離により、CI 失敗時の無駄な retry backoff がなくなる

### Negative

- BLOCKED / UNSTABLE 検出により、branch protection 未設定でも `mergeStateStatus` が一時的に BLOCKED になる race condition で false positive escalation が発生する可能性がある（`pollMergeStateAfterPush` の既存 retry ロジック 5 回 × 3 秒で緩和）
- "required status check ... is expected" の文言が GitHub 側で変更されると pending 判定が壊れる（未知パターンは安全側 = escalation にフォールバックするため回復可能）

### Known Debt

- 既マージ経路での archive commit を main に push する際、main branch に branch protection が設定されている場合は直接 push が拒否される可能性がある。現実装は archive 移動をローカル + git commit + push する。main への直接 push が拒否される環境では escalation が発生し手動対応が必要

## 参照

- Request: `specrunner/changes/finish-respect-branch-protection/request.md`
- Design: `specrunner/changes/finish-respect-branch-protection/design.md`
- Related: [ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) — 1-PR モデルと `--force` / admin merge の元設計
- Related: [ADR-20260501-cli-finish-command](2026-05-01-cli-finish-command.md) — escalation philosophy（D3）の確立
