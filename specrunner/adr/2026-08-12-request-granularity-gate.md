# ADR: request 粒度ゲート — 二段品質ゲートと request.md 宣言永続化

- **date**: 2026-08-12
- **slug**: request-granularity-gate
- **status**: accepted

## Context

「1 request = 1 つのレビュー収束ループで直しきれる範囲」という粒度規律は
`docs/request-authoring.md` にあったが、機械の歯がなかった。過大な request は
design → implement → review を走り切った後に収束失敗（exhausted）で判明し、
走行資源を消費してから④に返る形だった。

archive 499 件の実測（2026-08）で受け入れ基準の項目数と収束率に単調な勾配が確認された:

| 受け入れ基準数 | n | 一発完走率 | exhausted 率 |
|---|---|---|---|
| 1–3 | 43 | 70% | 0% |
| 4–6 | 261 | 59% | 2% |
| 7–9 | 138 | 44% | 6% |
| 10–14 | 44 | 36% | 2% |
| 15+ | 13 | 8% | 23% |

規模起因の exhausted（基準 18/22/31 本の 3 件）はすべて code-review / conformance の
収束失敗型で、「開放的レビューの収束ループが先に死ぬ」という型に揃っていた。

本 ADR は、この問題への対応として選択した設計原則と、その過程で下した非自明な判断を記録する。

## Decisions

### D1: 量的判定は validate（機械）、質的判定は request-review（LLM）の二段配置

規模（受け入れ基準の top-level 項目数）は `countTopLevelAcceptanceCriteria()` が機械的に数え、
15 項目以上で validate が非ブロッキング警告を出す。縫い目の有無（この request が独立して収束
できる単位を 2 つ以上含むか）は request-review の新 Method 6 として LLM が文面構造から判定し、
分割線が見つかれば decision-needed finding として提示する。

- **Rationale**: 機械で数えられるものは機械へ。連続量（何 iteration かかるか）の LLM 推定は
  不確実であり採らない。縫い目は意味論的な構造判定であり、機械化すると誤検知が増える。
  役割が直交するため二段に分ける。
- **Alternatives considered**: (a) LLM に規模と iteration 数を推定させ 1 箇所で判定 → 不確実、却下。
  (b) validate だけで縫い目も正規表現判定 → 意味判定を機械化すると誤検知が増える、却下。

この二段配置は「機械で数えられるシグナル → 機械ゲート、意味論的判断 → LLM ゲート」という
汎化可能な設計原則として機能し、将来の品質ゲートに適用できる。

### D2: validate は warning のみ、hard gate 化しない

15 項目以上で `logWarn` を stderr に出し、exit code は変えない。

- **Rationale**: 15+ 帯の実測は n=13 と薄い。縫い目のない正当な大型 request を機械が誤って
  弾く事故を許容できない。「知らずに突っ込むこと」だけを消し、決定は人に返す設計方針
  （検知と決定の分離）に沿う。
- **Alternatives considered**: exit 1 のブロッキング gate → n=13 のサンプルで正当な request を
  止めるリスクが大きい、却下。threshold の config 化 → 実測較正値であり利用者が調整する性質
  の値ではない、却下（再較正時はコード変更）。

### D3: 縫い目 finding は decision-needed として④に委ねる

分割線が見つかった場合、request-review は「approve / reject」ではなく decision-needed finding
として分割案（土台→上物の切り方、options に 2 件以上）を提示し、needs-discussion halt に導く。
判断は request 作成者または④が下す。

- **Rationale**: 縫い目の有無は文面から読める確度が高いが、「分割すべきか」は request の
  意図を知っている人間にしか決められない。LLM が誤った分割を enforce する事故を避けるため、
  decision-needed（人の決定に返す）に留める。
- **Alternatives considered**: request-review が reject で弾く → 誤検知で実行不能、却下。
  専用の custom reviewer を新設 → 独立収束ループ・予算・model を持つ重い機構で n の薄い
  判定には過大、却下。

### D4: オペレーター裁定の永続先は request.md の `## 分割検討済み` 宣言（単一機構）

request.md に `## 分割検討済み` 節（理由必須）がある場合、request-review は縫い目 finding を
上げない。この宣言は起票時の事前 override（作成者が最初から宣言）と、needs-discussion halt 後
の事後裁定（④が追記して resume）の両方を単一機構で満たす。

宣言規約:
- **書式**: top-level `## 分割検討済み` 節を request.md に追加
- **本文**: なぜ分割せず単一 request として実行するか（理由必須）
- **理由なしは不可**: 理由のない宣言は尊重しない

issue-fidelity がスコープ外宣言を「意図的な省略」として尊重し undeclared drop に含めないのと
同型の宣言尊重パターンである。

- **Rationale**: 裁定の永続先を request.md 自体に置くことで、request.md 単体で「なぜこの
  規模で実行するか」が読める。パイプラインの状態として注入する方式と異なり、resume 後の
  再実行でも宣言は自然に参照される（request.md は全 step が読む）。
