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
| tasks.md | ✓ | 全タスク T-01〜T-09 のチェックボックスがすべて [x] |
| design.md | ✓ | D1〜D6 の設計判断がすべて正しく実装されている |
| spec.md | ✓ | 5 つの Requirement とすべての Scenario が実装・テストで固定されている |
| request.md | ✓ | 7 件の受け入れ基準がすべて満たされている。typecheck && test が green |

## 詳細

### Tasks（tasks.md）

全タスク T-01〜T-09 が `[x]` 完了済み。未完タスクなし。

### Design Decisions（design.md）

| 判断 | 実装確認 |
|------|---------|
| D1: `"content-format"` kind を汎用追加 | `src/core/port/output-contract.ts` で `OutputContractKind`・`ContentFormatCheck`・`checks?` フィールドを正しく実装 |
| D2: 純関数を `output-verify.ts` に集約、両 runtime で共有 | `stripHtmlComments` / `evaluateContentFormatChecks` が pure function として実装。local / managed どちらも委譲のみ |
| D3: HTML コメント除去後に検査 | `evaluateContentFormatChecks` 内で `stripHtmlComments` を適用後に pattern 評価。コメント内例文での誤合格をテストで排除 |
| D4: design の `followUpPrompt` 削除 → `outputContracts` へ移設（spec 必須 type 限定） | `DesignStep.followUpPrompt` が未定義。`outputContracts` が `isSpecRequired` で条件付き宣言（3 チェック: Requirement/Scenario/SHALL） |
| D5: code-review のテーブル形式・必須カラム検査を移設、意味的 self-check は残す | `CodeReviewStep.outputContracts` で 2 件の content-format チェックを宣言。`followUpPrompt` は項目 1〜2（Fix 値・severity）のみ残す |
| D6: last-resort halt を `policy: "follow-up"` seam から継承 | `makeOutputGateHalt` が `content-format` violation に対して path + `format violations: <labels>` を描画。既存 seam を再利用 |

### Spec Requirements（spec.md）

**R1: 汎用 content 形式検査契約 kind の追加**
- Scenario「全 check が match すれば violation 0 件」: T-03/T-04 で valid content に対し violations 0 を確認 ✓
- Scenario「match しない check があれば失敗ラベルを列挙」: T-03/T-04 で invalid content に対し failed label を含む violation 1 件を確認 ✓
- Scenario「HTML コメント内の例文では合格しない」: T-03 の HTML コメント除去テスト + TC-OV-006 で確認 ✓

**R2: local / managed 両 runtime で決定論的に動作**
- Scenario「local runtime が worktree 上の content を検証」: T-03 で worktree に fixture を置いた統合テスト ✓
- Scenario「managed runtime が branch git state 上の content を検証」: T-04 で `getRawFile` mock を用いた統合テスト ✓

**R3: design の spec 形式検査を spec 必須 type 限定の follow-up 契約へ移す**
- Scenario「spec.md 形式が正しければ検査由来の追撃は発火しない」: T-05 で valid spec → violations 0 ✓
- Scenario「spec.md 形式に違反があれば repair が発火する」: T-05 で Scenario 欠落 spec → follow-up violation ✓
- Scenario「spec-exempt type では形式契約を宣言しない」: T-05 で chore → `[]` ✓

**R4: code-review のテーブル形式検査を follow-up 契約へ移す**
- Scenario「テーブル形式が正しければ追撃は発火しない」: T-06 で valid → violations 0 ✓
- Scenario「テーブル形式違反があれば repair が発火する」: T-06 で no-table / missing-columns ケースで follow-up violation ✓

**R5: 形式違反は従来どおり修復され、通常経路の観測挙動は不変**
- Scenario「違反は修復されて step は前進する」: `policy: "follow-up"` seam を再利用。local / managed それぞれの runner に repair loop が存在 ✓
- Scenario「予算枯渇後も残る形式違反は commit 前に halt する」: T-07 で `makeOutputGateHalt` の content-format 描画を確認 ✓

### Acceptance Criteria（request.md）

| 基準 | 状態 |
|------|------|
| design valid → repair 0 回（テスト固定） | T-05 ✓ |
| design invalid（Scenario 欠落）→ repair 発火（テスト固定） | T-05 ✓ |
| code-review valid → 0 回 / invalid → 発火（テスト固定） | T-06 ✓ |
| 新 kind の検出が local / managed 双方でテスト | T-03 / T-04 ✓ |
| design / code-review の `followUpPrompt` から移設した形式検査の記述が無いことをテスト固定 | T-02 / T-05 / T-08 ✓ |
| 形式違反は従来どおり修復される。既存テストが移設起因以外で無改変 green | `spec-exempt-runtime.test.ts` は halt violation の確認方法を緩和更新のみ（2 契約共存に対応）。全 6892 テスト green ✓ |
| `typecheck && test` が green | `tsc --noEmit` 及び `bun run test` 実測確認 ✓ |

## 追加観察

- **managed-agent runner への出力検証ループ追加** (`src/adapter/managed-agent/agent-runner.ts` +28 行): tasks.md には明示されていないが、managed runtime で repair turn を発火させるために必要な変更。local runner の既存ループと対称であり、要件 R2 の実現に不可欠。scope 内と判断。
- **`spec-exempt-runtime.test.ts` の期待更新**: spec-required type で produced + content-format の 2 契約が共存するため、`specViolations` 件数アサーションを `haltViolation` の存在確認に変更。halt 契約（`produced`）の保存は確認済み。移設起因の正当な更新。
- **`evaluateContentFormatChecks` の防衛的早期 return**: `checks.length === 0` のとき即 `[]` を返し file 読み取りを行わない。
