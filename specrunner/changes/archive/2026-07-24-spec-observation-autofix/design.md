# Design: spec フェーズの observation auto-fix — minor 指摘は fixer 消化後に再レビューなしで前進する

## Context

impl フェーズの reviewer chain には observation auto-fix がある。reviewer が
`approved` かつ `fixable`（low / medium）finding を返すと、verdict は `approved` のまま
`code-fixer` が finding を消化し、**再レビューなしで次の step へ直行**する
（`src/core/pipeline/reviewer-chain.ts:142-148`：`R_i approved + fixable → code-fixer`、
`code-fixer approved → next(R_i) when active_reviewer == R_i AND R_i last verdict approved`）。
fixer の自己申告は即時再レビューではなく、findings ledger 経由で後段の regression-gate が機械検証する。

spec フェーズにはこの形が無い。`deriveSpecReviewVerdict`（`src/core/step/judge-verdict.ts:85-107`）の
4b は routable canon fixable finding が 1 件でもあれば severity 不問で `needs-fix` を返す（#913）。
そのため minor（low / medium）な転記型 finding でも `spec-fixer → spec-review` の再レビュー往復が必ず発生し、
再レビューが新たな minor finding を出すたびに往復が連鎖する。実運用では minor finding 6 件で
5 往復・operator resume 2 回を要した run が観測されている。

現状コードの前提（fact-check 済み）:

- 遷移: `SPEC_REVIEW approved → TEST_CASE_GEN`（`types.ts:233`）、
  `SPEC_REVIEW needs-fix → SPEC_FIXER`（`types.ts:234`）、
  `SPEC_FIXER approved → SPEC_REVIEW`（`types.ts:241`、無条件）。
- conformance 経路: `CONFORMANCE needs-fix:spec-fixer → SPEC_FIXER`（`types.ts:266`）。この spec-fixer も
  完了後は `SPEC_FIXER approved → SPEC_REVIEW` で spec-review 再検証（reverification）に戻る。
- spec-fixer の書込集合は `{spec.md, design.md, tasks.md}`（`canon-write-scope.ts:51`）。
- `collectFindingsLedger`（`findings-ledger.ts:33`）の走査対象は impl reviewer chain
  （`deriveImplReviewerChain` = `[code-review, ...customReviewers]`）のみ。spec-review は台帳源ではない。
  さらに台帳は canonScope 指定時に `judgeEffectiveFixer`（常に code-fixer）基準で unroutable canon finding を
  除外する（`findings-ledger.ts:55-62`）。
- regression-gate（`regression-gate.ts`）は custom reviewer が存在するときだけ pipeline に注入される
  （`compose-reviewers.ts:50`）。ledger 機械検証はこの構成でのみ働く。これは impl 側 observation auto-fix と
  対称である（custom reviewer 不在時は code-review の observation pass にも regression-gate は無い）。
- 遷移の `when` predicate は `state` のみ受け取る（`Transition.when?: (state: JobState) => boolean`、
  `types.ts:148`）。slug は `getJobSlug(state)`（`src/state/job-slug.ts:69`）で state から導出できる。

## Goals / Non-Goals

**Goals**:

- `deriveSpecReviewVerdict` を変更し、routable canon fixable finding が **low / medium のみ**のとき
  `approved` を返す（finding は記録される）。critical / high を含むときは従来どおり `needs-fix`。
- spec-review が `approved` かつ routable fixable finding ≥ 1 のとき spec-fixer に遷移し、spec-fixer が消化した後
  **spec-review の再レビューなしで test-case-gen に直行**する（impl 側 `code-fixer → next(R_i)` と同型）。
- 直行遷移を「直前の spec-review 判定が approved だった」場合に限定し、conformance の needs-fix:spec-fixer 起点の
  spec-fixer と needs-fix 起点の spec-fixer は従来どおり spec-review 再検証に戻す。
- observation pass で消化された spec-review の fixable finding を findings ledger に載せ、regression-gate が
  impl フェーズで機械検証できるようにする。
- observation pass の spec-fixer 実行が spec-review のループ予算（review 反復回数）を消費しないことを保つ。

**Non-Goals**:

- spec-review prompt の全量列挙規律・finding-recency 検出（#925）は変更しない。
- impl 側（code-review / custom reviewers）の observation auto-fix・`deriveJudgeVerdict` /
  `deriveConformanceVerdict` / `deriveRegressionGateVerdict` / `deriveRequestReviewVerdict` は変更しない。
- unroutable canon fixable（request.md / test-cases.md / attestation）の minor finding の扱いは変更しない
  （現行どおり `escalation` + `escalationReason` を維持）。
