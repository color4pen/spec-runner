# Conformance Result: 過大 request の粒度ゲート

**Iteration**: 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: tasks.md の全チェックボックスが完了済みか

T-01〜T-06 の全チェックボックスを確認。すべて `[x]` 済み。

### J2: design.md の設計判断が実装に反映されているか

**D1（量的判定 validate / 質的判定 request-review の二段配置）**
- `src/parser/extract-section.ts:95` に `countTopLevelAcceptanceCriteria` 純関数を追加（機械カウント）。
- `src/prompts/request-review-system.ts:56` に Method 6 として縫い目判定（LLM 側）を追加。二段配置確認済み。

**D2（warning のみ、hard gate 化しない）**
- `src/core/command/request.ts:162–169` で `logWarn` を呼ぶのみ。`return 1` なし。exit code 不変確認済み。

**D3（カウントは extract-section.ts の純関数、しきい値は request.ts のコード定数）**
- `countTopLevelAcceptanceCriteria` は `extract-section.ts` に純関数として配置。
- `ACCEPTANCE_CRITERIA_WARN_THRESHOLD = 15` は `request.ts` の定数。config 化なし。コメントに実測較正値である旨を明記。

**D4（縫い目判定は Method 6 として追加）**
- `REQUEST_REVIEW_BASE` に `6. Granularity Seam Judgment（縫い目判定）` を追加。
- 3 基準・実測較正値（8%・23%・archive 499 件）・decision-needed finding 指示を含む。

**D5（裁定の永続先は `## 分割検討済み` 宣言）**
- prompt に宣言尊重ルールを明記。理由のない宣言は尊重しない旨も含む。
- 周回知識注入機構の追加なし（design の Non-Goal と一致）。

**D6（`## 分割検討済み` は parse に対して不活性）**
- `REQUEST_CONSTRAINT_HEADINGS` に `分割検討済み` を含まない。既存 parse 挙動に影響なし。

### J3: spec.md の Requirements / Scenarios が実装で充足されているか

**Requirement: validate 非ブロッキング警告**
- Scenario「15 項目以上で警告し exit 0」→ TC-001 でテスト固定済み。
- Scenario「14 項目以下では警告しない」→ TC-002 でテスト固定済み。
- 警告文に実測根拠（`8%`・`23%`）・`## 分割検討済み` 案内・`docs/request-authoring.md` 参照を含む（TC-011 で固定）。
- HTML コメント除去・行頭無インデントマーカーのみカウント → TC-007〜TC-010・TC-014 で検証済み。

**Requirement: request-review 縫い目判定観点**
- Scenario「system prompt に縫い目判定観点・3 基準・較正値が含まれる」→ TC-003 で固定済み。

**Requirement: 分割検討済み宣言が縫い目 finding を抑制する**
- Scenario「宣言尊重ルールが system prompt に含まれる」→ TC-004 で固定済み。

**Requirement: authoring guidance が崖の実測と宣言規約を記載する**
- Scenario「docs に実測値と宣言規約が記載される」→ TC-005 で固定済み（`8%`・`23%`・`15`・`## 分割検討済み`・`理由必須` を確認）。
- Scenario「request template が規模目安と宣言への言及を含む」→ TC-006 で固定済み。checkbox 数 2 件維持（TC-RIA-02 の不変条件）。

### J4: request.md の受け入れ基準が満たされているか

1. **受け入れ基準 15 項目以上で警告・exit 0** → TC-001 で固定。✅
2. **14 項目以下では警告なし** → TC-002 で固定。✅
3. **縫い目判定観点・3 基準・実測較正値をテストで固定** → TC-003・TC-012 で固定。✅
4. **宣言尊重ルールをテストで固定** → TC-004 で固定。✅
5. **docs/request-authoring.md に実測値と宣言規約が記載される** → TC-005 で固定。✅
6. **既存テストが無変更で green** → `bun run test` で 11284 passed / 1 skipped。TC-REQ-004・TC-RIA-02 を含む全既存テストが無改変で通過。✅
7. **`typecheck && test` が green** → `bun run typecheck` 無エラー、`bun run test` 全件 passed。✅

## 検証できなかった項目

None。すべての受け入れ基準と主要設計判断を実装・テストで確認した。

## Findings 詳細

None。
