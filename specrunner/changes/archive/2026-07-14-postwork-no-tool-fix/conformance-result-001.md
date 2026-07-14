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
| tasks.md | ✅ yes | 全チェックボックス [x]。T-01〜T-05 の Acceptance Criteria をすべて実装が充足 |
| design.md | ✅ yes | D1（followUpPrompt 限定）/ D2（lock test による担保固定）/ D3（registry 由来動的列挙の歯）すべて実装と対応 |
| spec.md | ✅ yes | 3 Requirement（post-work Markdown 専用・main work 完了契約・越境不変 MUST NOT）をテストと実装の双方で充足 |
| request.md | ✅ yes | 受け入れ基準 4 項目すべて充足。typecheck && test green（verification-result.md で確認済み） |

---

## Scope of Changes

```
src/core/step/code-review.ts                             |  7 +-   (followUpPrompt のみ)
tests/unit/core/step/post-work-prompt-invariant.test.ts  | 262 +++ (新規追加)
```

既存テストファイルへの変更ゼロ。変更 2 ファイルのみ（最小スコープ）。

---

## J1: tasks.md — タスク完了の確認

| Task | 判定 | 根拠 |
|------|------|------|
| T-01: followUpPrompt から report_result 関連 3 行削除・連番整理・末尾指示変更 | ✅ | `git diff` で削除行と変更行を確認。followUpPrompt は `report_result` を含まず、Markdown 検査 4 項目（1〜4）が連番で残存 |
| T-02: 新規テストで followUpPrompt の report_result 非包含・typed findings 語非包含・Markdown 検査保持を assert | ✅ | `post-work-prompt-invariant.test.ts` T-02 describe に 6 test cases。verification: test passed |
| T-03: 完了契約（system prompt / tool description）の lock test 追加（source 変更なし） | ✅ | T-03 describe が `CODE_REVIEW_SYSTEM_PROMPT` と `CODE_REVIEW_REPORT_TOOL.description` の担保文言を assert。両 source ファイルに diff なし |
| T-04: 全 agent step post-work prompt 走査テスト（registry 由来列挙） | ✅ | `collectUniqueAgentSteps()` が `STANDARD_DESCRIPTOR` / `FAST_DESCRIPTOR` から動的列挙。FORBIDDEN_MARKERS コメント付き |
| T-05: 既存テスト無変更・typecheck && test green | ✅ | verification-result.md: build/typecheck/test/lint すべて passed。Test 6739 passed (496 files) |

---

## J2: design.md — 設計判断との整合

### D1 — followUpPrompt を Markdown 専用 self-check に限定

- 旧 item 4「`report_result` の findings 配列が提出されているか」と sub-bullet 2 行（各 finding フィールド確認・`[]` を渡す）を削除 ✅
- 旧 item 5「severity 定義準拠」を item 4 に繰り上げ（1〜4 連番、欠番なし） ✅
- 末尾指示を「review-feedback ファイルを修正してください」に変更 ✅
- `Read tool` / `review-feedback ファイル` の Markdown 検査指示は保持 ✅

### D2 — typed findings 担保を main work turn 完了契約に一元化（source 変更なし）

`CODE_REVIEW_SYSTEM_PROMPT`・`CODE_REVIEW_REPORT_TOOL.description` の diff なし。T-03 lock test が担保文言（findings 配列・空配列規約・REQUIRED）の残存を機械的に固定 ✅

### D3 — 越境不変の機械的な歯

- registry 由来動的列挙（ハードコード step 名なし） ✅
- 静的 `followUpPrompt` と動的 `getFollowUpPrompt` の両方を走査 ✅
- adr-gen を `adr: true` 条件で評価 ✅
- `buildRulesFollowUpPrompts` ラッパーも走査 ✅
- `FORBIDDEN_MARKERS` 拡張コメント（ファイル冒頭 + 定義直前） ✅

---

## J3: spec.md — 要件充足

| Requirement | 判定 |
|-------------|------|
| post-work self-check は Markdown result file のみ検査・修正する MUST | ✅ 実装とテスト（T-02）で充足 |
| typed findings の正当性は main work turn 完了契約が担保する MUST | ✅ 担保 source 無変更 + T-03 lock test で固定 |
| post-work / follow-up prompt は captured tool の呼び出し・修正を指示しない MUST NOT | ✅ T-04 が全 agent step を走査・fail-closed に固定 |

---

## J4: request.md — 受け入れ基準

| 基準 | 判定 |
|------|------|
| followUpPrompt に report_result / typed findings 修正指示が無いことをテストで固定 | ✅ |
| 越境不変の歯（全 agent step post-work 走査）を追加し green | ✅ |
| 観測挙動不変（既存テスト無変更 green） | ✅ |
| typecheck && test green | ✅ |

---

## 総評

変更範囲が最小（source 1 ファイル・test 1 ファイル追加）で設計意図に正確に対応している。越境不変が registry 由来の動的列挙で fail-closed に固定され、既存テスト無変更・6739 tests passing・typecheck clean。受け入れ基準 4 項目・spec.md 3 Requirement・tasks.md 5 タスクすべて充足。
