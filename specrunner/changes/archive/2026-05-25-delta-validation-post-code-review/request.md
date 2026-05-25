# baseline 編集違反を pipeline 内で構造的に検出・自動修正する (= delta-spec-validation を code-review 後にも再実行 + 違反検出 rule 追加)

## Meta

- **type**: spec-change
- **slug**: delta-validation-post-code-review
- **base-branch**: main
- **adr**: true

## 背景

agent が `specrunner/specs/<capability>/spec.md` (= authority / baseline spec) を **直接編集してしまう事故** が累積している。同型問題の issue が 5 件 (#383, #385, #299, #316, #263) open で、memory `feedback_avoid_patchwork` (3 件で構造変更を疑う) を超えており、**構造的な根絶策が必要**。

### 既存対策と限界

| タイミング | 対策 | 限界 |
|---|---|---|
| user の request 起票時 | `request review` agent が baseline path 直接記述を指摘 | LLM 任せで漏れる |
| agent session 開始時 | `rules.ts` の baseline 編集禁止 rule を全 agent に注入 | agent が判断を誤れば違反する |
| 各 step commit 直前 | `src/core/step/commit-push.ts:91-98` で staged file を grep → `authoritySpecEditViolationError` で **pipeline halt** | 違反 1 件で全 pipeline が止まり、agent の work が捨てられる |
| `finish` Phase 1 spec-merge | delta → baseline 適用時に integrity check、escalation で halt | 違反の根本原因 (= agent の直接編集) に対処していない |

「commit-push の inline halt」が現状の最終防衛だが、agent の **fixing iteration loop が存在しない** ため、違反 = halt = 手動介入になる。

### 提案する構造解

既存の `delta-spec-validation` + `delta-spec-fixer` の loop 構造を **再利用**して、baseline 編集違反を pipeline 内の決定論的検査 + agent self-fix で吸収する。

具体的には:
- `delta-spec-validation` の rules に **baseline 直接編集の検出 rule** を追加（既存 design 後の検証は強化されるだけで regression なし）
- `code-review approved` の transition 先に `delta-spec-validation` を **2 回目として** 呼ぶ (= code-fixer loop で agent が baseline 編集してしまった場合をキャッチ)
- `delta-spec-fixer` の prompt に **baseline path → delta path への move 指示** を追加
- `commit-push.ts` の inline halt は削除し、warning ログ化 (= pipeline を殺さない、検出は log として残す)

これで agent は **self-fix のチャンスを得て** pipeline 続行できる。memory `cli_design` の「LLM 不確定性を決定論的検証で吸収する」設計思想と整合。

## 要件

1. **新 rule の追加: baseline 直接編集の検出**
   - `src/core/spec/rules/no-authority-spec-direct-edit.ts` を新設
   - `git diff <base-branch>..HEAD --name-only` で `specrunner/specs/<capability>/spec.md` 配下の変更を検出 (delta path 配下は除外)
   - 違反があれば `delta-spec-validation` の violations list に追加
   - `src/core/spec/rules/registry.ts` に登録
   - **interface 拡張が必要**: 現状 `DeltaSpecRuleInput` / `DeltaSpecValidatorFs` (`src/core/spec/rules/types.ts`) は fs 操作のみで git 操作を持たない。新 rule は git diff を必要とするため、以下のいずれかで interface を拡張する:
     - (a) `DeltaSpecRuleInput` に `baseBranch: string` + `gitDiffFiles: () => Promise<string[]>` を追加
     - (b) `validateDeltaSpecPaths()` 呼び出し側 (= `DeltaSpecValidationStep.run`) で git diff を事前実行し、解決済みの変更 file リストを `DeltaSpecRuleInput` に注入
   - どちらを採用するかは design step で決定 (実装方針として両案を検討対象)
   - **`DeltaSpecViolationReason` union の拡張**: 新 rule が出す violation の `reason` を表す新リテラル (例: `"authority-spec-direct-edit"`) を `src/core/spec/delta-spec-validator.ts` の `DeltaSpecViolationReason` union に追加する

2. **`delta-spec-validation` を code-review 後にも再実行する pipeline transition 追加 (既存 step 再利用)**
   - **新規 step name を追加せず、既存 `delta-spec-validation` / `delta-spec-fixer` を再利用する**。これにより wrapper / prompt / STEP_NAMES の重複を避ける
   - 問題: `(delta-spec-validation, approved)` の遷移先が design 直後 (= spec-review) と code-review 後 (= adr-gen) で **異なる必要がある**が、`STANDARD_TRANSITIONS` は `(step, verdict)` の単純 lookup で両立できない
   - 解: pipeline engine の **transition 解決ロジックを context-aware 化** する:
     - `src/core/pipeline/pipeline.ts` の `runInternal()` 内の transition lookup (= line 245-247 周辺の `this.transitions.find(...)`) を、現在の state.steps から context を読み取って分岐できる形に改修
     - 判定軸: `state.steps["code-review"]` に attempt が存在するか → 存在すれば「2 回目」、なければ「1 回目」
     - 1 回目 (= design 直後): `delta-spec-validation approved → spec-review` (既存挙動維持)
     - 2 回目 (= code-review 後): `delta-spec-validation approved → adr-gen` (新規)
   - `src/core/pipeline/types.ts` の `Transition` 型を拡張して context predicate を持てるようにするか、新たに `ConditionalTransition` 種別を追加する (実装方針は design step で決定)
   - `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` 追加内容:
     - `code-review approved → delta-spec-validation` (新規、2 回目呼び出し)
     - `delta-spec-validation approved → adr-gen` (context 「2 回目」の場合のみ、既存の `→ spec-review` と共存)
   - `delta-spec-fixer` の既存 loop (`delta-spec-validation needs-fix → delta-spec-fixer → delta-spec-validation`) は **そのまま 2 回目フェーズでも機能** (= STANDARD_LOOP_FIXER_PAIRS に追加不要)

3. **`delta-spec-fixer` の prompt 拡張**
   - `src/core/step/delta-spec-fixer.ts` の prompt に「baseline path 直接編集の rollback + delta path への書き直し」指示を追加
   - 既存の delta format 修正指示も維持

4. **`commit-push.ts` の inline halt 削除 + warning ログ化 (2 経路とも対応)**
   - `commit-push.ts` には baseline 違反を検出する 2 つの throw 経路があり、**両方とも削除する**:
     - **staged-changes path** (`src/core/step/commit-push.ts:91-98`): pipeline が staged file を commit する直前の check
     - **HEAD-diff path** (`src/core/step/commit-push.ts:74-78`): agent が self-commit した後の HEAD diff check
   - 両 path とも `throw authoritySpecEditViolationError(...)` を削除
   - `findAuthoritySpecViolations()` の検出ロジックは残し、違反検出時は `stderrWrite("Warning: ...")` で log 出力
   - pipeline は halt せず続行（後段の新 delta-spec-validation iter で本格対応）

5. **spec / rules.md 側の整理**
   - `specrunner/specs/delta-spec-rule/spec.md` (= 既存 baseline) に新 rule の Requirement / Scenario を追加 (delta spec path 経由)
   - `src/prompts/rules.ts` の path 真理セクションに「baseline 編集違反は delta-spec-validation で検出され、delta-spec-fixer が修正する」フローを追記

## スコープ外

- **`verification` step** (build/test) — baseline 編集違反とは別軸、触らない
- **`spec-review` の責務拡張** — semantic レビューは別軸、本 request では責務を delta-spec-validation 側に集約しない
- **`request review` / `request generate` の baseline path 検出強化** (#299) — 起票時の予防は別 request で
- **tool permission による SDK レベルの遮断** — 長期対策として残す、本 request では artifact / pipeline レベルで対応
- **`finish` Phase 1 spec-merge の integrity check** — そのまま維持、最終 safety net として残す
- **既存 archive 内の違反 retro 修正** — archive は不変、本 request では対象外
- **新規 step name の追加 (= wrapper step)** — `delta-spec-validation-post-review` 等の別 step 名を新設する案は wrapper 重複・prompt 重複・STEP_NAMES 混乱を生むため不採用 (要件 2 参照、既存 step を再利用する方針)

## 受け入れ基準

- [ ] `delta-spec-validation` の rules に `no-authority-spec-direct-edit` が登録されている
- [ ] design 後の delta-spec-validation で新 rule も実行される (= regression なし、かつ新 rule の検出が機能)
- [ ] code-review approved 後に delta-spec-validation が再実行される
- [ ] code-fixer loop で baseline 直接編集が発生した場合、delta-spec-validation が `needs-fix` を返し、delta-spec-fixer が起動する
- [ ] delta-spec-fixer が baseline path への変更を rollback し、対応する delta path に書き直す
- [ ] 修正後の delta-spec-validation が `approved` を返し、adr-gen → pr-create に進める
- [ ] `commit-push.ts` で baseline 違反検出時に halt せず、warning が stderr に出力される
- [ ] pipeline の既存挙動 (design → spec-review → ... → code-review approved まで) に regression なし
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 test 追加 (新 rule の unit test、pipeline transition の integration test)

## architect 評価済みの設計判断

- **既存 step 再利用 vs 新規 step 追加**: `delta-spec-validation` + `delta-spec-fixer` を再利用する案を採用。理由は (i) 既存 loop / fixer 機構をそのまま使える、(ii) baseline 違反と delta format 違反は「spec の path / 構造の正しさ」という同じ軸の問題、(iii) 新規 step を増やすと wrapper / prompt 重複と pipeline 認知負荷が上がる
- **transition lookup の context-aware 化**: `STANDARD_TRANSITIONS` の単純 lookup を `state.steps` の context (= code-review attempt の有無) で分岐できるよう拡張する。pipeline engine の改修は 1 関数の修正に収まり、wrapper 重複を生む別 step name 案より総コストが低い
- **`commit-push.ts` の inline halt は削除**: 新 step pair に責務を集約。warning log は残して early detection のヒントは保持
- **memory `feedback_avoid_patchwork` への回答**: 同型問題 5 件 (#383, #385, #299, #316, #263) のうち、本 request は **artifact + pipeline レイヤーでの構造解**を提供。各 issue を個別に close できない場合でも、本 request 完了で実害は大幅に減る。残る予防策 (request 起票時 / tool permission) は別 request で段階的に追加
- **memory `cli_design` への整合**: LLM 不確定性を pipeline 内の決定論的検証 + agent self-fix で吸収する設計思想と一致
