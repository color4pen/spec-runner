# Design: finish-respect-branch-protection

## Context

`finish` の Phase 3 は admin token で branch protection を暗黙的に bypass して squash merge する。merge 前の gate は conflict 判定（`mergeable` = CONFLICTING、`mergeStateStatus` = DIRTY）のみで、required check 未充足（BLOCKED）や required check 失敗（UNSTABLE）を検出して止める経路が無い。CI が赤でも admin token があれば無人で merge が通る。

加えて、既マージ経路（`prAlreadyMerged` 分岐）は Phase 1（change folder archive）を skip して `markJobArchived` のみを実行するため、change folder が archive されていないのに job status だけ `archived` になる不整合が生じる。

### 現状のコード構造

| 関心事 | ファイル | 現状 |
|--------|---------|------|
| merge 前 gate（mergeStateStatus） | `src/core/finish/orchestrator.ts` `runPhase2Push` | DIRTY のみ escalation。BLOCKED / UNSTABLE は素通り |
| merge 前 gate（mergeable） | `src/core/finish/pr-status.ts` `checkMergeableForMerge` | CONFLICTING のみ escalation |
| merge 実行 + retry | `src/adapter/github/github-client.ts` `mergePullRequest` + `isMergeTransientFailure` | "required status check" を transient（retry 対象）に分類 |
| admin bypass コメント | `orchestrator.ts` L524, `github-client.ts` L375-376 | "D4: admin bypass is implicit via token permissions" |
| 既マージ経路 | `orchestrator.ts` L221-225 | Phase 1 skip → `markJobArchived` のみ |

## Goals / Non-Goals

**Goals**:

- merge gate を branch protection に委ね、admin bypass を廃止する
- `mergeStateStatus` BLOCKED / UNSTABLE を Phase 3 前に検出して escalation する
- `isMergeTransientFailure` から "required status check" の失敗ケースを分離し、pending（CI 実行中）のみ retry を維持する
- 既マージ経路で change folder archive を実行し、status と実態の一致を保証する
- doctor に merge gate 設計前提の記述を追加する

**Non-Goals**:

- GitHub App token / fine-grained PAT への移行（token 種別は変更しない）
- branch protection rule の自動設定・検出
- merge method の選択（squash 固定は変更しない）

## Decisions

### D1: mergeStateStatus BLOCKED / UNSTABLE を Phase 2 post-push poll で検出し escalation する

`pollMergeStateAfterPush`（`pr-status.ts`）で DIRTY と同様に BLOCKED / UNSTABLE を即座に return し、`runPhase2Push`（`orchestrator.ts`）で DIRTY guard と並列に BLOCKED / UNSTABLE guard を追加して escalation する。

**Rationale**: Phase 3（merge API 呼び出し）の前に止めることで、不要な merge 試行と retry を回避する。merge API レベルでの reject 検出（D2）と二重防御になるが、Phase 2 で止まる方が明快な escalation メッセージを出せる。

**Alternatives considered**:
- Phase 3 の merge API reject のみに頼る → merge API は race condition で成功することがあり、admin token がある場合は branch protection を bypass して成功してしまう。Phase 2 での pre-guard が必要。

### D2: merge API reject（405 / 409）時に branch protection hint を出す

`mergeFeaturePrPhase3`（`orchestrator.ts`）の merge 失敗メッセージに「branch protection を満たしてから再実行」という actionable hint を追加する。既存の `mergeResult.merged === false` 経路の `recommendedAction` を改善する。

**Rationale**: 現状のメッセージは generic だが、branch protection 由来の reject はユーザーに具体的な次のアクション（CI を通す / required review を取得する）を伝える必要がある。

**Alternatives considered**:
- merge API の response body を parse して branch protection 由来かを判別する → GitHub REST API の error body は安定していないため、status code ベースで十分。

### D3: isMergeTransientFailure の "required status check" 分類を分離する

現在 `isMergeTransientFailure` は `msg.includes("required status check")` で全 required status check メッセージを transient 扱いしている。GitHub API の 405 response message パターン:

- `Required status check "ci/build" is expected` → CI がまだ **pending**（race condition）。retry 維持が妥当。
- `Required status check "ci/build" has failed` → CI が **失敗**。retry しても変わらない。

