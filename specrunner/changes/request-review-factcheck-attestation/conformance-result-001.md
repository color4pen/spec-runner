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
| tasks.md | ✅ | T-01〜T-06 全 checkbox が [x]；verification-result.md で build/typecheck/test/lint/coverage すべて passed |
| design.md | ✅ | D1〜D9 全設計判断が実装に反映されている |
| spec.md | ✅ | R1〜R4 全要件と全 Scenario が実装・テストで固定されている |
| request.md | ✅ | 5 受け入れ基準すべて充足；既存テスト無改変；typecheck && test が green |

---

## Judgment Details

### J1: tasks.md — 全 checkbox が [x]

T-01〜T-06 の全タスクと全 sub-item が `[x]`。T-06（verification）も `[x]` であり、`verification-result.md` で build / typecheck / test / lint / changed-line-coverage すべて passed（6780 tests passed）を確認した。

---

### J2: Spec Requirements と Scenarios

#### R1: request-review が attestation artifact を生成する（SHALL / MUST）

- `RequestReviewStep.writes()` に `{ path: factCheckAttestationPath(slug), verify: false }` を宣言 — ファイルとして出力 ✅
- `RequestReviewStep.enrichContext` が `request.md` を読み `hashRequestContent` でハッシュ計算し `dynamicContext.requestContentHash` に注入 ✅
- `buildRequestReviewInitialMessage` がハッシュ提供時に attestation 書き込み指示（path・hash 転写・verifiedAssertions 形式）を含む ✅
- `REQUEST_REVIEW_BASE` に "Fact-Check Attestation Output" セクション追加（JSON shape + requestHash 転写 + verdict 非影響を明記） ✅
- `JobState` / `StepRun` に attestation フィールドなし — state schema 無変更 ✅
- Scenario「attestation is produced」→ TC-FCA-07（writes 宣言）・TC-FCA-08（enrichContext hash 計算）でカバー ✅
- Scenario「attestation is a file artifact, not state」→ state schema 無変更で成立 ✅

#### R2: hash 一致時に design が記録済み断定の再検証を省略する（SHALL / MUST）

- `DesignStep.enrichContext` が attestation ファイルと `request.md` を読み `evaluateFactCheckAttestation` で評価し `dynamicContext.factCheckAttestation` に注入 ✅
- `DesignStep.buildMessage` が `buildFactCheckDirective(evaluation)` で directive を生成し `buildInitialMessage` に渡す ✅
- `buildFactCheckDirective(valid)` は listed assertions の skip を指示しつつ「NOT in the list は MUST verify」を明記 ✅（D6 準拠）
- `DESIGN_BASE` の "Fact-Check Attestation（省略可能な再検証）" セクションで valid 時は MAY skip + MUST verify unlisted を規定 ✅
- Scenario「hash match skips recorded assertions」→ TC-FCA-09 valid + TC-FCA-10 skip directive injection でカバー ✅

#### R3: stale/absent 時に design が全断定を再検証する（SHALL）

- `evaluateFactCheckAttestation` が null/unparseable → `"absent"`、hash 不一致または `codeAssertionsVerified !== true` → `"stale"` を返す ✅
- `buildFactCheckDirective(stale/absent)` は "Verify ALL" 指示を生成 ✅
- `DesignStep.enrichContext` が `request.md` 読み取り失敗時に `dynamicContext` unchanged を返す（managed degradation、D7 準拠） ✅
- Scenario「hash mismatch falls back to full re-verification」→ TC-FCA-09 stale でカバー ✅
- Scenario「absent attestation falls back to full re-verification」→ TC-FCA-09 absent でカバー ✅

#### R4: attestation は verdict・停止判定を変えない / fail-safe（SHALL / MUST）

- `writes()` の attestation エントリは `verify: false` — 欠落しても output-contract gate でハルトしない（D8 準拠） ✅
- `REQUEST_REVIEW_BASE` に「attestation does NOT affect your verdict or findings」を明記 ✅
- `parseFactCheckAttestation` が malformed / 型不一致 → `null` → `evaluateFactCheckAttestation` が `"absent"` → design は全断定を再検証（fail-safe） ✅
- `RequestReviewStep.parseResult` は null-verdict を返し、verdict は toolResult 経由で決定（attestation 非関与） ✅
- Scenario「verdict and stop behavior are preserved」→ Verdict invariance テストグループ + 既存テスト無改変でカバー ✅
- Scenario「a bad attestation fails safe」→ TC-FCA-03 malformed → null、TC-FCA-04 unparseable → absent でカバー ✅

---

### J3: Acceptance Criteria (request.md)

| AC | テストカバレッジ | 結果 |
|----|----------------|------|
| request-review 後に attestation が生成されることをテストで固定 | TC-FCA-07（`writes()` 宣言）・TC-FCA-08（`enrichContext` hash 計算 + degradation） | ✅ |
| hash 一致時の省略経路をテストで固定 | TC-FCA-09 valid・TC-FCA-10 skip directive injection | ✅ |
| hash 不一致時の fallback 経路をテストで固定 | TC-FCA-09 stale/absent・TC-FCA-10 verify-all directive | ✅ |
| verdict・停止判定の観測挙動が不変 / 既存テスト無改変 | Verdict invariance グループ；`git diff main...HEAD -- tests/` で既存テストファイルへの変更なしを確認 | ✅ |
| `typecheck && test` が green | `verification-result.md`: build / typecheck / test / lint すべて passed（6780 tests passed） | ✅ |

---

### J4: Design Decisions D1〜D9

| Decision | 実装対応 | 結果 |
|----------|---------|------|
| D1: file artifact, not state | `factCheckAttestationPath` → `specrunner/changes/<slug>/request-review-attestation.json`；JobState 変更なし | ✅ |
| D2: skip は hash 一致時のみ | `evaluateFactCheckAttestation` が hash equality + `codeAssertionsVerified: true` で `"valid"` | ✅ |
| D3: CLI が hash を compute し agent が verbatim copy | `enrichContext` で `hashRequestContent(readFile(...))` → `requestContentHash` inject；agent は指示値を転写 | ✅ |
| D4: skip/re-verify 判定は CLI 確定 | `DesignStep.enrichContext` で評価；agent は directive に従うのみ | ✅ |
| D5: 両サイドで `request.md` ファイルバイトを `node:crypto` SHA-256 でハッシュ | `createHash("sha256").update(content)` を `src/core/factcheck-attestation.ts` で定義；両サイドで同一関数 | ✅ |
| D6: verified-assertions リストは advisory；未記録断定は必ず検証 | `buildFactCheckDirective(valid)` に「NOT in the list は MUST verify」を明記 | ✅ |
| D7: managed runtime は graceful degradation | `enrichContext` の outer try/catch で `request.md` 読み取り失敗時に `dynamicContext` unchanged を返す | ✅ |
| D8: attestation write は declared, non-gated | `writes()` に `{ path: ..., verify: false }` | ✅ |
| D9: pure attestation logic を専用モジュールに分離 | `src/core/factcheck-attestation.ts`（pure）；path helper は `src/util/paths.ts`；DynamicContext は inline structural type で cross-layer import 回避 | ✅ |

---

## 観察事項（ブロックなし）

TC-FCA-06 の `not.toContain("attestation")` アサーション（line 403）は、initial message に "attestation" が別文脈で登場した場合に誤検知するリスクがある。現時点で false negative はなく、code review で low/advisory として記録済み。今回の承認を妨げない。
