# Design: test-case-gen を design phase の最終工程へ移動

## Context

現行の spec-phase 遷移は `design → spec-review → test-case-gen → test-materialize` で、
test-cases.md は spec-review 承認**後**に生成される。test-cases.md は実装・検証・整合確認を
拘束する canon 成果物でありながら、どのレビューの照合対象にもならないまま確定している。

実害: 設計文書だけの承認を通過した TC が、実装前に決められない詳細（API 呼び出し手順・
内部状態）まで GIVEN/WHEN/THEN に書き込み、正しい実装と矛盾する。不整合が canon 権威側に残る。

現状コード（検証済み前提）:

- `src/core/pipeline/types.ts` STANDARD_TRANSITIONS（現在 49 行）:
  - `:232` DESIGN success → SPEC_REVIEW
  - `:236` SPEC_REVIEW approved → SPEC_FIXER `when specReviewHasRoutableFixables`（観察 pass）
  - `:238` SPEC_REVIEW approved → IMPLEMENTER `when isTestGenExempt`（免除 bypass, #987）
  - `:239` SPEC_REVIEW approved → TEST_CASE_GEN（無条件）
  - `:240` SPEC_REVIEW needs-fix → SPEC_FIXER
  - `:242` TEST_CASE_GEN success → TEST_MATERIALIZE
  - `:247` SPEC_FIXER approved → IMPLEMENTER `when specFixerForwardsToImplementer`（免除観察 pass）
  - `:249` SPEC_FIXER approved → TEST_CASE_GEN `when specFixerForwardsToTestGen`（観察 pass 下流継続）
  - `:251` SPEC_FIXER approved → SPEC_REVIEW（needs-fix 再レビュー + conformance 再検証 fallback）
- `src/core/step/judge-verdict.ts` `deriveSpecReviewVerdict` — canon fixable finding を
  `specReviewEffectiveFixer`（常に spec-fixer）で routable/unroutable 判定。spec-fixer が書けない
  canon（request.md / **test-cases.md** / attestation）への fixable finding は unroutable → **escalation**。
- `src/core/step/canon-write-scope.ts` `writableByFixer` — code-fixer:∅ / implementer:{tasks.md} /
  spec-fixer:{spec,design,tasks}。test-cases.md はどの fixer にも属さない。
- `src/core/step/write-scope.ts` `protectedCanonPaths` — test-cases.md を無条件で保護。
  test-case-gen は writes() で test-cases.md を宣言しているため、test-case-gen のみが commit 時に書ける。
- `src/core/step/spec-review.ts` reads() — request/spec/design/tasks。test-cases.md を読まない。
- `src/prompts/spec-review-system.ts` — 照合観点に test-cases.md なし。
- `src/prompts/test-case-gen-system.ts` — 抽象度（実装構造へ踏み込まない）の指示なし。

### 制約

- 新しい reviewer step を作らない（step 追加はトークンコストで既定 NG）。
- spec-review の verdict 種別・ループ上限・escalation 経路は変更しない。
- 免除 type（#987）の対象は拡大しない。
- conformance からの spec-fixer 再入経路は意味論変更せず機械的追随のみ。
- FAST pipeline は spec-review / test-case-gen を持たないため無変更。
- 成果物（test-cases.md）の canon 保護（write-scope commit 制御）は維持する。

## Goals / Non-Goals

**Goals**:

- 通常経路を `design → test-case-gen → spec-review → test-materialize` に組み替える。
- spec-review が spec / tasks / test-cases の三者を照合してから下流へ渡す。
- test-cases.md を「何を確認できればよいか」の振る舞いレベルに留め、抽象度逸脱を spec-review が検査する。
- spec-review が test-cases.md に出す fixable finding を、承認**前**は escalation にせず
  test-case-gen 再生成で解消する。承認**後**の test-cases.md 保護は従来どおり維持する。

**Non-Goals**:

