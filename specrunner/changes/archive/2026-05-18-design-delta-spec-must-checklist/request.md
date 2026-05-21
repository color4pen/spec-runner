# design 完了条件にチェックリスト形式の delta spec MUST 規約を追加し、type=spec-change での取りこぼしを構造的に防ぐ

## Meta

- **type**: spec-change
- **slug**: design-delta-spec-must-checklist
- **base-branch**: main
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #283

## 背景

issue #283 (4 層防衛網突破) の Sub-task C。dsv 強化 (Sub-task A、PR #285) + spec-review 強化 (Sub-task B) で 2 層 / 3 層目を固めた上で、**design 自身に delta spec 作成の MUST 規律**を入れて 4 層目を作る。

### 観測例 (= PR #282)

- request type=spec-change
- design system prompt L11 / L27 / L56 / L145 / L175 で「(+ delta spec)」が言及されているが、**付録的な書き方で MUST 感が薄い**
- design は code-level の D1〜D6 (= pipeline.ts 行番号レベル) を詳細設計したのみで、specs/ 配下を作成しなかった
- 結果として後続層 (spec-review / dsv) でも catch されず implementer が authority spec を直接編集

### design prompt の現状

design system prompt L11 / L27 / L56 / L89-99 / L119 / L145 / L175 で delta spec 言及はあるが:

- L145: 完了条件として「design.md と tasks.md（および必要な delta spec）が存在する」と書いてある
- 「**必要な**」の判断が design 任意の解釈に任されている → type=spec-change のときは「必要」が必須化されない曖昧さ
- チェックリスト形式ではなく散文的記述 → step 完了時の self-check で見落とされやすい

関連 issue: #283

## 目的

design system prompt に **type=spec-change/new-feature のときの完了条件チェックリスト** (= openspec-propose skill 形式参考) を追加し、「(+ delta spec)」を「(MUST: delta spec ≥1 件)」に格上げする。design step 完了前の self-check で具体項目として確認させ、取りこぼしを構造的に防ぐ。

## 設計判断

1. **採用案: 完了条件をチェックリスト形式で明示**
   - 既存 L145 の散文的記述に加え、type 別の MUST 項目を箇条書きで明示
   - 「self-check 前にチェックリストを上から潰せ」というプロンプト規律で行動を縛る

2. **openspec-propose skill (= `~/Documents/GitHub/openspec-workflow/skills/openspec-propose/SKILL.md:113-132`) のチェックリスト形式を参考**:
   - delta spec MUST 規約をチェックリスト形式で並べる
   - 「- [ ] xxx」形式で具体項目を明示
   - design 自身が self-check で潰す前提

3. **不採用案: design step に外部 validator を組み込む**
   - すでに dsv (= Sub-A) と spec-review (= Sub-B) が機械 / 意味検査を担う
   - design 内に追加 validator を入れると責務が肥大化、prompt 規律で十分

4. **不採用案: 既存記述を完全置換**
   - 既存 L11 / L27 / L56 / L89-99 等は design 全体の構造説明として有用
   - 完了条件 (L145 周辺) のみチェックリスト化、他は維持

5. **type 別チェックリストの内容**:

   **spec-change / new-feature の場合 (= MUST)**:
   - [ ] `design.md` を作成した
   - [ ] `tasks.md` を作成した
   - [ ] **`specs/<capability>/spec.md` (delta spec) を 1 件以上作成した** ← 必須
   - [ ] delta spec の各 Requirement header が `## ADDED|MODIFIED|REMOVED Requirements` のいずれかに配置されている
   - [ ] `## MODIFIED Requirements` の各 Requirement header が baseline spec の header と一致している
   - [ ] delta spec の path が `specs/<capability-name>/spec.md` 形式である (= フラット path ではない)

   **bug-fix / refactoring の場合 (= delta spec 不要)**:
   - [ ] `design.md` を作成した
   - [ ] `tasks.md` を作成した

6. **完了 message 形式**:
   - design step 完了時の verdict 出力に「checklist:」セクションを設け、各項目に ✓ / ✗ を付ける
   - ✗ が 1 つでもあれば end_turn せず作業継続

## 要件

### 1. design-system.ts に完了条件チェックリストを追加

`src/prompts/design-system.ts`:

- 既存 L145 周辺 (= 完了条件記述) の後にチェックリスト段を追加:

