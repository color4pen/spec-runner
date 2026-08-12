# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### AC1: 受け入れ基準 15 項目以上で validate が stderr 警告・exit 0 を維持

**実装確認**: `src/core/command/request.ts`
- `ACCEPTANCE_CRITERIA_WARN_THRESHOLD = 15` 定数（コード定数、コメントで実測根拠を明記）
- parse 成功後に `countTopLevelAcceptanceCriteria(content)` を呼び、`acCount >= 15` のとき `logWarn` で stderr 出力
- `logWarn` は exit code を変えない（`return` しない）

**テスト確認**: `tests/unit/core/command/request.test.ts` TC-001
- 15 項目 → exit 0 ✓
- 15 項目 → stderr に "Warning:" ✓
- 20 項目 → exit 0 ✓

---

### AC2: 受け入れ基準 14 項目以下では警告なし

**テスト確認**: TC-002
- 14 項目 → no "Warning:" ✓
- 1 項目（TC-REQ-004 と同型）→ no "Warning:" ✓

**TC-REQ-004 リグレッション確認**: `buildValidRequestMd()` は受け入れ基準 1 項目。`1 < 15` なので `logWarn` 不発。`stderrMock` は未呼び出し。✓

---

### AC3: request-review system prompt に縫い目判定観点・3 基準・実測較正値

**実装確認**: `src/prompts/request-review-system.ts` — Method 6 "Granularity Seam Judgment（縫い目判定）" を追加
- 縫い目の問い（独立して収束できる単位を 2 つ以上含むか）✓
- 分割判定 3 基準（docs と同一文言）✓
- 実測較正値（8% / 23% / archive 499 件）✓
- decision-needed finding として土台→上物の分割案を提示する指示 ✓
- 宣言尊重ルール ✓
- 既存 Method 1–5・read-only 制約・verdict 導出は保持 ✓

**テスト確認**: `tests/prompts/request-review-seam.test.ts` TC-003
- 縫い目観点・各基準・較正値・decision-needed を regex で固定 ✓

---

### AC4: 分割検討済み宣言尊重ルールが prompt に含まれる

**実装確認**: Method 6 末尾に宣言尊重ルールを明記
- "request.md に理由付きの `## 分割検討済み` 節がある場合は縫い目 finding を上げない"
- "理由のない宣言は尊重しない"

**テスト確認**: TC-004
- `/分割検討済み/` ✓
- `/理由|reason/i` ✓
- `/分割検討済み.{0,100}(finding|尊重|skip|上げない)/s` ✓

---

### AC5: docs/request-authoring.md に実測値と宣言規約

**実装確認**: `docs/request-authoring.md` 粒度節に追記
- 実測テーブル（1–3 / 4–6 / 7–9 / 10–14 / 15+ の完走率・exhausted 率）✓
- "15 項目以上で非ブロッキング警告" の案内 ✓
- `## 分割検討済み` 宣言の書式・置き場所・理由必須の規約 ✓

**テスト確認**: `tests/unit/docs/request-authoring-granularity.test.ts` TC-005
- "8%" / "23%" / "15 項目以上" / "## 分割検討済み" / "理由必須" を全確認 ✓

---

### AC6: request template の受け入れ基準コメントに規模目安と宣言への言及

**実装確認**: `buildScaffoldTemplate` の受け入れ基準 HTML コメントに追記
- "15 項目以上で `specrunner request validate` が警告を出す（archive 499 件の実測で一発完走率 8%）" ✓
- "## 分割検討済み 節に理由を記載する" ✓
- HTML コメント内に閉じ、新 checkbox なし ✓

**テスト確認**: TC-006 と TC-RIA-02（checkbox 数 = 2 の固定）✓

---

### countTopLevelAcceptanceCriteria 純関数

**実装確認**: `src/parser/extract-section.ts`
- `extractMarkdownSections(content, ["受け入れ基準"])` で節本文取得
- `body.replace(/<!--[\s\S]*?-->/g, "")` で HTML コメント除去（単行・複数行）
- `^[-*+]\s|^\d+[.)]\s` で行頭無インデントマーカーを数える（インデント行は除外）

**テスト確認**: TC-007 / TC-008 / TC-009 / TC-010 / TC-014
- 15 項目で 15 ✓
- インデントネストを除外 ✓
- HTML コメント内を除外（1 行・複数行とも）✓
- 節なし → 0 ✓
- `-` / `*` / `+` / `1.` / `1)` の 5 種マーカー全認識 ✓

---

### TC-011: 警告文の内容検証

`executeValidate` が出力する警告文に TC-011 でテスト:
- `8%` または `23%`（実測根拠の数値）✓
- `分割検討`（宣言案内）✓
- `docs/request-authoring.md`（参照）✓

---

### 全体検証（verification-result.md 確認）

| Phase | Status |
|-------|--------|
| build | passed |
| typecheck | passed |
| test | passed (11284 passed, 1 skipped) |
| lint | passed |
| changed-line-coverage | passed |

---

## 検証できなかった項目

None — 全 14 TC に対応する実装・テストを直接確認済み。

## Findings 詳細

None
