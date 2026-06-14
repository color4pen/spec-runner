# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | 全 7 タスク `[x]` 完了 |
| design.md | ✓ | D1–D6 すべて実装確認 |
| spec.md | ✓ | 全 SHALL/MUST 要件を実装・テストで充足 |
| request.md | ✓ | 受け入れ基準 7 項目すべて充足、verification 全フェーズ green |

## Judgment Details

### J-1: tasks.md — 全チェックボックス完了

tasks.md の T-01〜T-07 全タスクが `[x]` でマークされている。

### J-2: design.md — 設計判断の実装確認

| 決定 | 実装確認 |
|------|---------|
| D1 (Meta pipeline, additive optional) | `ParsedRequestRaw.pipeline` / `ParsedRequest.pipeline` 追加。`parseRequestMdRaw` で `- **pipeline**: <value>` を正規表現で抽出。`rules/index.ts` 無改変（validation rule なし） |
| D2 (pure gate, permissionScope 基準) | `runtime-capability-gate.ts` 新設。判定は `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false` のみ。`descriptor.id` 値での分岐なし（grep 確認: `pipelineId === "fast"` 等の分岐は src/ に存在しない） |
| D3 (bootstrapJob 前 preflight) | `pipeline-run.ts` L88–90: `validateReviewerDefinitions` の後・`bootstrapJob` の前に `assertRuntimeSupportsScope` を配置 |
| D4 (typed error, 能力表現) | `UnsupportedRuntimeCapabilityError.message` に「changed-files を導出できる runtime が必要」を含む。「local」「managed」種別名依存なし。テストで `expect(message).not.toContain("local runtime")` を assert |
| D5 (registry 不変, fixture 検証) | `PIPELINE_REGISTRY` に scope 宣言 profile なし（T-06-3 で 2 本のみ・permissionScope 0 件を assert）。gate test は `beforeEach` で registry に fixture 挿入・`afterEach` で削除する対称的 mutation |
| D6 (design-only 併存) | `runDesignPipeline` 無改変。Meta `pipeline: design-only` → `getPipelineDescriptor("design-only")` → `DESIGN_ONLY_DESCRIPTOR` の到達性を T-06-1/2 でテスト固定 |

### J-3: spec.md — SHALL/MUST 要件の充足確認

| 要件 | 充足箇所 |
|------|---------|
| R1: parser が optional pipeline を抽出、validation rule なし | `tests/parser.test.ts` TC-T01-001/002 ✓ |
| R2: 未知 id → bootstrapJob 前に既存 registry エラーで停止 | T-05-3 ✓ |
| R3: scope 宣言 + canDerive=false → `UnsupportedRuntimeCapabilityError`、bootstrapJob 未呼び出し | T-05-1、T-04-1 ✓ |
| R4: gate は permissionScope の有無から導出（profile 名分岐なし） | T-04-5: 5 種の id で一様に throw を assert ✓ |
| R5: canDerive=true または absent → gate 通過 | T-04-2、T-04-3、T-05-2 ✓ |
| R6: PIPELINE_REGISTRY 不変、gate production inert | T-06-3: 2 本のみ・scope 宣言 0 件 ✓ |
| R7: Meta design-only → DESIGN_ONLY_DESCRIPTOR 到達、既存経路不変 | T-06-1/2 ✓ |
| R8: FindingResolution union 不変 | 既存テスト無変更 green ✓ |

### J-4: request.md — 受け入れ基準の充足確認

| 受け入れ基準 | 充足 |
|-------------|------|
| optional `pipeline`、absent → `standard`、未知 id 拒否（test） | ✓ T-05-4、T-05-3 |
| permissionScope + canDerive=false → typed error、bootstrapJob 前停止、state 未作成（test） | ✓ T-05-1 |
| gate 判定が profile 名でなく permissionScope の有無から導出（ハードコード分岐なし） | ✓ T-04-5、impl grep |
| canDerive=true / absent → gate 通過（test） | ✓ T-04-2/3 |
| PIPELINE_REGISTRY に scope 宣言 profile なし → gate production inert、既定挙動無変更 | ✓ T-06-3 |
| FindingResolution union が `fixable \| decision-needed` のまま | ✓ 既存テスト green |
| `bun run typecheck && bun run test` green、arch 不変条件（B-1〜B-11 + DSM）green | ✓ verification-result.md 全フェーズ passed |

## 追加確認事項

- **DSM 遵守**: `src/parser/` 配下に `core/pipeline` の import なし（grep 0 件）。parser → registry の逆依存は生じていない。
- **profile 名ハードコード**: `pipelineId === "fast"` 等の分岐が src/ に存在しないことを grep で確認済み（コメント内の言及のみ）。
- **registry mutation リーク**: T-05 の `beforeEach`/`afterEach` が対称的に fixture を追加・削除する設計。T-06-3 が同一スイートで registry 2 本のみを assert し green であることから、テスト間リークは発生していない。
- **non-blocking 所見**: T-05-5 は afterEach 後の状態を直接 assert していないが、対称的なクリーンアップと他テスト群の通過により間接的に保証されている。ブロッカーではない。
