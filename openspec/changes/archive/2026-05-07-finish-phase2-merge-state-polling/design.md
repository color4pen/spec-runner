## Context

`specrunner finish` は Phase 2 で `git push origin <branch>` を実行した後、Phase 3 で `gh pr merge --squash` を呼ぶ。push によって PR の HEAD SHA が変わると、GitHub は mergeability を非同期で再計算する。再計算中に merge を試みると「Base branch was modified」エラーで失敗する。

現在の実装は orchestrator.ts:194 で `fetchPrViewWithRetry` を再利用しているが、この関数は Phase 0 preflight 用に設計されており、retry 条件が `mergeStateStatus === "UNKNOWN"` のみ。push 後は BEHIND → CLEAN 等の遷移もあり得るため、UNKNOWN 以外も retry 対象にする必要がある。

## Goals / Non-Goals

**Goals:**

1. Phase 2 push 後に mergeStateStatus が CLEAN になるまで polling する
2. push 直後の merge 失敗を防ぐ
3. cli-finish-command spec に Phase 2→3 間の polling 要件を追加する

**Non-Goals:**

- Phase 0 preflight の `fetchPrViewWithRetry` の変更（既存動作を維持）
- merge 失敗時の自動リトライ（Phase 3 の責務）

## Decisions

### D1. Phase 0 用関数とは別に post-push 専用 polling 関数を新設する

**Decision**: `pollMergeStateAfterPush` を `preflight.ts` に新設し、orchestrator.ts から呼ぶ。

**Rationale**: Phase 0 の `fetchPrViewWithRetry` とは要件が異なる:
- retry 条件: UNKNOWN のみ vs. 非 CLEAN すべて
- 上限到達時: escalation vs. 現在の state で続行
- retry 回数: 3 vs. 5

mode パラメータで切り替えるより、別関数にした方が SRP を保ち、テストも独立して書ける。

**Alternatives considered**:
A. `fetchPrViewWithRetry` に `mode: "preflight" | "post-push"` パラメータを追加 → 条件分岐が複雑になり既存テストに影響
B. orchestrator.ts にインライン実装 → retry ロジックの重複

### D2. retry 条件: `mergeStateStatus !== "CLEAN"` の間は retry する

**Decision**: UNKNOWN / BEHIND / DIRTY / BLOCKED / PENDING / HAS_HOOKS / UNSTABLE すべてを retry 対象にする。CLEAN 以外はすべて「GitHub が計算中か、push の反映待ち」と解釈する。

**Rationale**: push 直後の mergeStateStatus は GitHub の内部処理に依存し、どの中間状態を経由するか予測できない。CLEAN だけを成功条件にするのが最も安全。

### D3. retry 上限到達時は escalation せず続行する

**Decision**: 5 回 retry 後も非 CLEAN の場合、現在の mergeStateStatus で Phase 3 に進む。

**Rationale**: mergeStateStatus が CLEAN でなくても merge が成功するケースがある（GitHub API の eventual consistency）。escalation すると finish が中断し、ユーザーに再実行を強いる。Phase 3 の `gh pr merge` が失敗すれば、そこで escalation される。

### D4. 関数の配置は preflight.ts

**Decision**: `pollMergeStateAfterPush` を `preflight.ts` に配置し、`fetchPrViewWithRetryForTest` と同様に named export する。

**Rationale**: `gh pr view` の呼び出しと retry ロジックは preflight.ts に集約されている。同種の polling を別ファイルに分散させると凝集度が下がる。

### D5. 定数は関数スコープではなくモジュールスコープに定義

**Decision**: `POST_PUSH_RETRY_COUNT = 5`, `POST_PUSH_RETRY_DELAY_MS = 3000` を preflight.ts のモジュールスコープ定数として定義。

**Rationale**: 既存の `UNKNOWN_RETRY_COUNT`, `UNKNOWN_RETRY_DELAY_MS` と同じパターン。テストからの参照が必要になった場合も export しやすい。

## Risks / Trade-offs

- **[Trade-off] 最大 15 秒の追加待ち時間** → merge 失敗で再実行するよりも全体の UX は向上する
- **[Risk] CLEAN にならないまま Phase 3 に進み merge が失敗するケース** → Phase 3 が escalation するため、ユーザーは状況を把握できる。現在と同じ挙動だが、polling により成功確率は上がる
- **[Trade-off] test-only export パターンの踏襲** → `fetchPrViewWithRetryForTest` と同じパターンで `pollMergeStateAfterPushForTest` を export する。`@internal` タグは将来対応
