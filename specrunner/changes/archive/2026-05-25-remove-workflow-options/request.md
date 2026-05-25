# request.md の `## Workflow Options` (`enabled` field) を deadcode として完全撤廃する

## Meta

- **type**: spec-change
- **slug**: remove-workflow-options
- **base-branch**: main
- **adr**: false

## 背景

request.md の `## Workflow Options` セクション内の `enabled: []` field は、**現状実質的な動作上の効果がない placeholder** として残存している。

### 実態調査

`enabled` の data flow:
1. `src/parser/request-md.ts` (約 50 行の抽出ロジック) で `## Workflow Options` セクションから `enabled: [...]` をパース
2. `ParsedRequest.enabled?: string[]` field に格納
3. **spec-review 経路**: `src/core/step/spec-review.ts:97` → `src/prompts/spec-review-system.ts:205` で `{{ENABLED}}` placeholder に `enabled.join(", ")` で展開、prompt に **"Enabled options: <list or none>"** として参考情報を挿入
4. **test-case-gen 経路**: `src/core/step/test-case-gen.ts:64` → `src/prompts/test-case-gen-system.ts:182-187` で `<must-areas>` セクションを構築。`enabled.length > 0` のとき `<must-areas>\n<list>\n</must-areas>` を agent に注入し、「`must-areas` 内のキーワードに該当する test case は MUST カテゴリに分類」を指示する

**それ以外の pipeline 制御効果はない** — step の skip / enable 制御には一切使われていない。

### 使用実績

archive 内の全 request.md (100+ 件) を grep した結果、`enabled` に値を入れた例は **過去 1 件のみ**:
- `2026-05-10-centralize-change-path/request.md`: `enabled: [test-case-generator]`
- これは当時 `test-case-generator` が opt-in 機能だった名残。**現在は標準 pipeline に組み込み済**で opt-in 不要

= 機能としても運用としても dead code 状態。

### 問題

- request 起票時に user が「`enabled` って何を入れるべき？」と迷う余地がある
- spec-review reviewer も「Enabled options: none」という意味不明な行を毎回受け取る
- 新規 contributor が parser / prompt の `enabled` 関連コードを読んで「何のための機能か」と混乱する
- future feature の placeholder として維持するなら spec / 用途を明示すべきだが、当面追加予定もない

## 要件

1. **`Workflow Options` セクションと `enabled` を全 dataflow から撤廃する**
   - `src/parser/request-md.ts`: `extractEnabled` 関数と関連抽出ロジックを削除 (line 152-248 周辺)
   - `src/parser/request-md.ts:57`: `enabled: raw.enabled` を削除
   - `ParsedRequest` 型から `enabled?: string[]` field を削除
   - `src/parser/rules/types.ts:31` の `ParsedRequestRaw` 型からも `enabled: string[]` field を削除
   - **spec-review 経路の撤廃**:
     - `src/core/step/spec-review.ts:97`: `enabled: deps.request.enabled` 行を削除
     - `src/prompts/spec-review-system.ts`: `{{ENABLED}}` placeholder + `Enabled options: {{ENABLED}}` 行 + `enabledStr` 計算ロジックを削除
     - `SpecReviewPromptInput` 型から `enabled?: string[]` field を削除
   - **test-case-gen 経路の撤廃**:
     - `src/core/step/test-case-gen.ts:64`: `enabled: deps.request.enabled` 行を削除
     - `src/prompts/test-case-gen-system.ts:175-194`: `enabled` field を `TestCaseGenPromptInput` 型から削除、`mustAreasSection` 計算ロジック + テンプレ内の `<must-areas>` 展開を削除
     - test-case-gen system prompt 本文 (line 57-59 周辺) の「`<must-areas>` セクションがあれば...」記述も削除

2. **request 起票テンプレ 2 箇所から `## Workflow Options` セクションを除去**
   - `src/core/command/request.ts` の `buildScaffoldTemplate()` 関数内の template 文字列で `## Workflow Options\n\n- enabled: []` セクションを削除
   - `src/prompts/request-generate-system.ts:29-32` の生成プロンプト template からも同セクションを削除（エージェント駆動 `request generate` フローで廃止済みセクションが生成され続けるのを防ぐ）
   - 新規 `request new <slug>` / `request generate "<text>"` 後の draft に当該セクションが含まれないようにする

