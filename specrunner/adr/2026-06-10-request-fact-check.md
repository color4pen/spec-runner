# ADR: request の現状コード断定を untrusted input として消費側 pipeline が突き合わせる

- **date**: 2026-06-10
- **slug**: request-fact-check
- **status**: accepted

## Context

request.md には「現状のコードはこうなっている」という断定（file:line を伴う記述）が含まれるが、pipeline はこれを検証せずに信頼していた。request↔spec の整合は spec-review が検証する一方、request↔実コードの事実関係はどの step も突き合わせていなかった。

曖昧な記述なら design が自力で調査するが、間違った精密さ（file:line つきの確信的な断定）は調査を先回りして封じるため、誤った断定が design の前提となりそのまま実装される危険がある。助言（コメント）は書き手の規律に依存し再発を防げないため、検証を書き手の規律から pipeline の工程に移す必要がある。

## Decisions

### D1: 節は scaffold に常設するが validate では任意とする

request scaffold（`buildScaffoldTemplate()`）に `## 現状コードの前提` 節を常設し、バリデーションでは必須化しない。

**採用理由**: 未知セクションは parser が silently ignore する（`request-md.ts:14`）ため、scaffold に常設しても節を持たない既存 request は validate green のまま通る。常設は断定の置き場所の推奨を書き手に提示するために行う。

**却下案**: `src/parser/rules/` に required-section rule を追加して節を必須化する — 既存 request すべてを break し要件と矛盾。

### D2: scaffold は `buildScaffoldTemplate()` の 1 箇所のみ編集する

`executeTemplate`（`request template`）と `executeNew`（`request new`）がともに `buildScaffoldTemplate()` を呼ぶため、単一編集で両出力に反映できる。

**採用理由**: 2 コマンドで literal を分けると重複と drift のリスクがある。DRY を維持する。

### D3: 節の配置は「背景」と「要件」の間とする

現状コードの断定は背景的文脈であり要件の前提に当たる。背景 → 現状コードの前提 → 要件の順が書き手の自然な流れに沿う。

**却下案**: 末尾（受け入れ基準の後）— 背景を書く時点で断定の置き場所が遠く、文中への漏出を助長する。

### D4: request-generate では「現状コードの前提」を任意（optional）節として案内する

`request-generate-system.ts` の "MUST include all sections" リストには追加しない。既存の「目的」節と同じ optional 扱いで案内する。

**採用理由**: 断定の無い request でも空節を強制することになり、かつ節は任意という要件と矛盾する。

**却下案**: Required Format に必須として追加 — 節が任意という要件と矛盾。

### D5: 検証は「書き手の規律」ではなく「消費側 pipeline 工程」に置く（architect 評価済み）

テンプレートへのコメント追加（書き手への助言）だけでなく、request-review と design の両 step に実コードとの突き合わせ工程を追加する。節単体は飾りになるため、消費側変更（D6・D7）を本体とする。

**却下案**: コメントによる助言のみ — 書き手は自信を持って間違えるため助言は規律に依存し再発を防げない。

### D6: 突き合わせ対象を request 全体とし、節に限定しない（architect 評価済み）

現状断定は背景や要件の文中にも自然に漏れ出すため、検証対象を `## 現状コードの前提` 節に限定すると漏れる。両 prompt で「節の内外を問わず request 全体が対象」「対象は file:line / 具体的なシンボル名・ファイルパスを伴う現状の断定、意図・方針・将来の話は対象外」と明記する。

**却下案**: 検証対象を節内のみに限定 — 文中に漏れた断定を取りこぼす。

### D7: 不一致時の経路は request-review = severity high finding、design = ok=false + reason

request-review は既存の severity 定義（high = request-level defect）に「現状コード断定と実コードの不一致」を加える。design は誤前提のまま設計を進めるより、既存の `report_result(ok=false, reason)` 経路で escalate する方が安全（escalation as design safety net）。各 step は既存の出力契約を再利用し、新しい経路を増やさない。

**却下案**: design で不一致を黙って自己修正する — 誤前提の起源（request）が残り、再発と乖離を招く。

## Alternatives Considered

### Alternative 1: テンプレートへのコメント（書き手への助言）のみ追加する

scaffold にコメントを付加して「現状コードの断定を書く際は慎重に」と注意を促す。request-review / design への工程追加は行わない。

- **Pros**: 変更が最小（template 変更のみ、prompt 変更不要）。pipeline 工程を変えないため既存 step の動作に影響しない
- **Cons**: 書き手は自信を持って間違えるため助言は効かない。規律に依存する対策は再発を防げない（LLM uncertainty principle と同様）
- **Why not**: 検証を書き手の規律から pipeline の工程に移すことが本質（architect 評価済み）。節単体は飾りになる

### Alternative 2: `## 現状コードの前提` 節を validate で必須化する

`src/parser/rules/` に required-section rule を追加し、節の存在を validate の合否条件とする。

- **Pros**: 断定を持つ request に節を強制でき、突き合わせ対象を書き手が意識して整理するようになる
- **Cons**: 節を持たない既存 request がすべて validate break する。断定のない正当な request にも空節を強制することになる
- **Why not**: 後方互換を壊し要件（節は任意）と矛盾。節に限定すると文中漏れを取りこぼす問題（Alternative 3）も残る

### Alternative 3: 突き合わせ対象を `## 現状コードの前提` 節内のみに限定する

request-review / design の突き合わせ工程を節の内容のみに適用し、節外（背景・要件本文）は対象外とする。

- **Pros**: 検証対象を明確に絞れる。節外の記述を判定に含めないため誤検知が減る
- **Cons**: 現状断定は背景や要件の文中に自然に漏れ出すため取りこぼしが生じる。節に限定すると Alternative 2 との組み合わせで節外漏れを放置することになる
- **Why not**: 節外に漏れた断定が機能しない（architect 評価済み）。節は断定の置き場所の推奨であって境界ではない

### Alternative 4: design が不一致を自己修正して設計を続行する

design が実コードとの不一致を発見した場合、request の断定を無視して正しいコードを自分で調べ直し、誤前提を黙って上書きして設計を続行する。

- **Pros**: pipeline が escalation なしに完走する。手戻りが発生しない
- **Cons**: 誤前提の起源（request.md）が修正されないまま残る。次回以降の request で同じ断定が繰り返される。設計と request の乖離が蓄積する
- **Why not**: 根本原因を request に留めることで再発と乖離を招く。escalation as design safety net の設計方針に反する

## Consequences

- request-review は現状コード断定の突き合わせを明示的な観点として持ち、不一致を severity high として findings に載せる。既存の read-only 探索権限の範囲内で行う
- design は現状コード断定を前提にする前に Read/Grep で実コードと突き合わせ、不一致を発見したら `report_result(ok=false)` で escalate する。誤前提のまま設計が進まなくなる代わりに手戻りが発生しうるが、これは意図した安全側の挙動
- 節を持たない既存 request は validate を含む pipeline でそのまま green で通過する（後方互換）
- `buildScaffoldTemplate()` 1 箇所の変更が `request template` と `request new` の両出力に反映される
- prompt / template 変更は content assertion テストで振る舞いを担保する（`tests/prompts/*.test.ts` / `tests/unit/core/command/request.test.ts`）

## 関連

- Request: `specrunner/changes/request-fact-check/request.md`
- Design: `specrunner/changes/request-fact-check/design.md`
- Related: [2026-05-26-request-constraints-initial-injection](./2026-05-26-request-constraints-initial-injection.md) — request.md 補助 section の initial message 注入。本 ADR は request 内断定の trust model を扱い、injection 経路ではなく消費側の検証工程を追加する
