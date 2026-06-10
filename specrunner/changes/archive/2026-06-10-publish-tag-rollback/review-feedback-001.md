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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | Testing | specrunner/changes/publish-tag-rollback/test-cases.md | Summary header と Result セクションの件数が不一致。Summary には Total: 25 / Automated: 18 / Manual: 7 / must: 23 と書かれているが、実際のケースは TC-001〜TC-027 = 27 件で、Result セクション（total: 27 / automated: 19 / manual: 8 / must: 25）の方が正しい。 | Summary ヘッダーを Result セクションの値に合わせる（Total: 27, Automated: 19, Manual: 8, must: 25）。実装には影響しないため non-blocking。 | no |
| 2 | LOW | Maintainability | .github/workflows/publish.yml | 失敗時サマリーの `if: failure()` は publish step 固有の失敗だけでなく build 失敗でも発火する。その場合メッセージ "❌ Publish failed" は厳密には "Build failed" が正しいが、workflow_dispatch で再実行すれば同じ失敗になるためユーザーが混乱する可能性がある。 | design.md D3 のスコープでは許容範囲。`if: failure()` を `if: steps.publish.outcome == 'failure'` に変え、build 失敗は別メッセージにすることも可能だが、要件には含まれていないため現状維持で問題なし。 | no |
| 3 | LOW | Maintainability | .github/workflows/publish.yml | 成功サマリーに表示されるのは tag のみ。design.md D3 では「パッケージ名・バージョン・tag を表示」と記載されているが、実装は tag のみ。delta spec の requirement 文（"tag 情報"）は満たしている。 | `npm pkg get name version` 等でパッケージ名・バージョンを取得して追記することも可能だが、要件レベルでは未指定のため現状で acceptable。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.45

## Summary

### 全体評価

受け入れ基準をすべて満たしており、must 優先度のテストケース（TC-001〜027）は全件通過している。

**publish.yml**:
- `workflow_dispatch` + `inputs.tag`（required, type: string）定義済み ✅
- `push: tags: [v*, specrunner-v*]` トリガー保持 ✅
- `env.TAG` の条件式 `github.event_name == 'workflow_dispatch' && inputs.tag || github.ref_name` で両トリガーを正しく解決 ✅
- `actions/checkout@v4` の `ref: ${{ env.TAG }}` でタグ SHA を正確にチェックアウト ✅
- `typecheck` / `test` step を除去し `build` のみ残す（D1 の設計判断） ✅
- `npm publish` に `id: publish` 付与 ✅
- 成功時（`if: success()`）・失敗時（`if: failure()`）のサマリーステップ追加 ✅
- 失敗サマリーに workflow_dispatch 再実行手順を記載 ✅

**Delta spec**（specrunner/changes/publish-tag-rollback/specs/release-automation/spec.md）:
- MODIFIED Requirement "publish.yml trigger is unchanged" が baseline header と一致 ✅
- 新規 Requirement "publish failure is visible in job summary" ✅
- 新規 Requirement "branch protection requires ci check before merge" ✅
- 全 requirement に SHALL / MUST NOT を含む ✅
- 全 requirement に Given/When/Then シナリオが存在する ✅
- delta-spec-validation-result: approved ✅

**Verification**: build / typecheck / test / lint 全フェーズ passed ✅（3276 tests green）

### セキュリティ

`workflow_dispatch` は write 権限（コラボレーター相当）が必要なため一般ユーザーが悪用できない。存在しない tag を指定した場合は `actions/checkout` の ref 解決で早期エラーになり npm publish には到達しない。injection リスクなし。

### アーキテクチャ

「タグ打ち前に止める」設計（branch protection required check）と「タグは正・publish は冪等」設計（workflow_dispatch 再実行）の両立がシンプルに実装されている。tag 削除ロジックを追加しない方針が正しく維持されている。
