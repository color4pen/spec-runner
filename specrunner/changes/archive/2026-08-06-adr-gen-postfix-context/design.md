# Design: adr-gen が fixer 適用後の最終実装から ADR を導出する

## Context

adr-gen は review loop 収束後にのみ走り、以後 fixer は走らない。step の実行順序は正しい。問題は adr-gen が読む入力が「design 確定時点の静的成果物」に固定されていることにある。

実運用で、code-fixer が code-review の指摘を受けて fail-closed guard を実装した後、adr-gen がその guard を Alternatives Considered（却下した代替案）として記述する ADR を生成した。ship 済みの機構を「採らなかった」と断言する ADR は後続の読者・レビュー・設計判断を実装と逆方向へ誘導する。

構造的原因は、adr-gen が design.md を「設計判断の主出典」として読むが、review loop で fixer が適用した変更を知る経路が一切無いことにある。design.md と実装が乖離した run では、adr-gen は pre-fix の設計叙述をそのまま ADR 化する。

現状コードの前提（fact-check 済み）:

- `src/core/step/adr-gen.ts:89-97` — `buildAdrGenInitialMessage` の Judge materials は request.md / design.md / spec.md / review-feedback-*.md / `git diff {base}..HEAD --stat` のみ。`buildMessage`（:169-177）は `dynamicContext` を参照しない。
- `src/prompts/adr-gen-system.ts:52` — system prompt は design.md を「設計判断の主出典。『なぜこの設計を選んだか』『何を選ばなかったか』を読む」と指定。
- `src/core/step/code-fixer.ts:303-310` — code-fixer は summary 成果物を生成しない（`resultFilePath` → null / `NULL_PARSE_RESULT`）。`src/core/step/write-scope.ts:64-74` — design.md は保護 canon path で code-fixer は書けない。よって fixer が実装を変えても design.md は pre-fix のまま残る。
- `src/core/step/step-context-builder.ts:152-160` — `prepareRoundContext` hook は core が全 step で best-effort 呼び出す汎用機構（try/catch で全失敗が黙って degrade）。
- `src/core/step/prior-round-context.ts` — spec-review の周回間 context で `derivePriorRoundContext` が確立済み。導出失敗の全経路が null 縮退し step を止めない。
- `src/core/port/runtime-strategy.ts:90-92,635-651` — `listCommitChangedFiles(oid, cwd)` は `ChangedFilesResult`（`success{files}` | `unavailable{reason}`）を返す never-throw の optional port。managed runtime は常に `unavailable`。
- `src/state/schema/types.ts:132,173-210` — agent step の `StepRun.commitOid?` に exit-HEAD が記録される。`StepOutcome.toolResult?.findings` に judge step の findings が記録される。
- `src/core/step/fixer-helpers.ts:52-65` — `getLatestJudgeFindings(state, stepName)` が最新 run の findings を返す既存 helper。
- `src/core/step/spec-review.ts:104-130` — `prepareRoundContext` が `derivePriorRoundContext` を呼び `{ priorRoundContext }` を返し、`buildMessage` が `deps.dynamicContext?.priorRoundContext` を読んで `buildPriorRoundContextBlock` でブロック化し initial message に埋め込む配線の前例。

### 層の制約（本設計の核心・前例踏襲）

`buildMessage(state, deps)` は pure（I/O 禁止、invariant B-5）。fixer 変更 file 集合の導出は `runtimeStrategy.listCommitChangedFiles`（async I/O）を要する。`runtimeStrategy` は core 層の `PipelineDeps` にのみ存在し、adapter へ渡る `AgentRunContext` には載らない。したがって導出は `runtimeStrategy` が生きる core 層で行い、結果を `DynamicContext` に載せて pure な `buildMessage` へ手渡す必要がある。これは spec-review-prior-round-context で確立済みの構造であり、本 change はその sibling として同じ `prepareRoundContext` hook を adr-gen に適用する。

## Goals / Non-Goals

**Goals**:

- adr-gen の initial message に「design 確定後に fixer が適用した修正」の post-fix context ブロックを注入する。ブロックは code-fixer の `commitOid` 全件（全 round）から `listCommitChangedFiles` で機械導出した changed files と、各 round に対応する review-feedback 指摘の要約を併記する。
- 指摘要約と changed files は state（findings）と git（commit）の機械事実のみから構成する。agent の自己申告は真実源にしない。
- system prompt に優先順位規律を追加する: post-fix ブロックが存在する場合、最終実装が正であり、fixer が実装した機構を Alternatives Considered として記述してはならない。ship 済み機構は Decision / Consequences 側に記述する。design.md と最終実装が乖離している箇所はブロック側を正とする。
- 導出のどの失敗（port 不在・commitOid 欠落・git unavailable）でもブロックなしに縮退し、step 実行を止めない・throw しない。
- fixer が一度も走っていない run では従来 message を維持する（無変更）。

**Non-Goals**:

- code-fixer に summary 成果物（自己申告ファイル）を持たせること。commit という機械事実からの導出で十分かつ信頼できる。
- design.md を fixer が追随更新する機構。design.md は spec phase の正典で write-scope 保護されており、impl phase の fixer に開けると正典汚染の経路になる。
- adr-gen の step 配置変更。adr-gen は既に review loop 収束後にのみ走り、順序の問題ではなく入力の問題である。
- ADR 本文の機械 validator（judge=yes/no や Alternatives の正しさを機械検証する gate）。
- reads() の review-feedback 宣言（最新 iteration のみ）と message 本文（`*.md` any numbered）の既存不整合の解消。ブロックは state findings から導出するため reads() に依存せず、本 change の要件・受け入れ基準に含まれない（別途扱い）。

## Decisions

### D1: 導出は core 層の `prepareRoundContext` hook で行う（新規 port / hook を追加しない）

adr-gen に `prepareRoundContext(state, cwd, runtimeStrategy)` を実装し、`buildStepContext`（`step-context-builder.ts:152-160`）が best-effort で呼ぶ既存経路に乗せる。返り値 `{ postFixContext }` は `dynamicContext` に spread-merge され、pure な `buildMessage` が `deps.dynamicContext?.postFixContext` として受け取る。

- **Rationale**: core が既に全 step で `prepareRoundContext` を try/catch 付きで呼んでおり、新規 port も新規 hook も不要。spec-review で確立済みのパターンと縮退規律をそのまま踏襲でき、blast radius が最小。`enrichContext`（adapter 起動）は `runtimeStrategy` を参照できないため使えない。
- **Alternatives considered**:
  - *adr-gen の `enrichContext` 内で直接 git subprocess を叩く*: 却下。受け入れ基準は「changed files が `listCommitChangedFiles` mock 経由で機械導出であること」を要求する。直 subprocess では seam を mock できず AC を満たせない。かつ adapter 層は `runtimeStrategy` を持たない。
  - *agent への「git log を読め」prompt 指示のみ*: 却下。prompt 指示は agent の裁量で縮退し、注入の有無をテストで固定できない。機械注入が確実。
  - *code-fixer に summary 成果物を持たせ adr-gen が読む*: 却下（Non-Goal）。fixer 契約の変更は影響が広く、agent 自己申告は信頼できない。

### D2: `DynamicContext` に `postFixContext` field を追加する（inline 構造型）

`src/git/dynamic-context.ts` の `DynamicContext` に optional field を追加する:

```
postFixContext?: {
  rounds: {
    round: number;
    commitOid: string;
    changedFiles: string[];
    findings: { severity: string; resolution: string; file: string; title: string }[];
  }[];
};
```

- **Rationale**: `priorRoundContext` / `factCheckAttestation` の前例に倣い inline 構造型で宣言し、`src/git/` から domain 型（`Finding` 等）を import しない（層越え回避）。in-memory のみで state / journal に永続化しない（one-shot 注入）。`collectDynamicContext` は本 field を設定しない（既存挙動不変）。
- **Alternatives considered**:
  - *`priorRoundContext` を汎用化して両者で共有する*: 却下。post-fix は round 配列（複数 fixer round × findings 対応）で構造が異なる。無理な統合は両者の変更を絡ませ blast radius を広げる。

### D3: post-fix context の対象 fixer は code-fixer に限定する

`derivePostFixContext` は `state.steps[CODE_FIXER]` の StepRun のみを round 源とする。build-fixer / spec-fixer は含めない。

- **Rationale**: (1) request が code-fixer を必須対象とし、他 fixer の含め方を設計判断に委ねている。(2) 動機となった失敗は code-review → code-fixer の guard 実装であり、design 判断に絡む修正は code-fixer に集約される。(3) 要件 2 は「対応する review-feedback の指摘要約」を求める。code-fixer の findings は reviewer（code-review / custom reviewer / conformance）由来で review-feedback に対応するが、build-fixer の findings は verification 由来で review-feedback に対応せず構造が合わない。(4) 対象を絞ることで ADR 文脈のノイズと test surface を抑える。build-fixer は build 破綻の機械修正であり design 判断を含むことは稀。
- **Alternatives considered**:
  - *implementer / build-fixer / code-fixer を全て含める*: 却下（現時点）。design.md 乖離は原理上どの impl-phase 修正でも起こりうるが、review-feedback 対応付けが成立するのは code-fixer のみ。含めるなら finding 源の切り替えが必要で複雑化する。将来 build-fixer の混入が実害を出したら、round 源の集合を拡張する余地は残す（`FIXER_STEP_NAMES` 相当の集合定数化）。

### D4: 各 round と findings の対応付けは「fixer round 直前の最新 findings-bearing run」で行う

`derivePostFixContext` は各 code-fixer round（`endedAt = t`）に対し、`state.steps` 全体で `endedAt < t` を満たす findings-bearing StepRun のうち `endedAt` が最大の run の findings を対応付ける（純関数 `findFindingsBeforeTimestamp(state, t)`）。findings は `{ severity, resolution, file, title }` に射影する。該当が無ければ空配列。