- FAST pipeline（spec-review 自体が無い）は対象外。`FAST_TRANSITIONS` は変更しない。
- conformance の fixTarget routing は変更しない。
- observation pass で消化した修正の即時 LLM 再レビューは導入しない（後段の regression-gate 機械検証で代替する）。
- spec-fixer の書込集合・spec-fixer step の buildMessage / reads は変更しない。

## Decisions

### D1: `deriveSpecReviewVerdict` の 4b を「routable critical/high のみ needs-fix」に絞る

`src/core/step/judge-verdict.ts` の `deriveSpecReviewVerdict` の判定 4b を次のとおり変更する。

- 4a（unroutable canon fixable ≥ 1 → `escalation`）は不変。
- 4b: `selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer)` のうち
  `severity` が `critical` または `high` のものが ≥ 1 のときのみ `needs-fix`。低位（low / medium）のみのときは
  fall-through し、後続の判定 5（非 canon critical|high → `needs-fix`）・判定 6（`approved`）に委ねる。
- 判定 5・6 は不変。routable low/medium-only は判定 5 に該当しない（critical|high なし）ため判定 6 で `approved` になる。

結果の verdict 真理値表（`ok:true`・非 vacuous・decision-needed なしの前提）:

| findings | 変更前 | 変更後 |
|---|---|---|
| medium fixable on spec.md（routable low/med） | needs-fix | **approved** |
| low fixable on design.md（routable low/med） | needs-fix | **approved** |
| medium fixable on tasks.md（routable low/med） | needs-fix | **approved** |
| high fixable on spec.md（routable high） | needs-fix | needs-fix |
| critical fixable on spec.md（routable critical） | needs-fix | needs-fix |
| medium fixable on request.md（unroutable） | escalation | escalation |
| medium fixable on src/example.ts（非 canon） | approved | approved |
| critical fixable on src/example.ts（非 canon） | needs-fix | needs-fix |
| decision-needed | escalation | escalation |

- **Rationale**: 要件 1。blocking な仕様欠陥（critical / high）は修正の正しさ自体に判断が要り機械検証で代替できないため
  従来どおり再レビュー往復を維持する。minor は fixer 消化 + 後段機械検証に移す。判定 5 が非 canon の critical|high を
  すでに拾うため、4b の critical/high 判定は routable canon の blocking を明示的に needs-fix に倒す（可読性のための
  明示的分岐であり、判定 5 と結果は一致する — 意図の可読化を優先し重複を許容する）。
- **Alternatives considered**:
  - *全 fixable を severity 閾値なしで直行*: 却下（request architect 評価）。critical / high の欠陥検証を落とす。
  - *`deriveJudgeVerdict` を流用（4b 削除）*: 却下。spec-review 固有の canon routing（4a escalation）を失う。

### D2: state から canonScope を導出する `buildCanonWriteScopeFromState(state)` を追加する

遷移の `when` predicate は `state` のみ受け取り `deps` を持たないため、既存
`buildCanonWriteScope(state, deps)`（`deps.slug` 依存）を呼べない。`src/core/step/canon-write-scope.ts` に
`buildCanonWriteScopeFromState(state: JobState): CanonWriteScope` を追加し、slug を `getJobSlug(state)` から導出する。
内部の scope 構築は private helper `buildScopeForSlug(slug)` に切り出し、`buildCanonWriteScope(state, deps)` と
`buildCanonWriteScopeFromState(state)` の両方が同一 helper に委譲する（single source of truth、drift 防止）。

- **Rationale**: 要件 2 の routable 判定には canonPaths + spec-fixer writable 集合が必要。既存の
  `buildCanonWriteScope(state, deps)` は挙動不変のまま残し、遷移 predicate 用の state-only 入口を足す。
- **Alternatives considered**:
  - *遷移 predicate の guard を `collectFixableFindings > 0`（impl 側と同一・canonScope 不要）にする*: 却下。
    非 canon の低位 fixable finding が 1 件だけ存在する場合に spec-fixer へ無益に routing してしまう。要件 2 は
    「routable fixable ≥ 1」を明示しており、routable 判定に canonScope が要る。
  - *`buildCanonWriteScope` の署名を `(slug)` に変更*: 却下。既存 2 呼び出し点（step-completion / regression-gate）へ
    波及する。state-only sibling を足す方が影響が局所。

### D3: 遷移 predicate を担う純関数モジュール `src/core/pipeline/spec-observation.ts` を追加する

reviewer-chain.ts が impl 側 observation 遷移の predicate を持つのに倣い、spec フェーズ用の純関数を独立モジュールに置く。

- `specReviewHasRoutableFixables(state): boolean`
  最新 spec-review run の findings（`getLatestJudgeFindings(state, SPEC_REVIEW)`）に対し
  `selectRoutableCanonFindings(findings, buildCanonWriteScopeFromState(state), specReviewEffectiveFixer).length > 0`。
  `SPEC_REVIEW approved → SPEC_FIXER` の `when` guard に使う。
