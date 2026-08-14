# conformance の正典に格差を付ける: request/spec は規範、design/tasks は計画

## Meta

- **type**: spec-change
- **slug**: conformance-canon-tiers
- **base-branch**: main
- **adr**: true

## 背景

conformance は最終実装が依頼の意図を満たしたかを確認する最終レビューであり、この役割には価値がある。しかし現行 prompt は 4 成果物(request.md / spec.md / design.md / tasks.md)を同格の「正典」として扱い、design の全 decision が実装に反映されているか・tasks の全 checkbox が完了しているかを個別に照合する。

この同格扱いは「実装前に書かれた計画」を「最終実装」より強くする。実装中に得た知識でより良い構造を選んだ場合、request/spec の意図は満たしていても design/tasks との相違が non-conformity として指摘され、正しい実装を計画に引き戻す圧力になる。成果物の性質に沿った格差を付ける:

- **request.md / spec.md = 規範(normative)**: 守るべき意図・振る舞い。逸脱は finding
- **design.md / tasks.md = 計画・根拠(plan / rationale)**: 実装到達のための文脈。実装がそれと異なること自体は finding ではない

## 現状コードの前提

- `src/prompts/conformance-system.ts:20-25` — 「実装が 4 成果物すべてに適合しているか」、4 成果物を並列に「正典」と明記
- `src/prompts/conformance-system.ts:37-47` — 照合手順: tasks の全 checkbox 確認、design の全 decision(D1, D2, ...)の実装反映確認、spec の Requirement/Scenario、request の受け入れ基準
- `src/prompts/conformance-system.ts:74-75` — routing 表(spec-fixer / implementer への振り分け)。この routing 意味論は変更しない
- verdict 導出・escalation 経路(CANON_FINDING_ESCALATION 等)は judge-verdict 層の責務で、本 request では変更しない
- conformance の report tool は findings + evidence のみを受け取り、code-review 系の typed observations に相当する枠を持たない(相違の記録は evidence 報告の本文で行う)

## 要件

1. **二層の宣言** — conformance prompt の正典定義を二層化する: request.md / spec.md は規範(逸脱 = finding)、design.md / tasks.md は計画・根拠(実装がそれらと異なることは、それだけでは finding にしない)。
2. **判定基準の置換** — design decision の不反映・tasks との相違・checkbox 未完了を発見した場合の判定基準を「その相違によって request/spec の意図・受け入れ基準・振る舞いが破られているか」に置き換える。破られていれば finding とし、根拠に request/spec の該当箇所を引く。破られていなければ相違は **non-blocking note として evidence 報告の本文に記録**し(conformance の report は findings + evidence のみで typed observation を持たないため、schema は変えない)、design/tasks の追随更新を促してよい。
3. **完了性の確認は維持** — 受け入れ基準の達成確認(request)と Requirement/Scenario の充足確認(spec)は現行どおり全件行う。緩めるのは「計画との一致」の強制であって「意図の充足」の確認ではない。
4. **機械意味論は不変、agent 向け説明は追随** — fixTarget の enum・verdict 集約・遷移の機械意味論は変更しない。一方、prompt / tool description 内の agent 向け routing 説明(「spec.md / design.md の成果物が誤っている → spec-fixer」等)は二層化と矛盾しない文面に更新する(例: design/tasks の相違は request/spec 違反を伴う場合のみ finding で、その修正先の説明も二層に沿わせる)。

## スコープ外

- conformance step の廃止・位置変更
- verdict 導出ロジック(judge-verdict 層)の変更
- spec-review / code-review の照合観点変更
- design/tasks の成果物としての生成・形式変更

## 受け入れ基準

- [ ] conformance prompt に request/spec = 規範、design/tasks = 計画の二層宣言が含まれることをテストで固定する
- [ ] 「design/tasks との相違はそれ自体では finding にしない」「finding の根拠は request/spec の該当箇所」の指示が含まれることをテストで固定する
- [ ] 受け入れ基準・Requirement/Scenario の全件確認の指示が維持されることをテストで固定する
- [ ] fixTarget enum・verdict 集約・遷移の機械意味論が無変更であることをテストで固定する(agent 向け routing 説明の文面更新は許容)
- [ ] 既存テストの更新対象(prompt contract の pin)を design で全列挙し根拠を明示する。列挙外は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **格差付けは prompt 層で行う** — 正典の重み付けはレビューの判定基準の問題であり、verdict 導出・routing の機械層を触る必要がない。機械層まで変えると影響範囲が意図(判定基準の是正)を超える。
- **相違の記録は残す(黙殺しない)** — 相違を黙殺すると design/tasks が実装から乖離したまま archive される。finding(強制)ではなく evidence 報告内の non-blocking note に落とすことで、文書の追随は促しつつ実装を計画に引き戻す圧力を消す。schema 追加(typed observation の新設)はしない — 記録の置き場は既存の evidence 報告で足り、report の型を増やすのは今回の引き算に反する。
- **「完了性」と「計画一致」を分離** — checkbox・decision 反映の確認が担っていた実質は「やり残しの検出」であり、それは request の受け入れ基準と spec の Scenario 充足で覆える。計画一致の強制だけを外す。
