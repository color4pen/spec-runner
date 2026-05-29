# routing を typed outcome に cutover する（prose 依存を切る・agent escalation 廃止）

## Meta

- **type**: spec-change
- **slug**: outcome-cutover
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

R1（golden 床 / #470）・R2（typed outcome を additive に追加 / #471）が main 済み。本 request は contract 実装 4 段階の **R3 = cutover**。

R2 で `report_result` の typed outcome（producer=`status` / judge=`approved` (+code-review `fixableCount`)）が流れるようになった。R3 は **executor / transition が、prose ではなくこの typed outcome を読むように切替える**。expand→cutover→contract のうち cutover。

これは **pipeline 自身の「判断・停止の機構」を変える keystone** であり、`contract/step-outcome.md` を authority とする。**prose パーサの削除・stop-on-tool は本 request の scope 外**（下記）に分離して bounded に保つ。pipeline の判断機構を変える性質上、**人間 review を厚く・無人で素通しさせない**前提（contract の enforcement gate）。

影響を受ける capability: agent の完了/報告契約（tool-driven-step-completion / agent-output-contract / session-completion 系）。delta spec で表現する。

## 要件

1. **verdict を typed outcome から導出**（`src/core/step/executor.ts` の finalizeStep, 現状 L435 で prose を parseResult）:
   - judge（spec-review / code-review）: `toolResult.approved`(boolean) → `approved` / `needs-fix`。prose の `parseReviewVerdict` に依存しない。
   - producer: `toolResult.status`("success"/"error") → verdict。
   - prose パーサ自体は残す（R4 で削除）。**読む側を typed に切替えるだけ**。
2. **code-review の fixable routing を typed に**（`src/core/pipeline/types.ts` L122）: `parseFixableFindings(lastReview.outcome.fileContent)` → `toolResult.fixableCount`。
3. **agent escalation 廃止**: spec-review / code-review の `escalation` 経路（types.ts L103, L128）を削除。judge は `approved` / `needs-fix` のみ。halt は **loop 枯渇からのみ**（grounded）。**grounded な delta-spec-validation / verification の escalation は維持**（計算由来で self-report ではないため）。
4. **JSON が取れない時の扱い**（`contract/step-outcome.md` 準拠）:
   - malformed JSON（`reason: invalid-input`）→ 追撃で出し直し（既存 `DEFAULT_TOOL_RETRY`, 2回 → 3回目で halt）。
   - idle / no-tool-call（`reason: no-tool-call`）→ **halt せず次の step へ進む**（executor.ts L280 の halt を proceed に変更）。adapter は reason で両ケースを区別済みで、その挙動を維持する。下流の grounded な床が本当の問題を捕まえる。
   - **proceed 時の verdict（review #1 反映・golden case と接続）**:
     - **judge（spec-review/code-review）の null-toolResult → `needs-fix`**（保守側。`approved` でも `escalation` でもない）。escalation 遷移は削除済みのため、既定 `"escalation"` のままだと遷移表にマッチせず halt に倒れ、proceed と矛盾する。`needs-fix` なら fixer に回り、繰り返せば枯渇で halt（grounded）。golden-cases.md の「空/壊れ→非 approved」も満たす。
     - **producer の null-toolResult → 既存 `completionVerdict`（success）で proceed**（変更なし）。下流の verification が grounded に裏取り。
5. grounded step（verification / delta-spec-validation / pr-create）の挙動は不変。
6. `bun run typecheck && bun run test` が green（R1 の golden 含む既存テストが pass）。

## スコープ外

- prose パーサ（`review-verdict.ts` 等）の削除と arch test（INV-1〜3）= **R4**。cutover で死んだコードを次で消す。
- **stop-on-tool**（session を tool 捕捉で停止 / sessionId・usage を result メッセージから剥がす）= 別 follow-on。cutover の正しさには不要で、adapter は本 request では従来通り idle まで読んで toolResult を渡す。
- managed / codex の typed 対応 = runtime follow-on（未対応の間は「JSON 来ない→次へ」で degrade）。
- `contract/` 配下の編集（out-of-loop な authority）。

## 受け入れ基準

- [ ] judge の verdict が `toolResult.approved` 由来（prose 非依存）、producer が `toolResult.status` 由来になっている
- [ ] code-review の fixable routing が `toolResult.fixableCount` 由来（`parseFixableFindings(fileContent)` を routing に使っていない）
- [ ] spec-review / code-review の escalation 経路が無く、halt は枯渇のみ（grounded step の escalation は維持されている）
- [ ] idle / 有効 JSON 無し時に halt せず次 step へ進む（no-tool-call が halt しない）
- [ ] **null-toolResult の judge は `needs-fix` で次へ進む**（`approved`/`escalation` ではない）— golden case「空/壊れ→非 approved」と整合
- [ ] producer の null-toolResult は `completionVerdict`(success) で proceed する
- [ ] malformed(`invalid-input`) と no-tool-call を adapter が `reason` で区別し、その挙動を維持している（malformed は 2 回追撃 → 3 回目で halt）
- [ ] R1 の golden case 含む既存テストが green、振る舞いの regression が無い
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **cutover フェーズ**: R2 で並存させた typed outcome を「読む側」に切替える。prose パーサ削除は R4 に分離（cutover で死ぬ → 次で消す）。
- **null-toolResult の verdict（review #1 反映）**: judge は `needs-fix`（保守側・proceed・golden case と整合）、producer は `completionVerdict`(success)。既定 `"escalation"` 据え置きだと escalation 遷移削除と衝突して halt するため、judge を明示的に `needs-fix` に倒す。これが「judge で JSON 来ない時の verdict」の確定解。
- **stop-on-tool は分離**: cutover の正しさに不要（adapter は idle まで読んだまま toolResult を渡せる）。keystone の blast radius を下げる。
- **authority は `contract/step-outcome.md`**: 新たな設計判断は無いため adr: false（specrunner/adr に二重化しない）。
- **keystone・人間 review 厚め**: pipeline 自身の判断機構を変えるため、無人で素通しさせず人間 gate。床(R1)+型(R2) が守る。
- **`contract/` は編集対象にしない**: 契約を消費（実装）するだけ。
