# ADR の Alternatives Considered 欠落を adr-gen の self-fix follow-prompt で抑える

## Meta

- **type**: spec-change
- **slug**: adr-alternatives-followup
- **base-branch**: main
- **adr**: true

<!-- adr=true: 「ADR の強制を spec 並みに重く (validator+専用 fixer) せず、まず follow-prompt で軽く補強する」という強制力レベルの設計判断を記録する -->

## 背景

adr-gen agent が ADR に `Alternatives Considered` (= 代替案議論) を**確率的にしか書かない** (= issue #335)。adr-gen-system.ts が MUST と要求しているのに read 飛ばしで欠落する。今 session で確認した「prompt 規律は確率的に skip される」(memory `feedback_llm_uncertainty_principle`) の adr-gen 版。

実害:
- 「なぜ X でなく Y を選んだか」の設計判断の再現性が失われる (= ADR の核心価値が機能不全)
- PR #328 で実際に欠落 → code-fixer が誤って `docs/adr/` に重複 ADR 作成事故

## 設計方針: まず follow-prompt で軽く補強する (機械バリデーション + 専用 fixer は段階導入)

今 session で「検出 = 決定論的 validator、修正 = follow-prompt」の型を spec (dsv) に対して確立した。ただし **ADR は spec ほど「こうでなければならない」強制力を要しない** — spec は実装・archive の baseline になる規範だが、ADR は設計判断の記録であり、Alternatives がたまに薄くても致命的な機能不全には直結しない。

したがって ADR には**いきなり重い機構 (機械 validator gate + 専用 adr-fixer step) を入れず、まず follow-prompt だけで補強する**:

- **修正/補強**: adr-gen の follow-prompt (= PR #362 で作った primitive の 2nd consumer)。作業 turn 後に同一 session で「ADR template を読み直して Alternatives を埋めろ」と self-fix を促す
- **新ステップは作らない**: 専用 step の新設は慎重に行いたい。follow-prompt で Alternatives 欠落が**実際に再発する場合に限り**、機械 validator + adr-fixer を別 request で追加する (= 段階導入、下記スコープ外)

issue #335 の案 A (= JSON 構造化出力で tool が組み立て) は **不採用**。構造化出力は Claude 強・Codex 弱で vendor 差があり (= 今 session で確認)、adapter-neutral でないため。

**この方針の前提 (正直な記述)**: follow-prompt も prompt である以上、効果は確率的であり Alternatives 欠落を 0 にする保証はない。本 request は「決定論的保証」ではなく「低コストな確率的改善」を狙う。決定論的 gate が必要だと判明したら validator 路線へ移行する (= スコープ外に明記)。

## 要件

### 1. adr-gen の follow-prompt (= self-fix)

`AdrGenStep` に `followUpPrompt` を設定する SHALL (= PR #362 primitive の 2nd consumer)。作業 turn 後に同一 session で「ADR template を読み直し、Alternatives Considered が具体的に埋まっているか確認して直せ。代替案と不採用理由が無ければ追記せよ」と self-fix を促す。

- follow-prompt は **修正のみ** (= 「書けているか判定せよ」ではない、確認バイアス回避)
- **follow-prompt は `adr: true` のパスでのみ発火する** SHALL。`AdrGenStep` は `adr: false` でも step 自体は実行され (= `adr-gen.ts:34,49` の no-op message パス)、agent turn が走る。ここで follow-prompt が送られると「Alternatives を追記せよ」に反応して **`adr: false` なのに ADR を誤生成しうる**。したがって follow-prompt は `adr` flag で gate する (= 動的 followUpPrompt が `adr: false` で undefined を返す、または `shouldRunFollowUp` が adr flag を見る — 機構は design step)

## スコープ外

follow-prompt の様子見で不足が判明したら、別 request で検討する (= 今回はやらない):

- **機械的 ADR validator** (= `Alternatives Considered` の存在・非空・非 placeholder を決定論的に gate)。検出の決定論化はこちらの担当。dsv 同型だが ADR 固有 registry (`src/core/adr/rules/`) になる見込み
- **専用 `adr-fixer` step + pipeline 配線** (= validation needs-fix 時の修正ループ)。新ステップ新設は follow-prompt が不足と判明してから。**adr-gen step の兼務は不可** (= adr-gen は forward flow のステップでもあり、fixer 判定が step 名ベース `pipeline.ts:179` のため初回生成 run が fix iteration として誤カウントされる)。導入時は専用 step とし、prompt は adr-gen の `ADR_GEN_SYSTEM_PROMPT` を流用する (= ADR format 規律を単一ソースに)

その他、今回も将来も対象外:

- **案 A (JSON 構造化出力)** = vendor 差 (Claude 強/Codex 弱) で adapter-neutral でないため不採用
- **prompt 規律の強化** (= 「Alternatives は MUST」をさらに強調するだけ) = 確率的で再発、対症療法
- **代替案の内容妥当性** (= 「正しい代替案か」は semantic 判断)
- **過去 ADR の retrofit** / **ADR 配置場所の統一** (= #334 領域)

## 受け入れ基準

- [ ] `AdrGenStep` に self-fix の `followUpPrompt` が設定されている
- [ ] follow-prompt は「修正」を指示し「判定」を指示しない (= prompt 文面で確認)
- [ ] follow-prompt は `adr: true` のパスでのみ発火し、`adr: false` の no-op パスでは送られない (= ADR 誤生成防止)
- [ ] `adr: false` の request では adr-gen が従来通り no-op で終わり、ADR は生成されない (= 既存挙動維持)
- [ ] 機械 validator / 新ステップ (adr-fixer) は追加しない (= 本 request のスコープは follow-prompt のみ)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

1. **ADR の強制力は spec より弱くてよい** — spec は baseline 規範なので決定論的 gate (dsv) が要るが、ADR は設計記録であり確率的補強 (follow-prompt) で足りると判断。重い機構は段階導入
2. **新ステップ新設は慎重に** — adr-fixer / validator は follow-prompt の実績を見てから。先に最小の follow-prompt だけ入れる
3. **follow-prompt は修正専用** (= self-review 検出は確認バイアスで不採用)
4. **follow-prompt は `adr: true` 限定** (= no-op パスでの ADR 誤生成を防ぐ)
5. **案 A (構造化出力) は恒久的に不採用** (= vendor 差で adapter-neutral でない)

将来 validator 路線に進む場合の確定事項 (= 今回は使わないが記録):

- 独立 ADR validator は `src/core/adr/rules/` に新設 (= dsv の delta spec 固有型を流用すると cohesion が崩れる)
- 専用 adr-fixer step (= adr-gen 兼務は loop counter 矛盾、`pipeline.ts:179` の fixer 名ベース判定)
- ADR file 特定は `specrunner/adr/*-{slug}.md` の glob、date prefix は形式のみ検証 (今日との一致は不要)

design step に委ねる残論点:

- follow-prompt 文面の詳細
- gate 機構 (= 動的 followUpPrompt vs `shouldRunFollowUp` で adr flag 参照)
