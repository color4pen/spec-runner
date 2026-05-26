# design step に request.md の補助 section (スコープ外 / 受け入れ基準 / 設計判断) を CLI からフォローアップ注入する

## Meta

- **type**: spec-change
- **slug**: design-request-followup
- **base-branch**: main
- **adr**: true

## 背景

PR #407 (observation-auto-fix) で、design step (= opus) が request.md の「スコープ外」section を読み飛ばし、scope 外として明示禁止した `approved-with-fixes` verdict を導入した。

design agent に session resume で確認した結果:
> 「request.md の scope 外 section を読んでいなかった。自分の Read 対象は既存ソースコードに集中しており、request.md 自体は user-request タグ内の本文しか参照していない」

= **opus でも request.md の補助 section (= スコープ外 / 受け入れ基準 / architect 評価済み設計判断) を読み飛ばす**。model 強化では解決しない、CLI 側からの構造的対策が必要。

## 要件

### 1. design step の agent session に request.md の全 section を CLI からフォローアップ注入する

design step が agent session を開始した後、CLI 側から **request.md の「スコープ外」「受け入れ基準」「architect 評価済みの設計判断」section を follow-up prompt として注入**する。

agent が自分で request.md を Read するかどうかに依存せず、CLI が確実に全 section を agent の context に入れる。

具体的な注入タイミング・方法 (= 既存 `followUpPrompts` 機構の利用 / buildMessage での追記 / 別 mechanism) は **design step で確定**する。

### 2. code-review step にも同様のフォローアップを検討する

code-review step で「request.md のスコープ外宣言と実装の整合性チェック」を強化するため、同様に CLI 側からスコープ外 section を注入する。

実装範囲・タイミングは **design step で確定**する。

## スコープ外

- **rules ファイルでの対応** — rules は agent が読み飛ばす可能性が残る (= 今回と同じ LLM uncertainty)、CLI 内フォローアップを本 request の主軸とする
- **spec-review step への適用** — 本 request は design + code-review の 2 step のみ
- **request.md の format 変更** — 既存 format のまま CLI 側で section 抽出して注入
- **CLI 内部の scope-out-validator (= 機械的文言突合せ)** — 将来検討、本 request の scope 外

## 受け入れ基準

- [ ] design step の agent context に request.md の「スコープ外」section 内容が確実に含まれる (= CLI 側で注入、agent の Read に依存しない)
- [ ] design step の agent context に request.md の「受け入れ基準」section 内容が確実に含まれる
- [ ] design step の agent context に request.md の「architect 評価済みの設計判断」section 内容が確実に含まれる
- [ ] code-review step の agent context にも同様の section が注入される
- [ ] 既存 pipeline (= design / code-review 以外の step) に regression なし
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **rules ではなく CLI 内フォローアップを採用**: rules は agent が読み飛ばす可能性がある (= LLM uncertainty)。CLI 内からの注入は agent の attention に依存せず確実。[[feedback_llm_uncertainty_principle]] と整合 (= 「判断する場面を消す」)
- **既存 `followUpPrompts` 機構が使える可能性**: spec-runner には既に fixer step で follow-up prompt を注入する仕組みがある。design / code-review にも同様に適用可能か design step で検証する
- **request.md の section 抽出は CLI side のテキスト処理**: request.md の markdown heading を parse して必要 section を取り出す、agent に任せない
