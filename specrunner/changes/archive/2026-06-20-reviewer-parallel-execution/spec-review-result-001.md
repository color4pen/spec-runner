# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Consistency | `tasks.md` T-05 / `design.md` D5 | `buildParallelReviewerTransitions` に `coordinator skipped → regression-gate` 行が含まれているが、D5 の aggregate verdict 定義は `approved \| needs-fix \| escalation` の三択で `skipped` を含まない。全 member が activation-skipped の場合も aggregate は `approved`（D5: "全 member が approved または skipped → aggregate = approved"）となるため、この遷移行は発火しない dead-code になる。`spec.md` にも該当シナリオが無い。 | T-05 から `coordinator skipped → regression-gate` 行を削除するか、全 member が activation-skipped のとき coordinator が `skipped` を出すケースを D5 に明示して spec.md にシナリオを追加する。どちらでも動作は同一だが、前者が実装上クリーン。 |
| 2 | MEDIUM | Underspecification | `tasks.md` T-08 / `design.md` D3 | `mergeParallelReviewerStates(base, results)` が merge する対象を "member の steps[member] と history delta" と記述しているが、top-level の cursor フィールド（`status`, `error`, `step`, `pid`, `updatedAt`, `decisions`）に対する merge 規則が未定義。並列 member の一つが exception → `store.fail()` を経由して `state.status = "failed"` になった場合、エンジン側が status を "running" に戻す処理が必要だが spec / tasks に明示がない。"step/status などの cursor は engine 側で決定的に設定" の一文だけでは実装者が判断を要する。 | merge 関数の contract を tasks.md に追記する: "merge 後 engine は `state.status = base.status`（= "running"）、`state.step = coordinator` を上書きし、step cursor と error フィールドをリセットする。rejected member の `err.state.steps[member]` と history delta は merge し、aggregate verdict が escalation になる" を明示する。 |
| 3 | MEDIUM | Implementation risk | `src/core/pipeline/pipeline.ts` `runInternal` / `tasks.md` T-08 | `runInternal` の while ループは L195 で `steps.get(currentStep)` を呼び、未登録なら即 throw する。coordinator は steps map 外の仮想ノードなので T-08 "steps.get の前に検出" が必要だが、L201-219 の loop bookkeeping（`loopIters` 増分・history append）は steps.get の後で行われるため coordinator 分岐がそれらを迂回してしまう。T-08 の "既存の遷移ルックアップ / loop bookkeeping / exhaustion へ合流する" は正しい方向だが、実際には coordinator ブランチが loop bookkeeping をバイパスしないよう while ループの構造を明示的に再設計しないと coordinator の `loopIters` が正しくカウントされず、exhaust 判定が機能しない。 | tasks.md T-08 に while ループの変更箇所を明記する: "coordinator 検出は steps.get の前（L195 直前）に配置し、steps.get / executor.execute を coordinator 固有の fan-out で置き換える。ただし loop bookkeeping（L201-219）と出口の遷移 / exhaustion ロジックは coordinator にも適用されるよう、検出分岐は 'execute フェーズのみ' を置き換える構造にする"。実装上は `const isCoordinator = currentStep === this.parallelReview?.coordinator` フラグを L195 直前に立て、`if (!isCoordinator)` ガードで steps.get / execute の両ブロックをラップし、coordinator 用 fan-out を else ブランチに置く形が最小変更。 |
| 4 | LOW | Edge-case gap | `spec.md` / `design.md` D6 | `activationPaths` が undefined（paths 指定なし）かつ `requestTypes` だけで activate した reviewer は、fixer 後に常に pending に戻る（D6: "paths 未定義は常に pending"）。これは正しいが、requestType が変わらない job の中で fixer が全く無関係なファイルを変更しても再 review される。このケースは Risks に記載されているが spec.md にシナリオが無い。 | 既存 Risks 欄（design.md "invalidation の過剰発火"）で説明が十分なため spec.md への追加は任意。実装時コメントで "requestTypes-only reviewer（no paths）は fixer 後に常に再 review" と明記するだけで可。 |
| 5 | LOW | Observability | `design.md` D3 / `tasks.md` T-08 | 並列ラウンドの history entries は "completion 順に concat"（design.md D3）されるため、同一ラウンドで走った reviewer A と B の history が時系列では交錯しない可能性がある。`job show` 等で history を読む際に「どのエントリがどの reviewer のものか」が分かりにくい。 | 各 parallel member の history delta に reviewer 名プレフィックスを付けるか（例: `[reviewer-a] verification passed`）、またはラウンド単位の boundary エントリを merge 後に挿入して視認性を高める。必須ではないが future PR で検討。 |