- test-materialize の挙動・存廃（別 request）。
- bite-evidence baseline（別 request）。
- spec-review verdict 種別 / ループ上限 / escalation 経路の変更。
- 免除 type の対象拡大。
- conformance→spec-fixer 再入の意味論変更（機械的追随のみ）。
- 新 reviewer step の追加。

## Decisions

### D1: 遷移の組み替え（通常経路を design → test-case-gen → spec-review → test-materialize）

STANDARD_TRANSITIONS の design/spec-review/test-case-gen/spec-fixer ブロックを次に置き換える
（first-match-wins。guarded row が unconditional row に先行する）:

```
# design
DESIGN success  → SPEC_REVIEW      when isTestGenExempt   # 免除 type は TC を通らず直行
DESIGN success  → TEST_CASE_GEN                           # 通常 type は先に TC 生成
DESIGN error    → escalate

# test-case-gen（design phase 内、spec-review の前）
TEST_CASE_GEN success → SPEC_REVIEW
TEST_CASE_GEN error   → escalate

# spec-review approved
SPEC_REVIEW approved → SPEC_FIXER       when specReviewHasRoutableFixables   # 観察 pass（不変）
SPEC_REVIEW approved → IMPLEMENTER      when isTestGenExempt                 # 免除 bypass（不変）
SPEC_REVIEW approved → TEST_MATERIALIZE                                      # 下流（旧: TEST_CASE_GEN）

# spec-review needs-fix
SPEC_REVIEW needs-fix → TEST_CASE_GEN   when specReviewNeedsFixIsTcOnly      # TC のみ → 再生成直行
SPEC_REVIEW needs-fix → SPEC_FIXER                                           # それ以外 → spec-fixer

# test-materialize（不変）
TEST_MATERIALIZE success → IMPLEMENTER
TEST_MATERIALIZE error   → escalate

# spec-fixer approved
SPEC_FIXER approved → IMPLEMENTER       when specFixerForwardsToImplementer  # 免除観察 pass（不変）
SPEC_FIXER approved → TEST_MATERIALIZE  when specFixerObservationForward     # 観察 pass 下流継続（旧: TEST_CASE_GEN）
SPEC_FIXER approved → TEST_CASE_GEN     when specFixerNeedsFixForward        # needs-fix 後は TC 常時再生成
SPEC_FIXER approved → SPEC_REVIEW                                            # conformance 再検証 fallback（不変）
SPEC_FIXER error    → escalate
```

行数: 現行ブロック 14 行 → 新ブロック 17 行（+3）。STANDARD_TRANSITIONS.length は **49 → 52**。

- 通常 type: `design → test-case-gen → spec-review → (approved) → test-materialize → implementer`。
- 免除 type: `design → spec-review → (approved) → implementer`（TC / test-materialize を通らない、不変）。
- needs-fix ループ: `spec-review(needs-fix) → spec-fixer → test-case-gen → spec-review`（要件 1）。
  spec/design 修正後は TC を**常時**再生成してから再レビュー。判断で分岐させない。
- 観察 pass: `spec-review(approved+routable) → spec-fixer → test-materialize`。TC 再生成なし・再レビューなし
  （approve は stop gate、観察は非ブロッキング指摘のみ、という現行意味論の維持）。

**Rationale**: テストケース設計まで含めて「設計」と見なし、spec-review を設計フェーズ全体の出口に
位置付ける（architect 評価済）。観察 pass の下流は「TC 生成」から「test-materialize」へ移るだけで、
「再レビューせず下流継続」という役割は不変。

**Alternatives considered**:

- TC 専用レビュー step の新設 → 却下（step 追加はトークンコスト、spec-review の照合拡張で足りる）。
- 観察 pass の意味論を TC 位置変更に合わせて変える → 却下（stop gate 規律を崩す）。

### D2: spec-fixer forward guard の再編（観察 / needs-fix の分岐を明示）

