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
| 1 | LOW | correctness | tasks.md (T-01) | `PartialSpecRunnerConfig` は `src/config/schema.ts` にも `src/` 全体にも存在しない型。T-01 の「migration 用の緩い型」確認ステップは空振りになる。 | 実装者は T-01 のこのチェックをスキップし、`PipelineConfig` interface への `fast?: FastPipelineConfig` 追加のみを行えばよい。 |
| 2 | LOW | documentation | tasks.md | 既存 ADR `specrunner/adr/2026-06-14-fast-pipeline-profile.md` の D2（`:53-75`）はハードコード 3 面を正規の設計決定として記録しており、本変更後は内容が矛盾する。新 ADR（`adr-gen` が生成）はこの変更を記録するが、旧 ADR D2 を陳腐化させることを明示する記述が tasks に無い。 | 新 ADR に「旧 ADR 2026-06-14-fast-pipeline-profile.md の D2 を本 ADR で置き換える」旨を明示すること。旧 ADR 自体の変更は不要（ADR は追記・上書き方式で可）。 |
| 3 | LOW | test-coverage | tasks.md (T-10) | spec.md に「user global と project local の array は project local が丸ごと置換する」シナリオが要件として記載されているが、T-10 の acceptance criteria に対応するテストケースが明示されていない。 | 既存の deep-merge テスト（`archive.protectedPaths` 相当）がカバー済みであれば追加不要。未カバーであれば T-10 に `forbiddenSurfaces` の array 置換テストを追記する。いずれにせよ実装前に確認すること。 |

## Review Notes

設計全体として正確で実装可能な仕様に仕上がっている。以下を確認した。

**コードベース照合**:
- `FAST_DESCRIPTOR.permissionScope.forbidden` に 3 面リテラルが存在することを確認（`registry.ts:157-161`）。
- `getPipelineDescriptor` が config を受け取らない純関数であることを確認（`:179-186`）。
- `composeReviewerDescriptor` が `snapshots` 空のとき `base` を参照同一で返す zero-overhead 不変契約を確認（`compose-reviewers.ts:36-38`）。
- `assertRuntimeSupportsScope` が `permissionScope` の **presence** のみを読み、forbidden の中身を参照しないことを確認（`runtime-capability-gate.ts:73-85`）。
- `deriveScopeBreach` が `forbidden.length === 0` で即 `{ breached: false }` を返すことを確認（`scope.ts:60`）。
- `PipelineDeps extends StepContext`、`StepContext.config: SpecRunnerConfig` — `deps.config` が `applyScopeConfig` に渡せることを確認。
- `core/` が `config/schema.ts` を import する既存パターンが多数存在し、`resolve-scope.ts` の新規 import に layer 違反が無いことを確認。
- `buildPipelineForJob` / `runPipeline` の両経路が T-06 で網羅されており、`runDesignPipeline` は `DESIGN_ONLY_DESCRIPTOR`（`permissionScope` 不在）を使うため変換が no-op になり変更不要であることを確認。
- `pipeline-run.ts:106` の `composeReviewerDescriptor` は input-completeness validation 用であり scope を読まないため、D5 の「preflight は変更しない」方針が成立することを確認。

**セキュリティ**:
- `id` / `paths` は zod で non-empty string / array-of-non-empty-string として検証される（SQL injection / path traversal の対象外）。
- config はローカルファイルシステムから読まれ、実行ユーザーが書いたデータ。外部入力扱いは不要。
- glob パターンはファイルアクセスではなく変更ファイルリストへのマッチングに使用される。悪意あるパターンによる影響範囲はゼロ（false-positive breach の発生のみ）。
- OWASP Top 10 該当項目なし（CLIローカルツール、Web 非公開）。

**受け入れ基準カバレッジ**:
- config 宣言時 breach → T-10 breach acceptance テスト ✓
- 無指定時 no-breach + gate 維持 → T-10 no-breach + gate テスト ✓
- 不正 config validation エラー → T-02 + T-10 validation テスト ✓
- registry リテラル無し → T-04 + T-09 + T-10 dogfooding テスト ✓
- 自 config に 3 面 → T-07 + T-10 dogfooding テスト ✓
- `typecheck && test` green → T-05 / T-09 / T-10 全テスト更新 ✓
