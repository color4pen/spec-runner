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
| 1 | LOW | Completeness | tasks.md / T-09 | dead-pid 分岐を T-09（LocalRuntime 結合テスト）でカバーせず T-07（注入ユニットテスト）に委ねる判断は設計上明示されているが、T-09 の acceptance criteria にその旨の注釈がない。将来の担当者が「dead-pid ケースを T-09 に追加すべきか」を迷う可能性がある。 | T-09 の acceptance criteria に「dead-pid 分岐は T-07 の isAlive 注入テストで決定的に固定済みのため本テストではカバーしない」旨を明記するか、設計書 D3 の注記をそのまま参照する一行を追加する。実装ブロッカーではない。 |
| 2 | LOW | Security | design.md / D3, tasks.md / T-02 | `livenessJsonPath(slug)` 経由で slug がファイルパスに展開される。既存の `writeLivenessSidecar` も同パターンを使用しており新規攻撃面ではないが、slug のパストラバーサル耐性について spec 上の言及がない。 | スコープ外として明示するか、T-02 の import 制限に「slug のパストラバーサル検証は既存の request.md パーサーが保証する（`ParsedRequest.slug: string` は非 null で validated）」旨を注記する。実装ブロッカーではない。 |

## 検証サマリ

### コード参照の整合性（実コードで確認済み）

| 参照 | 確認結果 |
|------|----------|
| `src/core/command/pipeline-run.ts:66` — `const slug = request.slug` | ✓ `ParsedRequest.slug: string`（非 null） |
| `src/core/command/pipeline-run.ts:77` — `requestSlug` は null になり得る | ✓ canonical-path 由来で null あり。D1 の根拠と整合 |
| `src/core/command/pipeline-run.ts:122` — `bootstrapJob` 呼び出し位置 | ✓ 確認。preflight スロットに guard を差し込める |
| `src/core/runtime/local.ts:784` — `writeLivenessSidecar` 上書き書き込み | ✓ slug 単位・jobId 非依存 |
| `src/core/resume/safety.ts:13` — `isProcessAlive` | ✓ `process.kill(pid, 0)` による実装 |
| `src/util/paths.ts:299` — `livenessJsonPath` | ✓ 存在確認 |
| `src/core/port/runtime-strategy.ts:421` — `RealRuntimeStrategy` 交差型 | ✓ `canDeriveChangedFiles` の optional/required パターンが確立済み |
| `src/errors.ts:79` — `WORKTREE_GUARD: ARG_ERROR(2)` | ✓ 同型の exitCode 扱いとして参照可 |
| `tests/unit/architecture/core-invariants.test.ts:931` — B-11 pin | ✓ 存在確認。RealRuntimeStrategy を使わない bare implements を検出する |

### 設計の評価

- **ガード配置（D1）**: `bootstrapJob` 直前の preflight スロットが正しい。state 未生成での早期拒否パターンは既存の reviewer validation / capability gate と同一の設計思想。
- **Port seam（D2）**: optional-on-port + required-on-RealRuntimeStrategy の二段構成は `canDeriveChangedFiles` で実証済みのパターンに忠実に従っている。既存テスト fake が無変更で green を維持できる根拠として十分。
- **Injectable helper（D3）**: `deps` 注入で `isAlive` を差し替えられる構造により、dead-pid ブランチを実プロセスに依存せず決定的にテスト可能。要件 3（isProcessAlive 再利用）と整合。
- **判定条件（D4）**: 不在・JSON 破損・pid 欠如・stale を全て「許容」に倒す設計は既存 stale-running / resume の挙動と整合し、false negative（ガードすべき live job を見逃す）が発生しない。
- **エラー設計（D5）**: `DUPLICATE_LIVE_JOB` の exitCode を `ARG_ERROR(2)` にすることで、自動化スクリプトが「ユーザー操作が必要な前提エラー」として検出できる。
- **TOCTOU**: 言及されているリスクは実質的で、2 回の CLI 起動の間隔（数秒以上）を考慮すると誤検知の窓は無視できる範囲。既存 isProcessAlive 使用箇所と同等の既知の限界として扱うのは妥当。
- **セキュリティ**: ガードが読む sidecar は `writeLivenessSidecar` が既に書いているパス・スキーマと同一。新規の攻撃面なし。JSON の読み取りはエラー時に許容フォールスルーするため crash への悪用不可。

### テスト計画の評価

T-07（helper unit）/ T-08（call-site integration）/ T-09（LocalRuntime integration）の三層構成は適切。T-08 で optional-call (`?.`) による既存 fake への非影響を直接固定する点は特に重要で、設計の非破壊性を回帰テストレベルで保証している。
