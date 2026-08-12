# 過大 request の粒度ゲート: validate 規模警告と request-review 縫い目判定

## Meta

- **type**: new-feature
- **slug**: request-granularity-gate
- **base-branch**: main
- **adr**: true

## 背景

「1 request = 1 つのレビュー収束ループで直しきれる範囲」という粒度規律は docs/request-authoring.md にあるが、機械の歯がない。過大な request は design → implement → review を走り切った後に収束失敗（exhausted）で判明し、走行資源を消費してから④に返る。

archive 499 件の実測（2026-08 時点）で、受け入れ基準の項目数と収束率に単調な勾配がある:

| 受け入れ基準数 | n | 一発完走率 | exhausted 率 |
|---|---|---|---|
| 1–3 | 43 | 70% | 0% |
| 4–6 | 261 | 59% | 2% |
| 7–9 | 138 | 44% | 6% |
| 10–14 | 44 | 36% | 2% |
| 15+ | 13 | 8% | 23% |

規模起因の exhausted（基準 18/22/31 本の 3 件）はすべて code-review / conformance の収束失敗型で、「開放的レビューの収束ループが先に死ぬ」という型に揃っている。検知を入口（validate / request-review）に前倒しする。

設計方針は**検知と決定の分離**: ゲートが消すのは「知らずに突っ込むこと」だけで、意図的な大型実行は宣言による override で素通しできる。

## 現状コードの前提

- `src/core/command/request.ts:126` — `executeValidate` は parse（`parseRequestMdContent`）と design-layer gate のみで、規模に関する検査を持たない
- `src/parser/extract-section.ts:82` — 受け入れ基準節の抽出は既存 parser にある
- `src/prompts/request-review-system.ts:54` — Method 5（Scope & Complexity Evaluation）は YAGNI 違反・スコープクリープを見るが、分割可能性（縫い目）の判定観点はない
- `src/core/step/request-review.ts` — 前周 findings / operator 裁定の周回注入を持たない。needs-discussion halt 後の resume では request-review が新 iteration で再実行される
- `docs/request-authoring.md:60` — 粒度節に質的分割基準 3 つ（独立して設計・テストできる / 収束の意味論が異なる / 受け入れ基準の相互参照）があるが、実測に基づく量的目安はない

## 要件

1. **validate の規模警告（非ブロッキング）** — `executeValidate` に受け入れ基準節の top-level 項目数カウントを追加し、15 項目以上で stderr に警告（実測根拠と分割検討の案内を含む）を出す。exit code は変えない — warning であり gate ではない。しきい値 15 は実測に基づく定数としてコードに埋める（config 化しない）。

2. **request-review の縫い目判定観点** — system prompt の Method に観点を追加する: この request は独立して収束できる単位を 2 つ以上含むか。判定基準は docs/request-authoring.md の分割判定 3 基準（独立して設計・テストできる → 切る / 収束の意味論が異なる → 必ず切る / 受け入れ基準の相互参照 → 切らない）。分割線が見つかれば **decision-needed finding** として分割案（土台→上物の切り方）を提示する。規模の較正値（受け入れ基準 15 本以上は実測で一発完走率 8%・exhausted 23%）を prompt に根拠として記載する。

3. **分割検討済み宣言の尊重** — request.md に分割検討済み宣言（理由付き）がある場合、request-review は縫い目 finding を上げない。スコープ外宣言を issue-fidelity が「意図的な省略」として尊重するのと同じ型。needs-discussion halt 後の④裁定は「宣言を request.md に追記して resume」で復帰し、再実行された request-review が宣言を見て素通しする — 裁定の永続先は request.md であり、周回知識の注入機構は追加しない。

4. **docs/request-authoring.md 粒度節への実測追記** — 崖の実測（10 本超で黄信号、15 本以上で一発完走率 8%）と宣言規約（書式・置き場所・理由必須）を追記する。

5. **request template のコツ更新** — 受け入れ基準節のコメントに、規模の目安と分割検討済み宣言への言及を追加する。

## スコープ外

- design step での規模 backstop（request-review の見逃しが観測されてから別 request で）
- 通常サイズ request の verification exhausted 問題（実測 17 件中 14 件はこちらだが、規模と無相関の別問題）
- pipeline による自動分割（request → 子 request 生成）
- validate の hard gate 化（ブロッキング）
- request-review への前周 findings / operator 裁定の周回注入機構（宣言節が代替する）

## 受け入れ基準

- [ ] 受け入れ基準 15 項目以上の request.md に対し `request validate` が stderr 警告を出し、exit 0 を維持することをテストで固定する
- [ ] 受け入れ基準 14 項目以下では警告が出ないことをテストで固定する
- [ ] request-review system prompt に縫い目判定観点（3 基準）・実測較正値・宣言尊重ルールが含まれることをテストで固定する
- [ ] 分割検討済み宣言を含む request に縫い目 finding を上げない規則が prompt に含まれることをテストで固定する
- [ ] docs/request-authoring.md に実測値と宣言規約が記載される
- [ ] 既存テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **量的判定は validate（機械）、質的判定は request-review（意味）の二段配置**。LLM に規模（何 iteration かかるか）を推定させる案は却下 — 連続量の推定は不確実で、機械で数えられるものは機械へ。縫い目の有無は文面の構造判定なので LLM 側に置く。
- **hard gate は却下**: 15+ 帯の実測は n=13 と薄く、縫い目のない正当な大型 request を機械が誤って弾く事故を許容できない。warning + decision-needed（人の決定に返す）に留める。
- **裁定の永続化は request.md への宣言追記で行う**。custom reviewer の周回知識注入（前周 findings・operator 裁定の注入）を request-review にも複製する案は却下 — 宣言は起票時の事前 override と halt 後の事後裁定を単一機構で満たし、request.md 単体で「なぜこの規模で実行するか」が読める。
- **しきい値は config 化しない**: 実測の較正値であり利用者が調整する性質の値ではない。再較正時はコード変更で更新する。