3. **既存 request.md (archive 含む) の `## Workflow Options` セクションは parser で silent 無視**
   - 既存 archive 内の 100+ request.md には `## Workflow Options\n\n- enabled: []` が含まれる
   - parser はこれらを未知セクションとして silent に無視する（破壊しない、エラーにしない）
   - = 過去 archive の re-parse が壊れない

4. **delta spec で `enabled` 言及を整理する**
   - 以下の delta spec を本 request の `specrunner/changes/remove-workflow-options/specs/<capability>/spec.md` として作成し、baseline の対応箇所を削除する `REMOVED` 操作 (または `MODIFIED` で言及部分を除去) として表現する:
     - `request-md-parser`: baseline の `ParsedRequest` shape 記述から `enabled` field を除去
     - `request-management`: baseline から `enabled` 関連 Scenario / Requirement を除去 (Web app 構想の dead spec、本 request で同時整理)
     - `database`: baseline の `requests.enabled` column 記述を除去 (同上)
   - **MUST NOT**: `specrunner/specs/<capability>/spec.md` (baseline / authority spec) を直接編集してはならない。spec 変更は **必ず** delta spec path 経由で表現する

## スコープ外

- `Workflow Options` 相当の **後継機能の設計** (= opt-in workflow step を新規導入する場合は別 request)
- `request-management` / `database` spec 全体の整理（Web app 構想 spec が他にも未実装で残っている可能性、本 request では `enabled` 言及のみ対象）
- `archive/2026-05-10-centralize-change-path/request.md` の retro 編集（archive の歴史記録は不変、parser が silent ignore できれば実害なし）
- spec-review reviewer の prompt の他の placeholder (`{{SLUG}}` 等) の見直し

## 受け入れ基準

- [ ] `specrunner request new <slug>` で生成される draft に `## Workflow Options` セクションが含まれない
- [ ] `specrunner request generate "<text>"` で生成される draft にも `## Workflow Options` セクションが含まれない
- [ ] 既存 archive 内の `## Workflow Options\n- enabled: []` を含む request.md を再 parse しても error にならず、未知セクションとして silent 無視される
- [ ] `ParsedRequest` / `ParsedRequestRaw` / `SpecReviewPromptInput` 型から `enabled` field が消えている
- [ ] spec-review reviewer の prompt に `Enabled options: ...` 行が含まれない
- [ ] test-case-gen agent の prompt に `<must-areas>` セクション + 関連指示行が含まれない
- [ ] test-case-gen の TC-008/TC-009 (`<must-areas>` 関連 test) を削除 or `<must-areas>` 不在の挙動 test に置換
- [ ] `bun run typecheck && bun run test` が green
- [ ] 関連 unit test を更新 (parser の `## Workflow Options` 無視 test を追加、`enabled` 抽出 test を削除)
- [ ] test fixture オブジェクト (`tests/error-codes.test.ts` / `tests/pipeline-integration.test.ts` / `tests/cli-stdout-snapshot.test.ts` / `tests/multi-layer-defense.test.ts` 等) の `ParsedRequest` mock から `enabled: []` 行を削除
- [ ] `grep enabled specrunner/specs/{request-md-parser,request-management,database}/` で `ParsedRequest` shape / requests テーブル / Scenario の `enabled` 言及が残らない (= delta spec の REMOVED が baseline に適用された状態)

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- **後継機能を残すか撤廃するか**: 過去 1 件しか使用例がなく、その例も今は不要 (test-case-generator が標準化済)。**完全撤廃**を選択。将来 opt-in workflow option が必要になれば別途設計する
- **既存 archive の互換**: parser が `## Workflow Options` セクションを silent ignore する戦略で互換維持。archive の retro 編集は不要 (= 不変の歴史記録として尊重)
- **spec 側の整理範囲**: `enabled` 言及のみ撤廃。`request-management` / `database` spec の他の Web app 構想記述は本 request の対象外 (別途整理の余地)
