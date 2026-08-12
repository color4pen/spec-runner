# Design: 過大 request の粒度ゲート

## Context

「1 request = 1 つのレビュー収束ループで直しきれる範囲」という粒度規律は
`docs/request-authoring.md` の粒度節に質的な分割判定 3 基準として存在するが、機械の歯がない。
過大な request は design → implement → review を走り切った後に収束失敗（exhausted）で
判明し、走行資源を消費してから④に返る。

archive 499 件の実測（2026-08）で、受け入れ基準の項目数と収束率に単調な勾配がある。
規模起因の exhausted（基準 18/22/31 本の 3 件）はすべて code-review / conformance の
収束失敗型で、「開放的レビューの収束ループが先に死ぬ」という型に揃っている。検知を入口
（validate / request-review）に前倒しする。

現状コード（検証済み）:

- `src/core/command/request.ts` — `executeValidate` は parse（`parseRequestMdContent`）と
  design-layer gate のみ。規模検査を持たない。stderr 出力には `src/logger/stdout.ts` の
  `logWarn`（`Warning: ` 接頭辞、default level で出力、`--quiet` で抑制）が既にある。
- `src/parser/extract-section.ts` — `extractMarkdownSections(content, headings)` が
  `##` 見出し単位で節本文を抽出する純関数。`REQUEST_CONSTRAINT_HEADINGS` に
  `受け入れ基準` を含む。
- `src/prompts/request-review-system.ts` — `REQUEST_REVIEW_BASE` の Method は 1–5。
  Method 5（Scope & Complexity Evaluation）は YAGNI/スコープクリープを見るが、
  分割可能性（縫い目）の観点はない。`decision-needed` finding は `judge-rules.ts` の
  `DECISION_NEEDED_DEFINITION` が定義し、`options`（2 件以上、`{label, consequence}`）が必須。
- `src/prompts/issue-fidelity-system.ts` — スコープ外（スコープ外宣言）を「意図的な省略」
  として尊重し undeclared drop に含めない、という宣言尊重の先行型がある。
- `docs/request-authoring.md` 粒度節 — 質的分割基準 3 つはあるが量的目安がない。

制約: 受け入れ基準「既存テストが無変更で green」。特に `TC-REQ-004`
（`buildValidRequestMd()` = 受け入れ基準 1 項目 → stderr 無出力）を壊さないこと。

## Goals / Non-Goals

**Goals**:

- validate に受け入れ基準の top-level 項目数カウントを追加し、15 項目以上で非ブロッキング
  警告を stderr に出す（exit code 不変）。
- request-review system prompt に縫い目判定観点（3 基準）・実測較正値・宣言尊重ルールを追加する。
- 分割検討済み宣言（理由付き）を request.md の単一機構として定義し、宣言があれば request-review
  が縫い目 finding を上げない。起票時の事前 override と halt 後の④裁定の両方をこの宣言が満たす。
- docs 粒度節に実測値と宣言規約を、request template の受け入れ基準コメントに規模目安と宣言への
  言及を追記する。

**Non-Goals**（request のスコープ外をそのまま踏襲）:

- design step での規模 backstop。
- 通常サイズ request の verification exhausted 問題（規模と無相関の別問題）。
- pipeline による自動分割（request → 子 request 生成）。
- validate の hard gate 化（ブロッキング）。
- request-review への前周 findings / operator 裁定の周回注入機構（宣言節が代替する）。

## Decisions

### D1: 量的判定は validate（機械）、質的判定は request-review（意味）の二段配置

規模（項目数）は機械が数える。縫い目の有無は文面の構造判定なので LLM 側に置く。

- **Rationale**: 機械で数えられるものは機械へ。連続量（何 iteration かかるか）の LLM 推定は
  不確実で採らない。縫い目は「独立して収束できる単位が 2 つ以上あるか」という文面構造の判定で、
  数えられない。役割が直交するので二段に分ける。
- **Alternatives considered**: (a) LLM に規模と iteration 数を推定させ 1 箇所で判定 → 連続量推定が
  不確実、却下。(b) validate だけで縫い目も正規表現判定 → 意味判定を機械化すると誤検知が増える、却下。

### D2: validate は warning のみ、hard gate 化しない

15 項目以上で `logWarn` を出し、exit code は変えない。

- **Rationale**: 15+ 帯の実測は n=13 と薄く、縫い目のない正当な大型 request を機械が誤って弾く
  事故を許容できない。「知らずに突っ込むこと」だけを消し、決定は人に返す。
- **Alternatives considered**: exit 1 のブロッキング gate → 誤検知で正当な request を止める、却下。
  request 作成者評価済みの設計判断でも hard gate は明示却下されている。

### D3: 規模カウントは `extract-section.ts` の純関数、しきい値は request.ts のコード定数

