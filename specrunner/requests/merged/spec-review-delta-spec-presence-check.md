# spec-review prompt に「type=spec-change/new-feature なら specs/ 配下 delta spec 存在」HIGH severity check を追加する

## Meta

- **type**: spec-change
- **slug**: spec-review-delta-spec-presence-check
- **base-branch**: main
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #283

## 背景

issue #283 (4 層防衛網突破) の Sub-task B。dsv 強化 (= Sub-task A、PR #285) で **1 層目**は固めたが、spec-review にも同じ check を入れて **2 層化** することで防衛網の冗長性を確保する。

### 観測例 (= PR #282)

- request type=spec-change
- design が `specs/` 配下に delta spec を作成しないまま completed
- **spec-review が「3 アーティファクト整合 (request/design/tasks)」と書いて approved** → 4 層目 (implementer) で authority spec を直接編集する経路に流れた
- dsv も approved で通過 (= 当時の dsv は specs/ 不在 check 無し、PR #285 で対策済)

### spec-review prompt の現状

`src/prompts/spec-review-system.ts:94`:
> Review all spec files in the change folder (request.md, design.md, tasks.md, specs/).

**specs/ を review 対象に含める指示はあるが、specs/ 不在 (= delta spec ゼロ) を type と照合して fail にする logic が無い**。中身の整合 check (L63 / L67) のみで、存在 check が抜けている。

関連 issue: #283

## 目的

spec-review prompt に「**type=spec-change/new-feature のとき specs/ 配下に delta spec が 1 件以上必須**、不在なら HIGH severity finding」check を追加し、dsv と並列で防衛網 2 層目を作る。dsv 単独で防げない edge case (= dsv が bug で通してしまった場合) を spec-review が catch する冗長構造。

## 設計判断

1. **採用案: spec-review-system.ts に明示 check 段を追加 (= prompt level 強化)**
   - 既存 check (= MODIFIED/ADDED 中身整合、L63 / L67) と並列で「具体 check 0: delta spec presence」を追加
   - HIGH severity に固定 (= verdict が自動的に needs-fix になり spec-fixer に流れる)

2. **不採用案: spec-review が dsv 結果を直接参照**
   - 層を絡めると依存が増える、dsv は独立で動かす方が clean
   - prompt level で各 review agent が独立判定する方が責務明確

3. **不採用案: dsv 単独で十分とする**
   - dsv が将来 bug を持つ可能性 + 機械検査と意味検査は独立軸 (= 防衛網は冗長な方が安全)

4. **type 判定の参照**:
   - spec-review prompt は initial message から request type を読み取れる前提 (= 確認必要)
   - 既存 prompt が `requestContent` や `parsedRequest.type` 等で type を持っているか確認、無ければ追加

5. **既存 dsv との重複は意図的**:
   - dsv = 機械的 check (= specs/ 数を数える)
   - spec-review = 意味的 check (= 「この request の内容に対して delta spec の Requirement が足りているか」もカバー)
   - 同じ「存在 check」は両層で行うが、spec-review はそれ以上の semantic check も含むため重複ではなく補強

6. **finding 形式**:
   - 既存 spec-review の findings format (severity / category / location / message / hint) に準拠
   - severity: HIGH 固定
   - category: completeness or consistency
   - location: `specrunner/changes/<slug>/specs/`
   - message: `Request type '<type>' requires a delta spec, but specs/ directory contains no .md files in the change folder.`
   - hint: `Add delta specs under specs/<capability>/spec.md before re-reviewing.`

## 要件

### 1. spec-review-system.ts に specs/ presence check を追加

`src/prompts/spec-review-system.ts`:

- 既存「Review all spec files」段 (L94 周辺) の後に新規 check 段を追加:

```
## Check 0: Delta spec presence (for spec-change / new-feature)

If the request type is `spec-change` or `new-feature`:
- The change folder MUST contain at least one delta spec file under `specs/<capability>/spec.md`
- If `specs/` is empty or missing, report a HIGH severity finding (category: completeness):
  - location: `specrunner/changes/<slug>/specs/`
  - message: "Request type '<type>' requires a delta spec, but specs/ directory contains no .md files in the change folder."
  - hint: "Add delta specs under specs/<capability>/spec.md before re-reviewing."
- This check is in addition to the dsv (delta-spec-validation) machine check.

If the request type is `bug-fix` or `refactoring` etc., this check does not apply.
```

### 2. type の参照経路を確認 (= コード変更不要の可能性大)

spec-review prompt は **既に `{{REQUEST_TYPE}}` template variable で request type を注入済**:

- `src/prompts/spec-review-system.ts:85`: `Request type: {{REQUEST_TYPE}}`
- `src/prompts/spec-review-system.ts:104,189`: `requestType: string` field + `.replace(/{{REQUEST_TYPE}}/g, input.requestType)`
- `src/core/step/spec-review.ts:117`: `requestType: state.request.type` で渡している

→ **本要件はコード変更不要、確認のみ**。要件 1 のチェックリスト追加で既存 `{{REQUEST_TYPE}}` を参照すれば条件分岐できる。

### 3. test

prompt 文言遵守そのものの test は integration では agent が mock されるため証明困難。test の証明軸を「pipeline routing」に絞り、prompt 遵守は E2E (= 実 agent で run する dogfood) に委ねる:

`tests/pipeline-integration.test.ts` 等:

- TC: type=spec-change で specs/ 不在 + spec-review が (mock で) HIGH severity finding + needs-fix を返したとき、pipeline が spec-fixer に正しく遷移する (= routing 証明)
- TC: type=bug-fix で specs/ 不在 + spec-review が approved を返したとき、pipeline が次 step に進む (= regression なし)
- TC: type=spec-change + specs/ 1 件以上で spec-review が approved → 次 step (= test-case-gen / implementer) に進む

prompt 文言の追加 (= 要件 1 の「Check 0: Delta spec presence」段の存在) は grep test で簡易確認:

- TC: `src/prompts/spec-review-system.ts` の出力に「Delta spec presence」「specs/ directory contains no .md files」等のキーワードが含まれる

実 agent が prompt に従って HIGH severity を返すかどうかの最終証明は dogfood (= 本 request 自体の e2e run + 本 request merge 後の他 spec-change request の run) で行う。

### 4. spec authority への反映

`specrunner/specs/<spec-review 関連 capability>/spec.md` を MODIFIED で更新:

- Requirement 追加: 「spec-review は type=spec-change/new-feature のとき specs/ 配下の delta spec 存在を必須として check し、不在の場合 HIGH severity finding を返す」
- Scenario:
  - type=spec-change で specs/ 配下 0 件 → HIGH finding + verdict needs-fix
  - type=bug-fix で specs/ 配下 0 件 → 本 check は対象外
  - type=spec-change で specs/ 配下 1 件以上 → 本 check は通過、他 review 観点に進む

該当 capability は `spec-review` 関連 (baseline 確認して特定)。

## スコープ外

- design 完了条件 MUST 化 (= #283 Sub-task C、別 request)
- dsv の機能拡張 (= PR #285 で完了済)
- spec-review の他 check 観点 (= 既存 MODIFIED/ADDED 整合や他軸) の変更
- review prompt の他文書 (= request.md / design.md / tasks.md) 整合 check 強化

## 受け入れ基準

- [ ] `src/prompts/spec-review-system.ts` に「Check 0: Delta spec presence」段が追加されている
- [ ] spec-review prompt から request type を参照できる経路が確立されている
- [ ] 統合 test で「type=spec-change で specs/ 不在 → spec-review が HIGH finding + needs-fix」が確認される
- [ ] type=bug-fix では本 check が対象外 (= regression なし)
- [ ] type=spec-change + specs/ 1 件以上で本 check は通過 (= 既存挙動維持)
- [ ] `bun run typecheck && bun run test` が green
- [ ] spec authority に Requirement が反映されている

## Workflow Options

- enabled: []
