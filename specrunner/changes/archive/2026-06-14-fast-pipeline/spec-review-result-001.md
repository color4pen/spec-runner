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
| 1 | MEDIUM | Spec Coverage | spec.md | `conformance needs-fix:spec-fixer → escalate` のシナリオが spec.md に明示されていない。fast には spec-fixer がなく、この verdict は `pipeline.ts:298` の fallback `?? "escalate"` でエスカレーションされる重要な安全境界だが、spec.md のシナリオ群には登場しない。design.md D2 と tasks.md T-02 では明示されているので実装は正しく進むが、機械可読な behavioral contract として spec.md で固定されていない。 | spec.md に「conformance が `needs-fix:spec-fixer` を返したとき、`fast` の遷移テーブルに一致行がなく escalate になる」シナリオを追加するか、tasks.md T-02 の AC に既存の「行が無い → escalate」を spec.md 参照として明記する。実装ブロックではない（tasks.md で固定済み）ため、次回 spec 更新機会に対処してもよい。 |
| 2 | LOW | Stale Comment | tests/unit/core/command/pipeline-run-gate.test.ts | `afterEach` 内のコメント「production registry stays at 2 entries」は fast 追加後に 3 になり stale になる。テスト assertion は cardinality を固定していないため green は維持されるが、コメントが誤情報になる。 | T-07（または T-08）のスコープで「production registry stays at 3 entries」へ更新する。実装ブロックなし。 |

## 検証サマリ

### 依存関係の整合性

- `#693 pipeline-selection-capability-gate` がマージ済みであることを前提とする宣言（request.md 背景）と、コード実態（`runtime-capability-gate.ts` 実装済み、`assertRuntimeSupportsScope` 存在確認済み）が一致。 ✓
- `#689 scope-exceeded-escalation` の `computeExtraScopeFindings` / `deriveScopeBreach` / `synthesizeScopeFindings` が実装済み (`scope.ts` 確認)。 ✓
- `#692 scope-unevaluable-fail-closed` の `canDeriveChangedFiles` が `RuntimeStrategy` に実装済み。 ✓

### コードベース前提の正確性

- `PIPELINE_REGISTRY` が現在ちょうど 2 本（standard / design-only）であることを確認。 ✓
- `pipeline-ids.ts` の `PIPELINE_IDS` に `FAST` キーが未存在であることを確認（T-01 追加対象）。 ✓
- `PipelineDescriptor.permissionScope?: PermissionScope` が `types.ts:107` に宣言済み。 ✓
- `assertRuntimeSupportsScope` が `descriptor.permissionScope !== undefined` の有無で判定し、`pipelineId` 値で分岐しないことを確認。 ✓
- `pipeline.ts:298` の `transition?.to ?? "escalate"` fallback が `needs-fix:spec-fixer` の未マッチを escalate へルーティングする設計根拠として正確。 ✓
- `state.schema.ts:279` の `pipelineId?: string`（open string、literal union でない）を確認。`FAST` 追加でスキーマ変更不要。 ✓

### Glob パターン検証

- `matchGlob("src/core/port/**", "src/core/port/runtime-strategy.ts")` → regex `^src/core/port/.*$` でマッチする。 ✓
- `matchGlob("src/core/port/**", "src/core/pipeline/types.ts")` → マッチしない（`/port/` セグメントなし）。 ✓
- `matchGlob("src/state/schema.ts", "src/state/schema.ts")` → exact match。 ✓
- `matchGlob("src/state/lifecycle.ts", "src/state/lifecycle.ts")` → exact match。 ✓
- `globToRegExp` がメタキャラクターをエスケープしてから glob 展開するため injection 耐性あり。 ✓

### 遷移テーブル（D2）の正確性

- `design success → implementer`（spec-review 経由なし）: standard の `design success → spec-review` から変更。 ✓
- `verification passed → pr-create (when conformanceApprovedLatest)`: standard の `→ adr-gen` からの差し替え。 ✓
- `conformance approved → pr-create`: standard の `→ adr-gen` からの差し替え。 ✓
- `conformance approved → verification (when codeChangedSinceLastVerification)` の reverification チョークポイント保持。 ✓
- `buildReviewerChainTransitions(["code-review"])` の再利用（chain 末尾 → conformance へ）。 ✓
- `needs-fix:spec-fixer` 行なし → fallback escalate（意図した挙動）。 ✓
- `when` ガード付き行が無条件行の**前**に置く順序制約が D2 に明記されている。 ✓

### 既存テストへの影響

- `registry-invariants.test.ts` T-06-3: 「ちょうど 2 本」「scope 宣言 0 件」→ 意図的 flip。T-07 で更新が指示されている。 ✓
- `scope-escalation.test.ts` T-01（STANDARD/DESIGN_ONLY が permissionScope なし）・T-08（FindingResolution union）: 無変更で green 維持。 ✓
- `pipeline-run-gate.test.ts`: cardinality を固定しない existence check のみ → 無変更で green 維持。 ✓（ただしコメントは stale、finding #2）
- `runtime-capability-gate.test.ts` T-04-5: `id="fast"` を fixture descriptor で既にテスト済み。本 request の T-06 で production registry の `FAST_DESCRIPTOR` を使うテストを追加する意義は residual（fixture vs. production registry の差分）。 ✓

### セキュリティ観点

- permissionScope の forbidden paths はハードコードされた descriptor データ（ユーザー入力ではない）。glob injection リスクなし。 ✓
- 着手前 gate が bootstrapJob より前に reject → job state 未作成。リソースリークなし。 ✓
- `needs-fix:spec-fixer → escalate` fallback により、fast では spec レベルの修正を要する変更が人間エスカレーションされる。安全側への失敗。 ✓
- managed runtime での `canDeriveChangedFiles===false` → gate が着手前 reject → scope 無検証での前進を機械的に防止。 ✓

### 受け入れ基準との対応

全受け入れ基準（request.md）が design.md D1–D8 / tasks.md T-01–T-08 で実装可能なレベルで仕様化されている。テスト対象ファイルの参照パスも現行コードベースと一致。既存 step（design/implementer 等）の prompt・振る舞いへの変更なし（additive 変更のみ）。

**承認理由**: MEDIUM の finding #1 は tasks.md T-02 の AC で同等の機械固定がされており実装ブロックとならない。LOW の finding #2 はテスト green に影響しない stale comment。仕様全体として一貫性・完全性・安全設計を満たしており、実装に進めると判断する。