- **Alternatives considered**: (a) 前周 findings / operator 裁定を request-review に周回注入
  → 状態が request.md 外に散り、注入機構が重くなる、却下。(b) validate 側で宣言をパースして
  機械判定 → 縫い目判定自体が LLM 側にあるため宣言解釈も同じ側に置くのが一貫、却下。
  (c) `## 分割検討済み` を pipeline が既存ノードとして parse → 節が parse に対して不活性
  （`parseRequestMdRaw` / `extractMarkdownSections` のいずれにも触れない）であることを確認済み、
  追加 parse 不要（D5）。

### D5: 宣言節は既存 parse に対して不活性

`## 分割検討済み` は `parseRequestMdRaw`（Meta フィールドと 背景/目的 のみ抽出）にも
`extractMarkdownSections`（要求見出しのみ抽出）にも触れないため、追加しても既存 parse 挙動は不変。
宣言の解釈は request-review（LLM）が担う。

- **Rationale**: 新節導入で validate / parse を壊さないことの確認。追加 parse ロジック不要。

## Alternatives Considered

### Alternative 1: LLM に規模と iteration 数を推定させ、単一ステップで全判定を行う

request-review（または新規ステップ）が「この request は何 iteration かかるか」を推定し、
閾値超えで分割を要求する。

- **Pros**: 機構が一つに集約される。
- **Cons**: iteration 数は連続量で LLM 推定が不確実。定量的なシグナル（項目数）の機械化と、
  定性的なシグナル（縫い目）の LLM 化という役割分担が崩れる。
- **Why not**: 不確実な推定に基づく判定より、機械で数えられるものを機械に任せる方が信頼性が高い。

### Alternative 2: validate の hard gate 化（exit 1 でブロッキング）

15 項目以上の request.md は validate が exit 1 で弾く。

- **Pros**: 実行前に確実に止まる。
- **Cons**: n=13 のサンプルで縫い目のない正当な大型 request を誤って弾くリスクが許容できない。
  over-prescriptive で利用者の自律性を損なう。
- **Why not**: 「知らずに突っ込むこと」を消すだけでよく、決定は人に返すべき。

### Alternative 3: 前周 findings / operator 裁定を request-review に周回注入

custom reviewer の周回知識注入（前周 findings・operator 裁定）と同様の機構を request-review
にも複製し、裁定を injection で永続化する。

- **Pros**: request.md を変更せずに裁定を伝播できる。
- **Cons**: 状態が request.md 外に散り、request.md 単体では「なぜこの規模で実行するか」が
  読めなくなる。注入機構の複製はコードの複雑度を上げる。resume 経路での取りこぼしリスクがある。
- **Why not**: 宣言（D4）が事前 override と事後裁定の両方を単一機構で満たすため不要。

## Risks / Trade-offs

- **縫い目判定の誤検知**: 正当な大型 request に decision-needed finding が出る可能性がある。
  宣言で即素通しできるため事故コストは「④が一度宣言を追記する」だけ。hard block しない。
- **宣言の悪用（理由なき素通し常態化）**: 理由必須規約で抑制するが、理由の質は④が読む。
  機械強制はしない（スコープ外宣言と同じ信頼モデル）。
- **カウント方式の誤差**: top-level のみ・HTML コメント除去・複数マーカー形式対応で最小化。
  閾値近傍（13–16 項目）の 1–2 件のブレは warning（非ブロッキング）なので実害が小さい。
- **実測サンプルの薄さ**: 15+ 帯は n=13。閾値の再較正は実測が積み上がった段階でコード変更する。
  `ponytail:` 再較正は n が 50+ 程度積み上がった段階でコード変更。

## Consequences

### Positive

- 過大な request が走行資源を消費した後に exhausted で返ってくる前に、validate と
  request-review の二段で早期検知できる。
- 「機械で数えられるシグナル → 機械ゲート / 意味論的判断 → LLM ゲート」という
  役割分担原則が確立され、将来の品質ゲート設計に参照できる前例となる。
- `## 分割検討済み` 宣言パターンが、オペレーター裁定を request.md に永続化する汎用機構として
  機能し、同様の「意図的な override の明示」に再利用できる。

### Negative / 既知の制約

- 15 項目以上でも縫い目がない正当な大型 request に対して、request-review が decision-needed
  finding を出すことがある（誤検知）。宣言追記で回避できるが、一度止まるコストが発生する。
- 閾値 15 は 2026-08 時点の実測に基づく較正値であり、archive が積み上がるにつれて
  再較正が必要になる可能性がある。

## References

- Request: `specrunner/changes/request-granularity-gate/request.md`
- Design: `specrunner/changes/request-granularity-gate/design.md`
- Spec: `specrunner/changes/request-granularity-gate/spec.md`