"is expected"（pending）は retry 維持し、"has failed" は retry せず escalation する。"required status check" で始まるがどちらにも該当しない未知パターンは安全側に倒して retry しない（escalation）。

**Rationale**: CI 失敗状態で retry を繰り返しても merge は成功しない。`maxAttempts`（4 回）× backoff の無駄な待機を排除する。

**Alternatives considered**:
- "required status check" を全て permanent にする → pending 状態の race condition で merge が通らなくなるケースが増える。expected（pending）のみ retry を維持するのが適切。

### D4: admin bypass コメント・実装の解消

`orchestrator.ts` と `github-client.ts` の "D4: admin bypass" 関連コメントを削除し、merge は branch protection 充足に依存する前提に書き換える。コード変更は不要（REST API `PUT /repos/{owner}/{repo}/pulls/{prNumber}/merge` は token 権限が admin なら暗黙 bypass するが、それはユーザーの token 設定の問題であり、specrunner 側で admin bypass を意図するコメント・設計を持たない）。

**Rationale**: 実装の intent を変える。admin token を持っていても specrunner は branch protection を尊重する（D1 で pre-guard する）。

### D5: 既マージ経路で change folder archive を実行する

`prAlreadyMerged` 分岐で現在 skip している Phase 1（archive）を実行する。ただし git push は不要（PR は既にマージ済み）なので、archive commit + push は main branch 上で行う。

具体的フロー:
1. change folder が存在する → archive 移動を実行 → 成功したら `markJobArchived`
2. change folder が存在しない → archive 対象なし → `markJobArchived`（正常）
3. archive 移動が失敗 → `markJobArchived` を呼ばず escalation

**Rationale**: `archived` status は archive 完了を含意する。archive なしに status だけ更新すると、後続の整合性検証で矛盾が生じる。

**Alternatives considered**:
- 既マージ経路では archive をスキップし、別コマンドで後始末 → 状態の不整合が長期間残る。finish コマンド内で完結させる方が単純。

### D6: doctor に merge gate 設計前提を記述する

`src/core/doctor/checks/auth/github-token-valid.ts` の pass メッセージに merge gate 前提は書かない（doctor check の責務外）。代わりに `specrunner/changes/<slug>/rules.md` の System Facts セクション、および将来的な `specrunner doctor` の出力に merge gate 設計前提を記載する。

具体的には rules.md の System Facts に「merge gate はプロジェクトの branch protection で構成する。specrunner は admin bypass を行わない」を追記する。

**Rationale**: doctor check は token の有効性を検証するもので、merge 権限の設計方針を伝える場ではない。rules.md は全 agent が参照するため、設計前提の伝達に最適。

**Alternatives considered**:
- doctor に新しい check を追加して branch protection 設定を検証 → GitHub API で branch protection rule の取得には admin 権限が必要で、least-privilege に反する。

## Risks / Trade-offs

- **[Risk]** BLOCKED / UNSTABLE 検出により、branch protection 未設定のリポジトリでも `mergeStateStatus` が一時的に BLOCKED になる race condition で false positive escalation が発生する可能性 → **Mitigation**: `pollMergeStateAfterPush` の既存 retry ロジック（5 回 × 3 秒）で一時的な BLOCKED は解消される。即座に return するのは DIRTY 同様「確定した状態」のみとし、retry exhaustion 後に BLOCKED が残っている場合に escalation する。

- **[Risk]** "required status check ... is expected" の文言が GitHub 側で変更されると pending 判定が壊れる → **Mitigation**: 未知パターンは安全側（retry しない = escalation）に倒す。ユーザーは手動 merge で回復可能。

- **[Risk]** 既マージ経路の archive 追加により、main branch への直接 commit + push が必要になる → **Mitigation**: main branch 上ではなく feature branch 上で archive 済みの場合はそのまま。main 上で archive が必要な場合は、新しい一時ブランチを作らず main 上で commit + push する（archive は specrunner 管理ファイルの移動のみで、レビュー不要）。

## Open Questions

- 既マージ経路で archive commit を push する先（feature branch は既にマージ済みで消えている可能性がある）の具体的な git 操作フロー。main への直接 push は branch protection で拒否される可能性がある。→ archive は次回の変更ブランチで commit されるか、もしくは main に直接 push できない場合は archive 移動をローカルのみにとどめ `markJobArchived` で完了とする fallback が必要。