```
## Completion Checklist (MUST self-check before end_turn)

Before ending the design step, verify the following checklist by request type.

### For `type: spec-change` or `type: new-feature` (= delta spec required)

- [ ] `design.md` is created in `<change>/<slug>/`
- [ ] `tasks.md` is created in `<change>/<slug>/`
- [ ] **At least one delta spec file is created under `<change>/<slug>/specs/<capability>/spec.md`** (REQUIRED)
- [ ] Each delta spec section header is `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, or `## RENAMED Requirements`
- [ ] Each `## MODIFIED Requirements` header matches an existing baseline header in `specrunner/specs/<capability>/spec.md`
- [ ] Each delta spec file path follows `specs/<capability-name>/spec.md` format (NOT a flat `specs/<name>.md`)

If any item is ✗, do NOT end_turn — fix the issue and re-check.

### For `type: bug-fix` or `type: refactoring` etc. (= delta spec not required)

- [ ] `design.md` is created
- [ ] `tasks.md` is created
```

### 2. type 参照の確認 (= 設計判断: `{{TYPE}}` 変数明示注入を採用)

`design-system.ts` の initial message は既に `requestContent` (= request.md 全文) を渡しており、agent は Meta セクションの `type:` を読める。ただしチェックリスト条件分岐 (= type 別に MUST 項目を切り替える) で確実に動作させるため、**`{{REQUEST_TYPE}}` 変数を明示注入する**設計を採用 (= spec-review-system.ts の前例に準拠):

- `design-system.ts` の prompt template に `{{REQUEST_TYPE}}` プレースホルダを追加
- `src/core/step/design.ts` (or `propose.ts`、step 名は実装確認) の `buildMessage` で `state.request.type` を `requestType` field として渡す
- spec-review-system.ts:85 / 104 / 189 と同じ pattern で `.replace(/{{REQUEST_TYPE}}/g, input.requestType)`

### 3. test

prompt 内容自体の test は困難なため、integration / e2e で実証:

`tests/pipeline-integration.test.ts` 等:

- TC: type=spec-change の request で design が specs/ を作成して step 完了する scenario (= 正常系)
- TC: prompt 文言の存在 grep (= `Completion Checklist` / `delta spec file is created` 等のキーワードが prompt 出力に含まれる)

多層防衛 (Sub-A + Sub-B + Sub-C 連携) の reproduction test は本 request のスコープ外、別 issue で扱う (= Sub-A/B/C 全 merge 後に統合 e2e test として追加)。

### 4. spec authority への反映 (= 既存 capability MODIFIED or 新規 ADDED の分岐)

`specrunner/specs/` 配下に design 関連 capability として **`propose-pipeline`** / **`propose-session`** が存在する (= design は historically `propose` と呼ばれており、現状の baseline は旧名で残存)。

更新方針:

- **第一選択**: `propose-pipeline/spec.md` (or `propose-session/spec.md`、baseline を Read して該当する方) を MODIFIED で更新
  - Requirement 追加: 「design step は type=spec-change/new-feature のとき delta spec 作成を MUST 完了条件として self-check する」
  - Scenario:
    - type=spec-change で delta spec 1 件以上作成して end_turn → 正常完了
    - type=spec-change で delta spec 不在のまま end_turn 試行 → completion checklist 違反として継続
- **適切な capability が無い場合 (= design 完了条件の baseline が現存しないとき)**: 新規 capability `design-completion` (or 同等の slug) を ADDED で作成する経路を取る

implementer が baseline を Read して判断し、いずれの経路でも本 Requirement を反映する。

## スコープ外

- dsv 機械 check (= Sub-A、PR #285 で完了)
- spec-review prompt 強化 (= Sub-B、別 request `spec-review-delta-spec-presence-check`)
- **多層防衛連携 e2e test** (= Sub-A + Sub-B + Sub-C 全 merge 後に統合 reproduction test として別 issue で扱う)
- design prompt の他項目 (= path-fence / role 説明 / 不採用案構造 等) の変更
- design step の sandbox / tool restriction 強化
- delta spec format 自動検証 (= openspec validate 相当機能の dsv 内 / spec-merge 内強化、別 issue)

## 受け入れ基準

- [ ] `src/prompts/design-system.ts` に「Completion Checklist」段が追加されている
- [ ] type=spec-change/new-feature のチェックリストで delta spec が MUST 項目として明示されている
- [ ] type=bug-fix/refactoring のチェックリストでは delta spec が必須でないことが明示されている
- [ ] design prompt から request type を参照できる経路が確立されている
- [ ] 統合 test で「type=spec-change で design が specs/ を作成して step 完了」が確認される
- [ ] prompt 文言の grep test (= `Completion Checklist` / `delta spec file is created` 等のキーワード存在) が pass する
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に Requirement が反映されている

## Workflow Options

- enabled: []