`extract-section.ts` に `countTopLevelAcceptanceCriteria(content): number` を追加し、
既存の `extractMarkdownSections` で `受け入れ基準` 節を取り、HTML コメントを除去してから
top-level リスト項目（行頭無インデントの `-`/`*`/`+`/`N.`/`N)`）を数える。しきい値 `15` と
警告文は `request.ts` に定数として置く。

- **Rationale**: 節抽出の純ロジックは既存 parser の責務（既存を再利用）。
  HTML コメント除去は template の受け入れ基準コメントを誤カウントしないための一手。
  しきい値は実測較正値であり利用者が調整する性質ではない → config 化せずコードに埋める
  （再較正はコード変更）。警告文は CLI 表示なので command 層に置く。
- **Alternatives considered**: (a) `request.ts` 内でカウントも実装 → parser の責務を command に
  漏らす、却下。(b) しきい値を `.specrunner/config.json` 化 → 利用者調整対象ではない実測値、却下。

### D4: 縫い目判定は request-review prompt の新 Method として追加

`REQUEST_REVIEW_BASE` の Method に Method 6「Granularity Seam Judgment」を追加する。内容:

- 問い: この request は独立して収束できる単位を 2 つ以上含むか。
- 分割判定 3 基準（docs と同一文言）: 独立して設計・テストできる → 切る / 収束の意味論が異なる
  → 必ず切る / 受け入れ基準の相互参照 → 切らない。
- 実測較正値: 受け入れ基準 15 本以上は実測で一発完走率 8%・exhausted 23%（archive 499 件）。
- 分割線が見つかれば **decision-needed finding**。`options` に土台→上物の分割案を 2 件以上。
- 宣言尊重: 後述 D5。

- **Rationale**: prompt 拡張はセッション数を増やさず既存 request-review の収束ループに載る
  （既存 step を拡張）。decision-needed は「作成者でなければ決められない事項」で
  `DECISION_NEEDED_DEFINITION` の定義とちょうど一致し、CLI が needs-discussion に導出する。
- **Alternatives considered**: 専用 custom reviewer を新設 → 独立収束ループ・予算・model を持つ
  重い機構で n の薄い判定には過大、却下。既存 Method 5 に混ぜる → 責務が濁る、却下し独立 Method に。

### D5: 裁定の永続先は request.md の `## 分割検討済み` 宣言（単一機構）

request.md に `## 分割検討済み` 節（理由必須）がある場合、request-review は縫い目 finding を
上げない。issue-fidelity がスコープ外宣言を意図的省略として尊重するのと同型。

宣言規約（docs / prompt / template で一致させる）:

- **書式**: top-level `## 分割検討済み` 節。
- **本文**: なぜ分割せず単一 request として実行するか（分割しない理由 / この規模で一度に実行する理由）。
- **理由必須**: 理由のない宣言は尊重しない。

halt 後の④裁定は「この宣言を request.md に追記して resume」で復帰する。resume で再実行された
request-review が宣言を見て素通しする。裁定の永続先は request.md であり、周回知識の注入機構は追加しない。

- **Rationale**: 起票時の事前 override（作成者が最初から宣言）と halt 後の事後裁定（④が追記）を
  単一機構で満たす。request.md 単体で「なぜこの規模で実行するか」が読める。custom reviewer の
  周回知識注入（前周 findings・operator 裁定）を request-review にも複製する案は、状態を増やし
  request.md の自己完結性を崩すため却下。
- **Alternatives considered**: (a) 前周 findings / operator 裁定を request-review に周回注入 →
  機構が重く request.md 外に裁定が散る、却下。(b) 宣言を機械パースして validate 側で判定 →
  縫い目判定自体が LLM 側なので宣言解釈も同じ側に置くのが一貫、却下。

### D6: 宣言節は parse に対して不活性

`## 分割検討済み` は `parseRequestMdRaw`（Meta フィールドと 背景/目的 のみ抽出）にも
`extractMarkdownSections`（要求見出しのみ抽出）にも触れないため、追加しても既存 parse 挙動は不変。

- **Rationale**: 新節導入で validate/parse を壊さないことの確認。宣言の解釈は request-review（LLM）が担う。
- **Alternatives considered**: なし（事実確認）。

## Risks / Trade-offs

- [縫い目判定の誤検知（正当な大型 request に finding）] → decision-needed（人の決定に返す）に
  留め、宣言で即素通しできる。hard block しないので事故コストは「④が一度宣言を追記する」だけ。
- [宣言の悪用（理由なき素通し常態化）] → 理由必須。理由の質は④が読む。機械強制はしない
  （スコープ外宣言と同じ信頼モデル）。
- [カウント方式の取りこぼし（ネスト項目・番号リスト・コメント混入）] → top-level のみ・
  HTML コメント除去で最小化。閾値近傍の 1–2 件のブレは warning なので実害が小さい。
- [`logWarn` の level 依存（`--quiet` で抑制）] → 警告は助言であり quiet 抑制が妥当。
  default level のテストでは出力される。

## Open Questions

なし（request 作成者評価済みの設計判断で主要分岐は決着済み）。