現行 `specFixerForwardsToTestGen`（`spec-observation.ts`）は「観察 pass 検出」= not conformance-triggered
AND 最新 spec-review verdict === approved。新モデルでは観察 pass の forward 先が test-case-gen から
test-materialize に変わるため、名前を目的中立にリネームし、needs-fix 用の guard を追加する。

| guard | 定義 | forward 先 |
|-------|------|-----------|
| `specFixerObservationForward`（旧 `specFixerForwardsToTestGen` を改名） | not conformance-triggered AND 最新 spec-review === approved | TEST_MATERIALIZE（非免除）|
| `specFixerForwardsToImplementer`（不変, `test-gen-exemption.ts`）| `specFixerObservationForward` AND `isTestGenExempt` | IMPLEMENTER |
| `specFixerNeedsFixForward`（新規）| not conformance-triggered AND 最新 spec-review === needs-fix | TEST_CASE_GEN |
| （無 guard fallback）| conformance-triggered（`getConformanceFixContext` 非 null）| SPEC_REVIEW |

観察・needs-fix・conformance の 3 経路は相互排他（最新 spec-review verdict と conformance context で決定）。
conformance-triggered は 3 guard すべてが false → SPEC_REVIEW fallback に落ちる。既存の
`getConformanceFixContext` の recency/timestamp 不変（inclusive `>=` + toolResult.findings 必須）に依存する。

**Rationale**: 名前が挙動を偽らないようにする（`specFixerForwardsToTestGen` は新モデルでは test-materialize
へ forward するため嘘になる）。conformance-triggered の除外ロジックは既存 helper を再利用し新 seam を作らない。

**Alternatives considered**: 名前を据え置いて target だけ変える → 却下（3am デバッグの罠になる misleading name）。

### D3: TC finding routing — FixTarget に `test-case-gen` を追加し、spec-review 承認前のみ routable にする

spec-review が test-cases.md に出す fixable finding を「解消可能（needs-fix）」にするため、
canon 判定に test-case-gen を fixer として登録する。ただし **spec-review 経路のみ**に効かせ、
承認後（conformance / code-review / regression-gate）経路には効かせない。

変更点:

1. `src/kernel/report-result.ts`: `FixTarget` union に `"test-case-gen"` を追加（additive）。
   conformance の report tool schema（`report-tool.ts` の 3 literal enum）は**変更しない** — conformance は
   test-case-gen を fixTarget として emit しないため。`aggregateFixTarget` の優先順位も不変。
2. `src/core/step/canon-write-scope.ts`: `writableByFixer` に
   `["test-case-gen", {<folder>/test-cases.md}]` を追加。他の fixer のエントリは不変。
3. `src/core/step/canon-escalation.ts`: 新しい resolver
   `testCaseGenEffectiveFixer: (f) => "test-case-gen"` を追加（export）。
   既存 `specReviewEffectiveFixer`（`() => "spec-fixer"`）は**変更しない**。
4. `src/core/step/judge-verdict.ts` `deriveSpecReviewVerdict` を次の優先順に更新（canonScope 有時）:

   ```
   1. ok=false → escalation
   2. evidence.checked === 0 → escalation
   3. decision-needed ≥ 1 → escalation
   4. canonScope 有:
      tc   = selectRoutableCanonFindings(findings, scope, testCaseGenEffectiveFixer)   # test-cases.md
      spec = selectRoutableCanonFindings(findings, scope, specReviewEffectiveFixer)     # spec/design/tasks
      unroutable = (fixable ∩ canonPaths) − tc − spec                                   # request.md / attestation
      4a. unroutable ≥ 1        → escalation           # 承認前でも request.md/attestation は operator-only
      4b. tc ≥ 1                → needs-fix             # TC は severity 問わず常時 needs-fix（再生成）
      4c. spec に critical|high → needs-fix             # 従来 4b。low/medium は観察 pass へ fall-through
   5. 非 canon critical|high ≥ 1 → needs-fix
   6. else → approved
   ```

   4a を 4b の前に置くことで、request.md（真の unroutable）と TC finding が共存した場合でも
   escalation が優先される（operator が request.md を直すまで止める既存意味論を保つ）。

