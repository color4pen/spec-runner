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
| 1 | LOW | testing | tests/unit/core/pipeline/resolve-scope.test.ts | TC-015（should）「composeReviewerDescriptor 通過後も解決済み scope が保持される」が未テスト。`applyScopeConfig` → `composeReviewerDescriptor` の連結パスで `permissionScope.forbidden` が spread 保持されることを確認するテストがない。 | `applyScopeConfig(FAST_DESCRIPTOR, configWithSurfaces)` の結果を `composeReviewerDescriptor(scoped, [])` に通し、結果の `permissionScope.forbidden` が解決済み面と一致することを 1 ケース追加する。機能的欠陥はなく今回ブロックしない。 | no |
| 2 | LOW | testing | tests/config/merge.test.ts | TC-002（should）`forbiddenSurfaces` array の deep-merge 置換が新フィールド固有ではテストされていない。既存 merge.test.ts が一般 array 置換をカバーしており機能的問題はないが、spec-review-result-001 #3 の懸念が未解消。 | `forbiddenSurfaces` を user / project 両層に宣言したフィクスチャで merge 後に project local の array だけが残ることを 1 ケース追加する。今回ブロックしない。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.70

## Summary

すべての must 受け入れ基準を満たしており、実装・テスト・ドキュメント全層が一貫している。

### 受け入れ基準チェック

| 基準 | 結果 | 根拠 |
|------|------|------|
| config 宣言時 breach 検出 | ✅ | fast-scope-checkpoint.test.ts T-05-1: 3 面それぞれで verdict=escalation、scope finding (origin:"scope", resolution:"decision-needed", severity:"high")、options≥2 を確認 |
| config 無指定時 breach なし + gate 維持 | ✅ | T-05-2: 空 forbidden で approved・scope finding 0 件。resolve-scope.test.ts capability gate ブロック: 無指定でも UnsupportedRuntimeCapabilityError が throw される |
| 不正 config が validation エラー | ✅ | resolve-scope.test.ts: id 欠落・id 空文字・paths 非配列(string)・paths 未指定・forbiddenSurfaces 非配列(object) の 6 ケース全 CONFIG_INVALID |
| registry にパスリテラルなし | ✅ | registry.ts:155-161 — `forbidden: []`、`src/core/port/**` 等の文字列なし |
| 自 repo config に 3 面宣言 | ✅ | `.specrunner/config.json` に 3 面宣言済み。dogfooding テスト 6 件で固定 |
| typecheck && test green | ✅ | verification-result.md: build/typecheck/test/lint 全 passed (5979 tests passed) |

### 実装品質

**設計忠実性**: design.md の D1-D6 が正確に実装されている。

- **D1・D4**: `FAST_DESCRIPTOR.permissionScope.forbidden = []`（静的 registry は純粋定数のまま）。`applyScopeConfig` が runtime で変換を行い、`resolvePipelineForbiddenSurfaces` が id→config 位置のマッピングを 1 箇所に閉じている。
- **D2**: `pipeline.fast.forbiddenSurfaces` キー。zod の `id`（minLength(1)）/ `paths`（array of minLength(1) string）検証がエラーメッセージ書式含め既存 `archive.protectedPaths` と揃っている。
- **D3**: `checkpoint` は registry に残り config 化されていない。
- **D5**: `buildPipelineForJob` と `runPipeline` の 2 経路に `applyScopeConfig` が配線済み。`pipeline-run.ts`（preflight）は無変更。`DESIGN_ONLY_DESCRIPTOR` / `STANDARD_DESCRIPTOR` を使う `runDesignPipeline` / `createStandardPipeline` は `permissionScope` が undefined なので no-op——正しい。
- **D6**: registry リテラル撤去と `.specrunner/config.json` への 3 面移設が同一 PR 内で原子的に完成している。

**アーキテクチャ**: `resolve-scope.ts` は `config/schema.ts` を import（core → config、allowed direction）。`config → core` の上向き import なし。

**must テストケース (11 件)**: TC-001/003/004/005/006/007/008/009/011/013/017 全カバー。
**should テストケース**: TC-002/TC-015 が未追加（Findings #1 #2）。いずれも既存動作への依存であり機能的欠陥なし。
**could テストケース (TC-016)**: paths 空配列の許容を validation テストで確認済み。

**ドキュメント**: docs/configuration.md に fast pipeline セクション追加。checkpoint は code 側で設定不可、capability gate は presence で常時適用、array 置換規則の 3 点が明記されており要件通り。