- **Rationale**: pipeline は step を逐次実行するため、code-fixer round i の直前の findings-bearing run は、その round を発火させた reviewer（code-review iteration i / active custom reviewer / conformance）になる。`endedAt` 単調性から「直前の最新」が発火源と一致する。findings と timestamp は state の機械事実であり自己申告を含まない。spec-review が producing する findings は code-fixer より前の phase なので、code-fixer round 直前の最新には決してならず混入しない。
- **Alternatives considered**:
  - *round の ordinal で code-review iteration と 1:1 対応させる*: 却下。custom reviewer や conformance 経由の fixer entry があると ordinal が 1:1 にならない。
  - *(prevRound.endedAt, thisRound.endedAt] の窓で findings を全収集する*: 却下（採らない）。並行 reviewer を取りこぼさない利点はあるが、初回 round の下限が曖昧で spec-review 混入の危険があり、窓境界の扱いが複雑。changed files（hard evidence）は全 round 完全に導出されるため、findings（supporting context）は「直前の最新 1 件」で十分。並行 co-reviewer の findings は最新の 1 reviewer 分のみ現れる制約を許容する（Risks 参照）。

### D5: 縮退は全経路 null（部分ブロックを出さない）

`derivePostFixContext` は以下のいずれでも `null` を返す（ブロック非注入 = 従来 message）:

- code-fixer の StepRun が 1 件も無い、または commitOid を持つ round が 1 件も無い（→ fixer なし run。要件 5）。
- `runtimeStrategy?.listCommitChangedFiles` が不在（managed runtime 相当）。
- いずれかの round の `listCommitChangedFiles` が `success` 以外を返す（`unavailable` 等）、または port 呼び出しが throw する。

port 呼び出しは try/catch で囲み、`derivePostFixContext` は throw しない（prior-round は外側の best-effort try/catch に依存するが、本 change は内部でも捕捉し、"never throws" を関数契約として明示する）。

- **Rationale**: 「機械事実のみ・部分的な嘘を出さない」規律。全 round の changed files を完全に導出できない限りブロックを注入しない。これにより「各失敗経路 → null 縮退」が単純にテスト固定でき、prior-round-context の縮退規律と一貫する。ブロック非注入時は adr-gen が従来の design.md ベース挙動へ安全に degrade する。
- **Alternatives considered**:
  - *失敗した round のみ skip して残りでブロックを組む*: 却下。部分ブロックは「この round は変更なし」と誤読され、機械事実の完全性を損なう。all-or-nothing の方が誤誘導リスクが低い。

### D6: 注入は message、優先順位規律は system prompt

`buildAdrGenInitialMessage` に optional な `postFixContextBlock?: string` を追加し、存在時のみ Judge materials の後に post-fix セクションとして追記する。ブロック非注入時の message は byte-identical に保つ（要件 5）。優先順位規律（最終実装が正・ship 済み機構を却下案にしない・乖離時はブロックを正）は `src/prompts/adr-gen-system.ts` の Contract / 判定手順に追加する。

- **Rationale**: 「何を読むか」（materials）は run 固有なので message に、「どう判断するか」（規律）は run 非依存なので system prompt に置く既存分業に従う。ブロック非注入を byte-identical に保つことで TC-ADR-STEP-01 系と fixer なし run の無変更が保証される。
- **Alternatives considered**:
  - *規律も message に埋める*: 却下。規律は毎 run 同一で system prompt が正しい置き場。message に混ぜると重複と drift の温床になる。

## Risks / Trade-offs

- [Risk] D4 の「直前の最新 1 件」対応付けは、同一 round に並行 reviewer（code-review + custom reviewer）が findings を出した場合、最新 1 reviewer 分の findings しか併記しない → **Mitigation**: changed files（hard evidence）は commit から全 round 完全に導出されるため ADR の事実誤認は防げる。findings は「なぜ変えたか」の supporting context に留まり、欠けても ship 済み機構を却下案にする逆転は起きない。将来必要なら窓収集へ拡張できる。
- [Risk] system prompt の優先順位規律は agent の遵守に依存し、機械強制ではない → **Mitigation**: ブロックの機械注入自体はテスト固定される（注入の有無は決定的）。規律違反（ship 済み機構を却下案化）の機械検出は Non-Goal（ADR 本文 validator）だが、post-fix ブロックの存在で agent の入力が pre-fix に固定される根本原因は解消される。
- [Risk] all-or-nothing 縮退（D5）により、多数 round のうち 1 件でも git 失敗するとブロック全体が消える → **Mitigation**: local runtime で `listCommitChangedFiles` が単一 round だけ失敗するのは稀（commitOid は state に記録済みで存在保証が高い）。消えても従来 design.md ベース挙動へ安全に縮退する。

## Open Questions

なし（architect 評価で主要な設計分岐は確定済み。D3 の build-fixer 混入拡張は将来 request の余地として残すが、本 change のスコープ外）。