5. **承認後の保護は無変更で維持される**（重要な自然帰結）:
   - `deriveConformanceVerdict` は `conformanceEffectiveFixer`（fixTarget ?? implementer）を使う。
     test-cases.md finding（fixTarget なし）→ implementer → implementer は test-cases.md を書けない →
     unroutable → escalation。**変更なし**。
   - `deriveJudgeVerdict` / `deriveRegressionGateVerdict` は `judgeEffectiveFixer`（常に code-fixer）を使う。
     test-cases.md → code-fixer(∅) → unroutable → escalation。**変更なし**。
   - test-case-gen は spec-review（design phase, 承認前）でのみ effective fixer になる。承認後に走る
     どの reviewer も test-cases.md を test-case-gen へ routable にしない。「承認前 = 設計成果物 /
     承認後 = 凍結 canon」の区別が**どの step が finding を出したか**で自然に表現される。
   - write-scope commit 保護（`protectedCanonPaths` に test-cases.md、test-case-gen のみが writes() 宣言）は
     **無変更**。test-case-gen の再生成は宣言済みなので合法に書ける。他 step は依然として書けない。

**Rationale**: TC を裁く場（spec-review）を作る以上、直す手（test-case-gen 再生成）も機械経路で持つ
（architect 評価済）。escalation 量産を避ける。承認前/後の分岐を「別フラグ」ではなく「finding を出した
step の effective fixer」で表現するため、承認後保護に追加コードが要らない。

**Alternatives considered**:

- `specReviewEffectiveFixer` を path-aware（test-cases.md → test-case-gen）に改造 → 却下寄り。
  leaf module にファイル名リテラル判定が増え、4c が TC を二重計上する。dedicated resolver + scope 直接参照の方が明快。
- test-cases.md finding を spec-fixer に書かせる → 却下（生成物の修正手段は生成者。要件 4 で spec-fixer は
  test-cases.md を書かない）。

### D4: needs-fix 分岐 guard `specReviewNeedsFixIsTcOnly`（TC のみは spec-fixer を経由しない）

`spec-observation.ts` に追加する pure predicate:

```
specReviewNeedsFixIsTcOnly(state):
  findings = getLatestJudgeFindings(state, SPEC_REVIEW); if empty → false
  scope    = buildCanonWriteScopeFromState(state)
  tc       = selectRoutableCanonFindings(findings, scope, testCaseGenEffectiveFixer)
  if tc.length === 0 → false                                    # TC finding が無ければ TC-only ではない
  spec     = selectRoutableCanonFindings(findings, scope, specReviewEffectiveFixer)
  nonCanon = findings.filter(critical|high AND file ∉ canonPaths)
  return spec.length === 0 && nonCanon.length === 0             # spec-fixer の仕事が無い ⇔ TC-only
```

routing:

- TC-only（true）: `spec-review needs-fix → test-case-gen`（spec-fixer をスキップ）→ 再生成 → spec-review。
- 混在/spec のみ（false）: `spec-review needs-fix → spec-fixer` → (D2) → test-case-gen → spec-review。

needs-fix 状態では unroutable finding は存在しない（存在すれば D3-4a で escalation になり needs-fix に
ならない）ため、この guard が見るのは TC / spec-fixer / 非 canon findings のみ。

**Rationale**: 要件 5「TC への finding のみは spec-fixer を経由せず test-case-gen 再生成に直接入る」を、
既存の finding 分類（canon scope）で判定する。判断を agent に委ねない（決定的 predicate）。

**Alternatives considered**: spec-review に verdict suffix（`needs-fix:test-case-gen` 等）を導入 → 却下
（scope が verdict 種別変更を禁止。observation pass と同じ「finding を見る guard」パターンで足りる）。

### D5: 再生成時に TC finding を test-case-gen へ渡す