- `specFixerForwardsToTestGen(state): boolean`
  `getConformanceFixContext(state, SPEC_FIXER) === null` かつ 最新 spec-review run の verdict が `"approved"`。
  `SPEC_FIXER approved → TEST_CASE_GEN` の `when` guard に使う。
  `getConformanceFixContext`（`fixer-helpers.ts:101`）は「conformance が newer かつ verdict が needs-fix:spec-fixer」の
  ときだけ非 null を返す。したがって conformance 起点の spec-fixer では非 null → 本 predicate は false → 直行しない。
  needs-fix 起点では最新 spec-review verdict が `"needs-fix"` → false → 直行しない。observation pass
  （最新 spec-review verdict が `"approved"`、conformance context なし）でのみ true → test-case-gen へ直行する。

- **Rationale**: 要件 2 / 3。impl 側 `code-fixer → next(R_i) when active_reviewer == R_i AND R_i last verdict approved`
  と同型の「fixer が直前の approved reviewer に紐づくとき前進」判定を spec 側に移植する。conformance / needs-fix 経路の
  分離は `getConformanceFixContext` と「最新 spec-review verdict」の 2 条件で機械的に決まる。
- **Alternatives considered**:
  - *予約フラグを state に書いて分岐*: 却下。新規 state フィールドは resume 再構築面を増やす。既存の
    `getConformanceFixContext` + 最新 verdict で判定が閉じるため不要。

### D4: STANDARD_TRANSITIONS に guarded 行を 2 本追加する（impl 側と同型）

`src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に、既存の無条件行より**前**に guarded 行を挿入する
（`this.transitions.find(...)` は先頭一致を採るため順序が重要）。

```
{ step: SPEC_REVIEW, on: "approved", to: SPEC_FIXER,    when: specReviewHasRoutableFixables }  // 追加（前）
{ step: SPEC_REVIEW, on: "approved", to: TEST_CASE_GEN }                                        // 既存（後）

