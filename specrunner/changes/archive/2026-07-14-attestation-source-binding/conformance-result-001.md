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
| tasks.md | ✅ | T-01〜T-07 全チェックボックス [x] 済み |
| design.md | ✅ | D1〜D6 すべて実装確認済み（D5 は意図的非実装、残余 design.md に明記） |
| spec.md | ✅ | 全 Requirement の全 Scenario をテストで固定済み |
| request.md | ✅ | 受け入れ基準 AC1〜AC5 すべてテスト通過、typecheck && test green |

## Detail

### 1. Tasks Completion

全タスク T-01〜T-07 のチェックボックスがすべて `[x]` 済み。

### 2. Design Decisions 実装確認

| Decision | 実装箇所 | 判定 |
|----------|---------|------|
| D1: change folder 除外 source-scoped sha | `src/git/source-revision.ts` — `git rev-list -1 HEAD -- . ':(exclude)specrunner/changes'` | ✅ |
| D2: 単一ヘルパ `readSourceRevision` に集約 | `src/git/source-revision.ts` — import は `src/util/git-exec.js` と `src/util/paths.js` のみ（`src/adapter/` 非依存） | ✅ |
| D3: 既存 agent 転記経路に相乗り | `request-review.ts:enrichContext` → `DynamicContext.sourceRevision` → `buildRequestReviewInitialMessage` → attestation JSON テンプレートに `sourceRevision` 行追加 | ✅ |
| D4: `evaluateFactCheckAttestation` 第 3 引数追加・stale 判定拡張 | `factcheck-attestation.ts:151-182` — 判定順序 1(absent)→2(既存 stale)→3(source 束縛)→4(valid) | ✅ |
| D5: 未 commit working-tree 編集は捕捉しない（残余明記） | `design.md` に残余を明記済み、実装に dirty 判定なし（意図通り） | ✅ |
| D6: managed runtime は既存縮退でカバー | 専用分岐なし。`readSourceRevision` が null → D4-3 で stale | ✅ |

### 3. Spec 要件・シナリオ適合

**Requirement: attestation は source revision に束縛される**

- Scenario「source 未変化なら valid を維持する」: TC-FCA-09 第 1 ケースで git 一時リポジトリ上の metadata commit をまたいでも `readSourceRevision` が安定し、valid を返すことを確認。✅
- Scenario「request.md 不変でも source 変化で stale にする」: TC-FCA-04 AC-2 および TC-FCA-09 stale-rev ケースで確認。✅

**Requirement: source 信号は fail-safe に stale へ倒す**

- Scenario「source 信号を持たない旧 attestation は stale になる」: TC-FCA-04 + TC-FCA-09 nosource ケース。✅
- Scenario「current source revision が取得不能なら stale になる」: TC-FCA-04 `null` → stale ケース。✅
- Scenario「既存の stale 条件が保存される」: TC-FCA-04 で requestHash 不一致・codeAssertionsVerified false の各ケース。✅

### 4. Request 受け入れ基準適合

| AC | 対応テスト | 判定 |
|----|-----------|------|
| source revision 一致 + hash 一致 + verified true → valid | TC-FCA-04 AC-1, TC-FCA-09 valid ケース | ✅ |
| hash 一致でも source revision 不一致 → stale（核心） | TC-FCA-04 AC-2, TC-FCA-09 stale-rev ケース | ✅ |
| source 信号を持たない旧 attestation → stale（fail-safe） | TC-FCA-04 AC-3, TC-FCA-09 nosource ケース | ✅ |
| 既存 requestHash 不一致 / codeAssertionsVerified false → stale 保存 | TC-FCA-04 AC-4 | ✅ |
| `typecheck && test` green | verification-result.md（build/typecheck/test/lint/changed-line-coverage 全 passed） | ✅ |

### 5. 横断観点

- **層制約**: `src/git/source-revision.ts` は `src/adapter/` に依存しない（D2 / T-01 の層制約を遵守）。
- **後方互換**: `parseFactCheckAttestation` は `sourceRevision` 欠落・非 string を `undefined` として吸収し parse 成功を維持。旧 attestation は evaluate step 3 で stale → design は verify-all にフォールバック。
- **stale 理由文 (T-06)**: `buildFactCheckDirective` の stale メッセージに "source revision has changed since request-review ran" を含む。テストで `source revision` 文言を確認済み。
- **REQUEST_REVIEW_SYSTEM_PROMPT**: `sourceRevision` の verbatim 転記指示・省略条件が明記されていることをテストで確認済み。
- **検証結果**: verification-result.md にて build / typecheck / test / lint / changed-line-coverage の 5 フェーズすべて passed。
