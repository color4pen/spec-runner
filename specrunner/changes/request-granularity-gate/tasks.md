# Tasks: 過大 request の粒度ゲート

## T-01: 受け入れ基準の top-level 項目数カウント（純関数）

- [ ] `src/parser/extract-section.ts` に `countTopLevelAcceptanceCriteria(content: string): number` を追加する
- [ ] 実装: 既存の `extractMarkdownSections(content, ["受け入れ基準"])` で節本文を取得する（無ければ 0 を返す）
- [ ] 節本文から HTML コメント（`<!-- ... -->`、複数行）を除去してから数える
- [ ] 行頭無インデントのリストマーカー（`-` / `*` / `+` / `N.` / `N)` の後に空白）のみを top-level 項目として数える。インデント済み（ネスト）行は数えない
- [ ] 純関数（I/O なし）として保つ

**Acceptance Criteria**:
- `countTopLevelAcceptanceCriteria` が受け入れ基準 15 項目の request 内容に対し 15 を返す
- ネストされた（インデント）サブ項目や HTML コメント内の行は数えない
- `受け入れ基準` 節が無い内容に対し 0 を返す
- `typecheck` が green

## T-02: executeValidate に規模警告を追加（非ブロッキング）

- [ ] `src/core/command/request.ts` に閾値定数 `ACCEPTANCE_CRITERIA_WARN_THRESHOLD = 15` を追加する（config 化しない — コメントで実測較正値である旨を明記）
- [ ] `executeValidate` の parse 成功後に `countTopLevelAcceptanceCriteria(content)` を呼び、閾値以上なら `logWarn`（`src/logger/stdout.ts`）で stderr へ警告する
- [ ] 警告文に実測根拠（archive 499 件・15 本以上で一発完走率 8%・exhausted 23%）と、分割検討 / `## 分割検討済み` 宣言の追記案内、`docs/request-authoring.md` への参照を含める
- [ ] 警告は exit code に影響させない（design-layer gate の判定より前でも後でもよいが、gate 有効無効に関わらず出るよう parse 成功直後に置く）

**Acceptance Criteria**:
- 受け入れ基準 15 項目以上の request.md に対し `executeValidate` が stderr 警告を出し、戻り値 0 を維持することをテストで固定する（新規テスト）
- 受け入れ基準 14 項目以下では警告が出ないことをテストで固定する（新規テスト）
- 既存 `TC-REQ-004`（受け入れ基準 1 項目 → stderr 無出力）が無変更で green
- テストは `tests/unit/core/command/request.test.ts` に describe を追記する形で追加し、既存 test case を改変しない
- `typecheck && test` が green

## T-03: request-review system prompt に縫い目判定 Method を追加

- [ ] `src/prompts/request-review-system.ts` の `REQUEST_REVIEW_BASE` の Method に「Granularity Seam Judgment（縫い目判定）」を Method 6 として追加する
- [ ] 観点: この request は独立して収束できる単位を 2 つ以上含むか
- [ ] 分割判定 3 基準を `docs/request-authoring.md` と同一文言で記載: 独立して設計・テストできる → 切る / 収束の意味論が異なる → 必ず切る / 受け入れ基準の相互参照 → 切らない
- [ ] 実測較正値を根拠として記載: 受け入れ基準 15 本以上は実測で一発完走率 8%・exhausted 23%（archive 499 件）
- [ ] 分割線が見つかれば decision-needed finding として土台→上物の分割案を提示する旨を記載（`options` 2 件以上は既存 `DECISION_NEEDED_DEFINITION` が要求）
- [ ] 宣言尊重ルールを記載: request.md に理由付きの `## 分割検討済み` 節がある場合は縫い目 finding を上げない（スコープ外宣言を意図的省略として尊重するのと同型）
- [ ] 既存の Method 1–5・severity 定義・verdict 導出・read-only 制約は保持する（削除・改変しない）

**Acceptance Criteria**:
- `REQUEST_REVIEW_SYSTEM_PROMPT` に縫い目判定観点・分割判定 3 基準・実測較正値（8% / 23% / 15）が含まれることをテストで固定する（新規テスト）
- 分割検討済み宣言を含む request に縫い目 finding を上げない規則が prompt に含まれることをテストで固定する（新規テスト）
- テストは新規ファイル（例 `tests/prompts/request-review-seam.test.ts`）で追加し、既存 `tests/prompts/request-review-system.test.ts` の test case を無改変で green のまま保つ
- `typecheck && test` が green

## T-04: docs/request-authoring.md 粒度節に実測と宣言規約を追記

- [ ] `docs/request-authoring.md` の `## 粒度 — 1 request は 1 つの収束ループ` 節に、崖の実測を追記する: 10 本超で黄信号、15 本以上で一発完走率 8%・exhausted 23%（archive 499 件）
- [ ] 同節に分割検討済み宣言の規約を追記する: 書式 `## 分割検討済み` 節・request.md への配置・理由必須（なぜ分割せず単一 request として実行するか）
- [ ] 既存の質的分割基準 3 つ（design.md と同一文言）は残し、量的目安を補う形で追記する

**Acceptance Criteria**:
- 粒度節に 15 本以上で一発完走率 8% の実測と、分割検討済み宣言の書式・理由必須の規約が記載される
- 既存テストが無変更で green

## T-05: request template の受け入れ基準コメントを更新

- [ ] `src/core/command/request.ts` の `buildScaffoldTemplate` の `受け入れ基準` 節 HTML コメント（`<!-- コツ: 機械検証できる文 ... -->`）内に、規模の目安（15 項目以上で validate が警告する旨）と `## 分割検討済み` 宣言への言及を追記する
- [ ] 追記は HTML コメント内に閉じる。新しい checkbox（`- [ ]`）を追加しない（既存 `TC-RIA-02` の checkbox 数 2 の固定を壊さない）

**Acceptance Criteria**:
- `buildScaffoldTemplate` 出力の受け入れ基準コメントに規模目安と分割検討済み宣言への言及が含まれる
- template の top-level checkbox 数は変わらない（既存 `TC-RIA-02` が無変更で green）
- `buildScaffoldTemplate` 出力が `parseRequestMdContent` を通過する（契約不変）
- `typecheck && test` が green

## T-06: 全体検証

- [ ] `bun run typecheck` が green
- [ ] `bun run test` が green（新規テスト含む・既存テスト無変更）

**Acceptance Criteria**:
- `typecheck && test` が green
- 既存テストは 1 件も改変されていない
