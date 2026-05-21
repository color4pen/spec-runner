# request body 内の authority path 直接指定を構造的に防ぐ

## Meta

- **type**: spec-change
- **slug**: prevent-authority-path-in-request-body
- **base-branch**: main
- **adr**: true

## 背景

request body 内で authority path (= `specrunner/specs/<capability>/spec.md` を指す表記) を「MODIFIED で更新する」「ADDED で作成する」と直接書くと、agent (= implementer / spec-fixer) は prompt の `AUTHORITY_SPEC_GUARD` (= MUST NOT) より request body の具体指示を優先して authority を直接編集する事故が連続。

PR #294 で executor 側 (= 実行時) の防衛は実装されたが、**request 作成側の防衛が抜けている**。同じ pattern を書ける限り、agent は同じ過ちを繰り返す。

## 観測連鎖

5 件連続事故:

| PR | request body の writing | 結果 |
|---|---|---|
| #289 | authority path を MODIFIED 対象として記述 | guard なし → spec-merge で escalation |
| #291 | 新規 authority path を ADDED 対象として記述 | 同型 escalation |
| #294 | guard 実装 request 自体 (= 補完中) | merge 後 guard 有効化 |
| active 3 件 (= resume-from-step-name / vitest-e2e-category-removal / adr-generation-step) | 同じ pattern を繰り返し | guard が halt させた |

## 要件

1. **request-generate prompt の MUST 化** (= `src/prompts/request-generate-system.ts`):
   - 「authority path を request body 内で MODIFIED / ADDED の対象として直接記述してはならない。spec 変更は必ず delta spec path (= `specrunner/changes/<slug>/specs/<capability>/spec.md`) で表現する」旨を MUST 明示する
2. **request template scaffold への反映** (= `src/core/command/request.ts` の `buildScaffoldTemplate`):
   - 「spec 変更を伴う場合は delta spec path で表現する」guidance を scaffold に埋め込む
   - authority path を例文として書かない (= 誤読の素を作らない)
3. **request review の検出ルール強化** (= `src/prompts/request-review-system.ts`):
   - request body 内で authority path に対する編集動詞 (= 「MODIFIED」「ADDED」「を更新」「を作成」等) との共起を **HIGH severity finding** として検出する
   - 例外: 説明文脈 (= 「authority path であり編集禁止」のような referential 記述、policy 明文化、過去事例言及) は HIGH finding にしない
4. `bun run typecheck && bun run test` が green

## スコープ外

- delta-spec-validation (= dsv) の対象拡張 (= request body 内の path 表記まで dsv が見る形、別議論)
- 過去の active 配下 request の遡及修正
- `AUTHORITY_SPEC_GUARD` prompt fragment 自体の変更 (= PR #322 で完成済)
- request creation 以外の場面の防衛 (= implementer / spec-fixer 側は PR #294 で実装済)
- request body 内 path 表記の正規化 (= 大文字小文字 / 末尾スラッシュ等の正規化、検出に必要な範囲のみで対応)

## 受け入れ基準

- [ ] `src/prompts/request-generate-system.ts` に authority path 直接指定禁止の MUST 規律が明示されている
- [ ] `buildScaffoldTemplate` 出力に delta spec path の guidance が含まれている (= authority path 例文を含まない)
- [ ] `src/prompts/request-review-system.ts` に「authority path + 編集動詞」共起の HIGH finding 検出ルールが追加されている
- [ ] `REQUEST_REVIEW_SYSTEM_PROMPT` が **検出ルール本体のテキスト** (= 「authority path + 編集動詞共起を HIGH finding として検出する」旨) を含むことを string assertion で確認する test が追加されている (= regression 防止)
- [ ] `REQUEST_REVIEW_SYSTEM_PROMPT` が **referential 除外節のテキスト** (= 「authority path であり編集禁止」のような policy 言及は HIGH finding にしない旨) を含むことを string assertion で確認する test が追加されている (= 既存 `tests/unit/command/request-review.test.ts` 同様の prompt 文字列 contains assertion パターン)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
