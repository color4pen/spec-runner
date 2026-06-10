# request の現状コード断定を design / request-review が実コードと突き合わせる

## Meta

- **type**: spec-change
- **slug**: request-fact-check
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

request.md には「現状のコードはこうなっている」という断定（file:line を伴う記述）が含まれるが、pipeline はこれを検証せずに信頼する。request↔spec の整合は spec-review が検証する一方、request↔実コードの事実関係はどの step も突き合わせない。このため、具体的で自信のある誤った断定が request に書かれると、design がそれを前提に設計し、誤りがそのまま実装される。曖昧な記述なら design が自力で調査するのに対し、間違った精密さは調査を先回りして封じるため、より危険である。

request 内のコード現状の断定を untrusted input として扱い、消費側（design / request-review）に実コードとの突き合わせ工程を入れる。

## 現状コードの前提

- request テンプレートは `src/core/command/request.ts` 内の literal で、節は 背景 / 要件 / スコープ外 / 受け入れ基準 / architect 評価済みの設計判断（`request.ts:33-41` 周辺）
- request-review agent は read-only の codebase 探索権限を既に持つ（`src/prompts/request-review-system.ts:33` / `:198`）
- design agent は実コード編集不可だが Read tool で参照可（`src/prompts/design-system.ts:42` / `:106-108`）
- validate は現在どのセクションの存在チェックも行わない（実ルールは `src/parser/rules/` の Meta 系 7 ルール: title / type / slug / base-branch / adr）。`src/parser/extract-section.ts:80-84` の スコープ外 / 受け入れ基準 等の見出し定数は design / code-review への文脈注入用であり、バリデーションとは無関係。新節を追加しても validate の変更は不要
- LLM による request 生成は `src/prompts/request-generate-system.ts` が司る

## 要件

1. request テンプレートに任意節「## 現状コードの前提」を追加する: 現状コードについての断定は file:line つきでこの節に書く旨のコメントを添える。`request template` / `request new` の出力と `request-generate-system.ts` の生成指示の両方に反映する
2. request-review の観点追加: file:line を伴う現状断定（節の内外を問わず request 全体が対象）を実コードと突き合わせ、不一致は severity high の finding として findings に載せる。既存の read-only 探索権限の範囲内で行う
3. design step の工程追加: design-system.ts に「request 内の現状コード断定を設計の前提にする前に Read/Grep で実コードと突き合わせ、不一致を発見した場合は誤った前提のまま設計せず、report_result の ok=false + reason で報告する」を明記する
4. validate は新節を必須としない: 節を持たない既存 request が validate green のまま通ること
5. 突き合わせの対象は「file:line または具体的なシンボル名・ファイルパスを伴う現状の断定」とし、意図・方針・将来の話は対象外であることを両 prompt に明記する

## スコープ外

- 新節の機械 parse（構造化データ化）
- implementer / spec-review / code-review への同様の工程追加
- 既存 request / archive 済み request の遡及修正
- 断定の自動抽出ツール

## 受け入れ基準

- [ ] `request template` の出力に「## 現状コードの前提」節とコメントが含まれる
- [ ] 節を持たない request が `request validate` で green のまま
- [ ] request-review prompt に現状断定の突き合わせ観点と severity 規定が含まれる
- [ ] design prompt に前提検証の工程と不一致時の報告経路（ok=false + reason）が含まれる
- [ ] テンプレート出力のテスト（既存 snapshot / golden 形式）が更新されている
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- テンプレートへのコメント追加（書き手への助言）ではなく、節 + 消費側工程のセットとする。書き手は自信を持って間違えるため助言は効かず、検証を書き手の規律から pipeline の工程に移すことが本質。節単体では飾りになるため、要件 2・3 の消費側変更を本体とする
- 節は任意とする。現状断定は背景や要件の文中にも自然に漏れ出すため、検証対象を節に限定せず request 全体とし、節は断定の置き場所の推奨として機能させる