`src/core/step/test-case-gen.ts` `buildMessage` を、spec-fixer の findings 注入パターンに倣って拡張する:

- `getLatestJudgeFindings(state, SPEC_REVIEW)` を読み、test-cases.md（`buildCanonWriteScopeFromState` の
  test-case-gen writable set に属す）への finding があれば、`buildFindingsBlock` で本文に埋め込み
  「これらを解消するよう再生成せよ」と指示する。
- 初回生成（spec-review 未実行）は従来どおり findings 無しの生成メッセージ。
- findings は state から取得するため reads() 変更は不要（`writes()` は要件 4 のとおり {test-cases.md} 維持）。

**Rationale**: 混在ケース（spec-fixer 修正後の再生成）と TC-only ケース（直接再生成）の双方で、
spec-review が指摘した TC 問題を再生成入力として渡し解消経路に乗せる（要件 5）。

**Alternatives considered**: spec-review result file を reads() に条件付き追加して agent に読ませる → 却下
（findings は state に既にある。ファイル読取を強制すると初回生成で存在せず STEP_INPUT_MISSING）。

### D6: spec-review の照合拡張（入力に test-cases.md、照合観点 3 点）

- `src/core/step/spec-review.ts` reads(): `isTestGenRequired(state.request.type)`（`config/type-config.js`）
  が真のとき `<folder>/test-cases.md` を追加する。免除 type では test-cases.md が存在しない
  （design → spec-review 直行）ため条件付き。既存入力（request/spec/design/tasks）は不変。
- `src/prompts/spec-review-system.ts`: Contract の入力に test-cases.md を追記し、Method に照合観点を追加:
  - (a) TC が spec の Scenario / Requirement を過不足なく検証しているか
  - (b) tasks と TC の間に実装計画の穴がないか
  - (c) **TC が実装の API・内部構造・assertion の形式に踏み込んでいないか**（振る舞いレベルからの逸脱検査）
  - initial message の「Review all spec files（request/design/tasks/spec）」に test-cases.md を追記。

**Rationale**: 抽象度の歯は生成側 prompt だけでは後退する（自己申告）。照合側に踏み込み検査を置くことで
構造的に検出する（architect 評価済）。免除 type は TC を持たないため条件付き read で STEP_INPUT_MISSING を回避。

**Alternatives considered**: test-cases.md を無条件 `required: false` で read → 却下（非免除でも存在検証が
効かず、TC を入力として保証できない。条件付き `required: true` の方が契約が強い）。

### D7: test-case-gen の振る舞いレベル化と責務固定（prompt のみ）

`src/prompts/test-case-gen-system.ts` に追加:

- **抽象度**: TC は「何を確認できればよいか」を記述する。特定の関数呼び出し手順・内部状態の具体値・
  assertion の形式を GIVEN/WHEN/THEN に書かない。検証手段の選択は実装側の裁量。
- **責務固定**: tasks.md を編集しない（writes 宣言 {test-cases.md} 維持）。tasks と TC の不整合に気づいたら
  test-cases.md 内の申し送り注記として記録し、判定は spec-review に委ねる。
- pipeline 位置コメントを `design → test-case-gen → spec-review` に更新（`test-case-gen.ts` の doc も同様）。

**Rationale**: 要件 3・4。生成側の指示と照合側（D6-c）の歯を組で入れる。

**Alternatives considered**: 抽象度チェックを test-case-gen だけに入れる → 却下（生成側の自己申告は後退する。
歯は照合側 D6-c に置く）。

## Risks / Trade-offs

- [needs-fix ループが test-case-gen を毎回再走させる] → 走行回数増（token コスト）。
  Mitigation: 要件・architect 判断のとおり test-case-gen は軽量工程で、常時再生成のコストは
  「再生成要否を agent に判断させる不確実性」より安い。spec-review loop 予算は spec-review の run 数で
  数えるため、間に test-case-gen を挟んでも予算計上は不変（test-case-gen は loop step でない）。