{ step: SPEC_FIXER,  on: "approved", to: TEST_CASE_GEN, when: specFixerForwardsToTestGen }      // 追加（前）
{ step: SPEC_FIXER,  on: "approved", to: SPEC_REVIEW }                                          // 既存（後）
```

`SPEC_REVIEW needs-fix → SPEC_FIXER`（:234）・`SPEC_FIXER error → escalate`（:242）は不変。`FAST_TRANSITIONS` は不変。

- **Rationale**: 要件 2。新 step を作らず既存の spec-review / spec-fixer / test-case-gen ノードを guarded edge で
  結ぶ。予算安全性（要件 5）は D5 参照。
- **Alternatives considered**:
  - *spec-fixer 完了時に軽量 diff 検証 step を新設*: 却下（request architect 評価）。pipeline 形状の複雑化。
    regression-gate という既存の検証座席がある以上不要。

### D5: 予算非消費は直行遷移で構造的に満たす

observation pass の経路は `spec-review（1 回）→ spec-fixer → test-case-gen` で spec-review を再入場しない。
ループ予算は loop step 入場時（`budget.enterLoopStep(SPEC_REVIEW)`）にのみ加算されるため、observation pass の
spec-review 反復数は clean approved と同じ 1 に留まる。spec-fixer は paired fixer として別カウンタ
（`enterFixerStep`）で数えられ spec-review のループカウンタを増やさない。したがって要件 5 は新機構なしで満たされる。

spec-fixer の budget が枯渇している場合は既存の T-03 リルート（`pipeline.ts:445-490`）が working する。
`outcome === "approved"` かつ `nextStep` が paired fixer（spec-fixer）かつ fixer budget ≥ max のとき、`to` が
fixer でない clean 行（= `SPEC_REVIEW approved → TEST_CASE_GEN`）へリルートされる。これは impl 側の
「code-review approved+fixable → code-fixer budget 枯渇 → conformance へリルート」と同型で、追加実装は不要。

- **Rationale**: 要件 5。budget 消費は loop step 再入場に紐づくため、直行遷移が再入場を作らない限り消費は増えない。
- **Alternatives considered**:
  - *spec-fixer 入場時に spec-review budget を明示的に据え置く特別処理*: 却下。直行遷移で自然に満たされ不要。

### D6: findings ledger に spec-review 由来 fixable finding を spec-fixer resolver で載せる

`collectFindingsLedger` に spec-review を単純追加すると、台帳の canon 除外が `judgeEffectiveFixer`（常に code-fixer）
基準のため spec.md / design.md / tasks.md への finding が全て unroutable と判定され台帳から落ちる。これでは要件 4 を
満たせない。そこで spec-review 専用の収集関数を足す。

- `src/core/pipeline/findings-ledger.ts` に
  `collectSpecReviewLedger(state: JobState, canonScope?: CanonWriteScope): Finding[]` を追加する。
  spec-review の全 StepRun を走査し `resolution === "fixable"` を収集・dedupe する。canonScope 指定時は
  `specReviewEffectiveFixer`（常に spec-fixer）基準で unroutable canon finding を除外する
  （= spec.md / design.md / tasks.md は保持、request.md / test-cases.md / attestation は除外）。
  実運用では observation pass 到達時の spec-review fixable finding は routable canon（spec-fixer 書込可）に限られる
  （unroutable は verdict 段で escalation 済み）ため、この除外は保守的な安全網である。
- `src/core/step/regression-gate.ts` の `buildMessage` / `skipWhen` の 2 箇所で、既存の
  `collectFindingsLedger(deriveImplReviewerChain(state), state, canonScope)` に
  `collectSpecReviewLedger(state, canonScope)` を合流させ `dedupeFindings([...spec, ...impl])` を台帳とする。
  `skipWhen` も合流後の台帳が空のときのみ skip する（spec-review finding のみでも gate を走らせる）。

regression-gate の verdict 導出（`deriveRegressionGateVerdict`）は不変。regressed した spec.md finding が gate 出力に
現れた場合、canonScope + `judgeEffectiveFixer`（R1 unroutable 判定）で code-fixer には unroutable → `escalation` に倒れる
（operator が canon を修正）。これは既存の canon-escalation 設計と整合し、正典 regression の honest な帰結である。

- **Rationale**: 要件 4。「agent 自己申告を信頼しない」を即時 LLM 再レビューでなく後段機械 gate で満たす、impl 側実績構成。
  spec finding は spec-fixer 由来なので spec-fixer resolver で台帳保持する。台帳の canon 除外を混在 resolver で行うと
  finding が収集後に source を失うため、source 別収集（spec-review 専用関数）が最も局所で testable。
- **Alternatives considered**:
  - *`collectFindingsLedger` の chain に "spec-review" を混ぜる*: 却下。judgeEffectiveFixer 除外で spec finding が落ちる。
  - *台帳の canon 除外 resolver を step 別に切替える汎用化*: 却下。finding は収集後 source を持たず、step→resolver の
    写像を collectFindingsLedger に持ち込むと impl chain 側の意味論に副作用リスク。source 別収集の方が影響が局所。

### D7: ADR

本変更は spec フェーズの review/fixer routing と検証座席を変える設計判断であり ADR-worthy（request.adr = true）。
ADR の生成・配置は adr-gen step に委ねる（本 design / tasks に ADR path は記載しない）。

## Risks / Trade-offs

- **[Risk] conformance reverification 経路の破壊（越境ハザード、要件 3）** → `specFixerForwardsToTestGen` を
  `getConformanceFixContext(state, SPEC_FIXER) === null` で gate する。conformance 起点の spec-fixer は context 非 null で
  直行しない。needs-fix 起点は最新 spec-review verdict が needs-fix で直行しない。3 経路（observation / needs-fix /
  conformance）の分離を遷移テストで固定する（受け入れ基準）。
- **[Risk] spec-review 由来 finding が台帳除外で機械検証から漏れる（要件 4）** → D6 で spec-fixer resolver 基準の
  専用収集関数を用い、spec.md / design.md / tasks.md finding を台帳に保持する。台帳内包をテストで固定する。
- **[Risk] observation pass の反復増による予算枯渇・無限ループ** → 直行遷移は spec-review を再入場しない（D5）。
  spec-fixer budget 枯渇時は既存 T-03 リルートで test-case-gen へ抜ける。有界。
- **[Risk] 遷移 predicate が誤って routable なしでも spec-fixer へ倒す** → `specReviewHasRoutableFixables` は
  `selectRoutableCanonFindings > 0` で gate。routable なし（例: 非 canon 低位 finding のみ）は clean 行で
  test-case-gen へ直行し spec-fixer を挟まない。
- **[Trade-off] 期待値を更新する既存テスト** → #913 の「severity 不問 needs-fix」を期待する単体テスト
  （spec-review medium/low routable → needs-fix）は approved 期待へ更新が必要。`STANDARD_TRANSITIONS.length`
  の総数アサーションも +2 更新が必要。tasks の implementation-notes 課題で列挙する（受け入れ基準）。

## Open Questions

なし（request の architect 評価で採否が確定済み。in-scope の主要アサーションはコードで検証済み。
attestation 記載のアサーションは request-review 済みとして再検証を省略した）。
