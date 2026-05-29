# 死んだ prose パーサを削除し contract invariant を arch test で固定する（R4 / contract lock）

## Meta

- **type**: refactoring
- **slug**: remove-prose-parse-invariants
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

contract 実装 4 段階の最終 **R4 = contract lock**（expand→cutover→contract の contract）。R3（#472）で routing が typed outcome に cutover したため、prose ベースの判定経路が dead になった。これを削除し、契約を **arch test で恒久 enforce** にして「契約が自分自身を守る」状態にする。

裏取り済み（R3 merge 後の main）:
- `parseReviewVerdict`（`src/core/parser/review-verdict.ts`）は spec-review.ts / code-review.ts の `parseResult` から今も呼ばれる形だが、**executor は R3 で judge verdict を toolResult から導出するため、その parseResult は実行されない**（dead）。
- `parseFixableFindings`（`src/core/parser/review-findings.ts`）は **src 使用ゼロ**（R3 で `toolResult.fixableCount` に置換済み）。
- `parseFindingSeverityCounts`（同ファイル）も src 使用ゼロ。
- R1 の golden 床が `parseReviewVerdict` の TC-018/021 を floor として参照しているため、削除に合わせて **床を typed へ移行**する必要がある。

authority は `contract/invariants.md` / `contract/golden-cases.md`。

## 要件

1. **R3 で dead になった prose パーサを削除**:
   - `parseReviewVerdict` と `review-verdict.ts` を削除。spec-review / code-review の `parseResult` は prose-verdict 依存をやめる（Step interface を満たす最小実装に置換）。
   - `parseFixableFindings` を削除（src 使用ゼロを確認の上）。`parseFindingSeverityCounts` も dead なら同時に整理（実装時に最終確認）。
   - 対応する既存テスト（`tests/unit/parser/review-verdict.test.ts` / `tests/unit/parser/review-findings.test.ts` / **`tests/spec-review-verdict.test.ts`（`parseSpecReviewVerdict` 依存）** / **`tests/unit/step/code-review-verdict.test.ts`（`CodeReviewStep.parseResult` の prose テスト）**）を削除・整理。
2. **golden 床を prose→typed に移行**（R1 の床を更新、床を切らさない）:
   - obsolete になる prose-parse golden 参照（parseReviewVerdict TC-018/021）を除去。
   - 代わりに **typed outcome の golden case** を追加: judge `approved`(boolean)→verdict / **`approved=false ∧ fixableCount=0` の矛盾を弾く** / **null-toolResult judge → needs-fix**（R3 で確定した挙動を固定）。
3. **invariant を arch test で強制**（`contract/invariants.md` の INV-1〜3。**初期状態: INV-2（parseReviewVerdict 不在チェック）は parser 削除前は red・削除後に green、INV-1（transition `when` の fileContent 非参照）と INV-3 は最初から green**）:
   - INV-1/2: deterministic なコードが routing/outcome で agent の文章（`fileContent` 等）を読まない（transition の `when` が `fileContent` を参照したら fail、verdict は structured/grounded のみ）。
   - INV-3: 期待した JSON が無い時に prose で代用しない（retry / proceed、fallback 禁止）。
4. `bun run typecheck && bun run test` が green。

## スコープ外

- **stop-on-tool**（session を tool 捕捉で停止 / sessionId・usage を result メッセージから剥がす、claude-code adapter + executor）= 別 follow-on。
- managed / codex の typed 対応 = runtime follow-on。
- `contract/` 配下の編集（out-of-loop な authority）。

## 受け入れ基準

- [ ] `parseReviewVerdict` / `review-verdict.ts` が削除され、spec-review / code-review が prose-verdict に依存していない
- [ ] `parseFixableFindings` が削除されている（src 使用ゼロを確認）
- [ ] golden 床が typed outcome ベースに移行（obsolete な prose golden を除去し、judge approved / `approved=false∧fixableCount=0` 矛盾 / null→needs-fix を追加）
- [ ] arch test が INV-1〜3 を強制（transition `when` の `fileContent` 参照や routing の prose 読み取りで fail する）
- [ ] R1 由来の床が typed 形で維持され、既存テストが green
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **contract フェーズ（最終）**: R3 cutover で死んだ prose 経路を消し、契約を arch test で恒久 enforce にする。これで「契約が自分自身を守る」状態が完成する。
- **golden 床の移行**: prose-parse の床は parser 削除で意味を失うため、R3 で確定した typed 挙動の床に置換する（床を切らさず移す）。
- **振る舞い不変**: 削除対象は R3 後に呼ばれない dead コード。挙動は変わらない（type: refactoring）。
- **authority は `contract/invariants.md` / `contract/golden-cases.md`**: 新たな設計判断は無い（adr: false）。
- **`contract/` は編集対象にしない**: 契約を消費（enforce 実装）するだけ。