- [FixTarget union 拡張が exhaustiveness を壊す] → conformance schema・aggregateFixTarget は既存 3 値のみ
  参照するため無変更。追加は additive。Mitigation: typecheck で全参照を検証（受け入れ基準）。

- [免除 type で test-cases.md 不在のまま spec-review が読む] → STEP_INPUT_MISSING で halt する恐れ。
  Mitigation: D6 の条件付き reads()（`isTestGenRequired` 偽なら test-cases.md を宣言しない）。

- [承認後 protection の後退] → もし test-case-gen を全 effective fixer で routable にすると承認後も
  operator 保護が外れる。Mitigation: D3-5 のとおり `specReviewEffectiveFixer` のみ据え置き、承認後 reviewer の
  resolver は無変更。受け入れ基準で「承認後 test-cases.md finding は operator 経路」をテスト固定。

- [conformance 再検証経路の破損] → 遷移組み替えで spec-fixer→spec-review fallback が壊れると再検証が回らない。
  Mitigation: D2 の guard は conformance-triggered を除外し fallback に落とす。conformance-routing の
  既存フローテストを再検証（下記 pin 一覧）。

## Migration Plan

段階不要（単一 commit で遷移表・guard・verdict・prompt・test を同時更新）。ロールバックは revert で足りる。
in-flight job（旧遷移表で awaiting-resume 中）は resume 時に新遷移表で継続するが、spec phase は
巻き戻り可能な設計成果物段階のため実害なし。

## 遷移表 pin テスト — 更新対象の全列挙（受け入れ基準）

first-match-wins のため下記 assertion が変わる。**列挙外の既存テストは無変更で green** を維持する。

### 更新必須（assertion が変わる）

1. `tests/unit/core/pipeline/pipeline.transitions.test.ts`
   - TC-012 `requiredEdges`: `spec-review approved → test-case-gen` を `→ test-materialize` に、
     `test-case-gen success → test-materialize` を `→ spec-review` に。`design success → test-case-gen` を追加。
   - TC-030 length: `49 → 52`（コメントも更新）。
   - 根拠: 通常経路の主エッジが D1 で組み替わる。
2. `tests/unit/pipeline/transition-when.test.ts`
   - TC-WHEN-02 length: `49 → 52`（コメント更新）。
   - 根拠: 行数 +3。
3. `tests/unit/core/pipeline/spec-observation-autofix.test.ts`
   - TC-007（approved → test-case-gen）→ approved → test-materialize。
   - TC-008（観察 spec-fixer → test-case-gen）→ → test-materialize、guard 名 `specFixerObservationForward`。
   - TC-009 / TC-027（needs-fix spec-fixer → spec-review）→ needs-fix spec-fixer → test-case-gen（再構成）。
   - TC-010（conformance-triggered spec-fixer → spec-review）→ fallback で維持、guard 名整合を確認。
   - TC-013（flow: spec-review 1 回 / spec-fixer 1 回 → test-case-gen）→ 新順序（test-case-gen が spec-review の
     前後に入る）に再構成。
   - TC-026（`specFixerForwardsToTestGen` false when no runs）→ `specFixerObservationForward` に改名追随。
   - TC-029 length: `49 → 52`。
   - `makeCanonScope()` に `["test-case-gen", {test-cases.md}]` を追加。
   - 根拠: この file が観察 pass / canon routing の主 pin。D1〜D4 の中核。
4. `src/core/pipeline/__tests__/test-gen-exemption.test.ts`
   - TC-007（非免除 spec-review approved → test-case-gen）→ → test-materialize（4 type）。
   - TC-012（免除 row が unconditional spec-review→test-case-gen に先行）→ unconditional 先が test-materialize に。
     加えて `design success [isTestGenExempt]→spec-review` が `design success→test-case-gen` に先行する assertion を追加。
   - 根拠: 免除 bypass の位置は不変だが、非免除の下流先が変わる。
