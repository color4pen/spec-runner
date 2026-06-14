# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | Testing | tests/unit/core/pipeline/runtime-capability-gate.test.ts | TC-015（should）に対応する単一 it が存在しない。`instanceof Error` の明示 assert が無い（`toBeInstanceOf(UnsupportedRuntimeCapabilityError)` で実質カバー済みだが 1:1 対応する test case は未作成）。 | `expect(err).toBeInstanceOf(Error)` を含む TC-015 対応 it を 1 件追加する。should 優先度につき今回はブロッカーとしない。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.8

## Summary

### 受け入れ基準チェック

| 基準 | 判定 | 根拠 |
|------|------|------|
| Meta optional `pipeline` 追加・absent→`standard`・未知 id は既存エラーで弾く | ✅ | `parser.test.ts` TC-T01-001/002、`pipeline-run-gate.test.ts` T-05-3/4 |
| scope 宣言 ＋ `canDerive=false` → `bootstrapJob` 前に typed error・state 未作成 | ✅ | `pipeline-run-gate.test.ts` T-05-1（bootstrapJob spy が未呼び出しを assert） |
| gate 判定が `permissionScope` 有無から導出・profile 名ハードコード分岐なし | ✅ | `runtime-capability-gate.test.ts` T-04-5（5 id で一様に発火） |
| `canDerive=true` または absent で通過 | ✅ | `runtime-capability-gate.test.ts` T-04-2/3 |
| `PIPELINE_REGISTRY` に scope 宣言 profile が増えていない | ✅ | `registry-invariants.test.ts` T-06-3（entries=2・scope 宣言 0 件を assert） |
| `FindingResolution` union は `fixable \| decision-needed` のまま | ✅ | 既存 `scope-escalation.test.ts` T-08 green |
| `bun run typecheck && bun run test` green | ✅ | typecheck: 0 errors、test: 5251 passed (397 files)、lint: 0 warnings |

### 実装精査

**pipeline-run.ts**（T-03）: `pipelineId = request.pipeline ?? STANDARD_PIPELINE_ID` → `getPipelineDescriptor` → `assertRuntimeSupportsScope` → `bootstrapJob` の順序が設計どおり。`validateReviewerDefinitions` の直後・`bootstrapJob` の直前で gate が位置する。`pipelineId` 変数を `bootstrapJob` に渡すことで Meta 指定 id が job state に記録される。

**runtime-capability-gate.ts**（T-02）: 純関数。import は type-only（`./types.js` + `../port/runtime-strategy.js`）のみ、fs/child_process/SDK import 0 件。`core/pipeline → core/port` は既存許可 edge。判定式 `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false` は optional chaining で predicate absent（fake）がフォールスルーする（#692 seam 契約と一致）。`UnsupportedRuntimeCapabilityError` の message は「changed-files を導出できる runtime」の能力ベース表現（runtime 種別名なし）・代替案内付き。

**parser layer**（T-01）: `ParsedRequestRaw.pipeline` / `ParsedRequest.pipeline` を optional string として追加。parser は `src/core/pipeline` を import せず、`rules/index.ts` に新 rule 未登録。DSM 制約遵守。

**テスト構成**: T-04（gate 純関数単体）→ T-05（call-site 結合・bootstrapJob spy）→ T-06（registry 不変・FindingResolution 不変）の 3 層。特に T-05 の「`bootstrapJob` spy 未呼び出し」による behavioral 証明は「state を作らない」要件を副作用観察で正確に固定している。`PIPELINE_REGISTRY` への fixture 挿入は `beforeEach`/`afterEach` で対称化されテスト間リークなし。

### アーキテクチャ不変条件

- DSM: parser → core/pipeline の逆 edge 新設なし（import 0 件確認）。gate module は core/pipeline 内純関数。
- registry 初期化子に scope 宣言 profile 追加なし → production で gate は一切発火しない。
- `FindingResolution` union 不変（既存 test green）。
- 全体 5251 test / 397 file が無変更 green で既定挙動完全一致を確認。