5. `tests/test-case-gen-step.test.ts`
   - TC-004（spec-review approved → test-case-gen 存在）→ `design success → test-case-gen 存在` +
     `design success [exempt] → spec-review 存在` に置換。
   - TC-005（test-case-gen success → test-materialize）→ `→ spec-review`。`→ implementer 不在` は維持。
   - 根拠: test-case-gen の入出力エッジが D1 で変わる。
6. `tests/core/pipeline/pipeline.test.ts`
   - TC-067: `spec-review approved → test-case-gen`（585 行）→ test-materialize、
     `test-case-gen success → test-materialize`（597 行）→ spec-review、
     spec-fixer 行の意味（観察→test-materialize / needs-fix→test-case-gen）に整合。
   - 根拠: spec-layer transition の網羅 pin。
7. `tests/unit/step/test-materialize-boundary.test.ts`
   - TC-TMB-18（test-materialize を指すのは test-case-gen:success のみ・1 本）→ 新 entry
     （spec-review approved / spec-fixer 観察 pass）に合わせて invariant を書き換える。
   - 根拠: test-materialize の入口が test-case-gen から spec-review 側へ移る。
8. `tests/unit/core/step/canon-write-scope.test.ts`
   - drift-guard（TC-029）に test-case-gen ケース（`writes() ∩ canonPaths = {test-cases.md}`）を追加。
     既存 TC-017/018/019 は additive のため無変更で green。
   - 根拠: D3-2 の writableByFixer 追加を drift で守る。

### 再検証必須（フロー変化で fixture / count がずれ得る）

9. `tests/pipeline-integration.test.ts` — TC-010（8 session, 順序変化・集合不変 → count 維持見込み）、
   TC-011（spec-review 2 / spec-fixer 1 は維持、test-case-gen は 2 回になるが未 assert）、
   TC-012（`sessionIds` 配列の並び — test-case-gen 追加で misalign し得る）。
10. `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts` — TC-CONFRT-07
    （spec-fixer#3 は spec-review に戻る：conformance-triggered guard で維持。needs-fix ループに
    test-case-gen が挿入されるため run 数を再確認）。
11. `src/core/pipeline/__tests__/bite-evidence-pipeline.test.ts` — spec phase を通るフローテスト、再確認。

### 無変更で green を維持（列挙外・回帰確認）

- `tests/unit/step/spec-review-reads.test.ts`（spec-change type。test-cases.md 追加は additive、既存 assert 維持）。
- `tests/unit/core/pipeline/fast-descriptor.test.ts` / `pipeline-roles.test.ts`（FAST / roles 不変）。
- spec-observation-autofix TC-015 / test-gen-exemption TC-016（FAST に test-case-gen なし、不変）。

### 新規追加テスト（受け入れ基準の直接固定）

- 通常経路 `design → test-case-gen → spec-review → test-materialize` を固定。
- needs-fix ループ `spec-fixer → test-case-gen → spec-review` を固定。
- 観察 pass 後に spec-review が再実行されないこと（stop gate）を固定。
- 免除 type `design → spec-review 直行`・test-case-gen を通らないことを固定。
- spec-review reads() が test-cases.md を含む（非免除）/ 含まない（免除）ことを固定。
- spec-review prompt に TC↔spec / TC↔tasks / TC 抽象度の照合観点が含まれることを固定。
- test-case-gen prompt に振る舞いレベル指示（実装構造へ踏み込まない）が含まれることを固定。
- `deriveSpecReviewVerdict`(test-cases.md fixable finding) === needs-fix（escalation でない）を固定。
- TC-only needs-fix → test-case-gen（spec-fixer をスキップ）/ 混在 → spec-fixer を固定。
- `deriveConformanceVerdict` / `deriveJudgeVerdict`(test-cases.md fixable) === escalation（承認後保護）を固定。
- test-case-gen buildMessage が再生成時に spec-review の TC finding を注入することを固定。

## Open Questions

なし（設計判断は architect 評価済 4 点で確定。routing の具体形は D3/D4 で確定）。
