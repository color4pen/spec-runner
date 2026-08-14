# ADR: test-case-gen を spec-review の前に移動し TC を設計フェーズの出口で照合する

**Date**: 2026-08-15
**Status**: accepted

## Context

従来の spec phase 遷移は `design → spec-review → test-case-gen → test-materialize` で、
test-cases.md は spec-review 承認後に生成される。test-cases.md は実装・検証・整合確認を拘束する
canon 成果物でありながら、どのレビューの照合対象にもならないまま確定していた。

実害として、設計文書だけの承認を通過した TC が実装前に決めきれない詳細（API 呼び出し手順・内部状態）
まで GIVEN/WHEN/THEN に書き込み、正しい実装と矛盾する事例が発生した（`agent-inactivity-timeout`
change: TC の GIVEN「bump() を一切呼ばない」が実装上成立せず、operator が canon 側を修正）。
TC の解像度が実装の形に踏み込むと、不整合が canon の権威側に残る。

また spec-review が TC を見ない設計では、TC の抽象度逸脱（振る舞いでなく実装手順を記述する後退）を
構造的に検出する手段がなく、生成側 prompt の指示だけでは後退を防げない。

さらに、spec-review が test-cases.md に対して fixable finding を出せる設計にした場合、
従来の canon routing（test-cases.md への finding は operator-only）のままでは
TC レビュー導入が escalation の量産装置になる問題があった。

## Decision

以下 7 つの判断を連携させて実現する。

### D1: 遷移の組み替え（通常経路を design → test-case-gen → spec-review → test-materialize に変更）

STANDARD_TRANSITIONS の design/spec-review/test-case-gen/spec-fixer ブロックを次に置き換える
（first-match-wins。guarded row が unconditional row に先行する）:

```
# design
DESIGN success  → SPEC_REVIEW      when isTestGenExempt   # 免除 type は TC を通らず直行（不変）
DESIGN success  → TEST_CASE_GEN                           # 通常 type は先に TC 生成

# test-case-gen（design phase 内、spec-review の前）
TEST_CASE_GEN success → SPEC_REVIEW

# spec-review approved
SPEC_REVIEW approved → SPEC_FIXER       when specReviewHasRoutableFixables   # 観察 pass（不変）
SPEC_REVIEW approved → IMPLEMENTER      when isTestGenExempt                 # 免除 bypass（不変）
SPEC_REVIEW approved → TEST_MATERIALIZE                                      # 下流（旧: TEST_CASE_GEN）

# spec-review needs-fix
SPEC_REVIEW needs-fix → TEST_CASE_GEN   when specReviewNeedsFixIsTcOnly      # TC のみ → 再生成直行
SPEC_REVIEW needs-fix → SPEC_FIXER                                           # それ以外 → spec-fixer

# spec-fixer approved
SPEC_FIXER approved → IMPLEMENTER       when specFixerForwardsToImplementer  # 免除観察 pass（不変）
SPEC_FIXER approved → TEST_MATERIALIZE  when specFixerObservationForward     # 観察 pass 下流継続（旧: TEST_CASE_GEN）
SPEC_FIXER approved → TEST_CASE_GEN     when specFixerNeedsFixForward        # needs-fix 後は TC 常時再生成
SPEC_FIXER approved → SPEC_REVIEW                                            # conformance 再検証 fallback（不変）
```

通常 type: `design → test-case-gen → spec-review → test-materialize → implementer`。
免除 type: `design → spec-review → implementer`（TC / test-materialize を通らない、不変）。
needs-fix ループ: `spec-review(needs-fix) → spec-fixer → test-case-gen → spec-review`。
観察 pass: `spec-review(approved+routable) → spec-fixer → test-materialize`（TC 再生成なし・再レビューなし）。

**採用理由**: テストケース設計まで含めて「設計」と見なし、spec-review を設計フェーズ全体の出口に位置付ける。
TC が下流を拘束する成果物である以上、レビューを経ずに canon 化するのは設計成果物の扱いとして一貫しない。

**却下案**: TC 専用レビュー step の新設 → step 追加はトークンコスト、spec-review の照合拡張で足りる。

### D2: spec-fixer forward guard の再編（観察 / needs-fix / conformance の 3 経路を明示）

旧 `specFixerForwardsToTestGen`（観察 pass 検出 guard）は新モデルで test-materialize へ forward するため
名前が実態と乖離する。名前を目的中立にリネームし、needs-fix 用 guard を追加する。

| guard | 定義 | forward 先 |
|-------|------|------------|
| `specFixerObservationForward`（旧 `specFixerForwardsToTestGen` を改名） | not conformance-triggered AND 最新 spec-review === approved | TEST_MATERIALIZE |
| `specFixerForwardsToImplementer`（不変） | `specFixerObservationForward` AND `isTestGenExempt` | IMPLEMENTER |
| `specFixerNeedsFixForward`（新規） | not conformance-triggered AND 最新 spec-review === needs-fix | TEST_CASE_GEN |
| （無 guard fallback） | conformance-triggered | SPEC_REVIEW |

3 経路は最新 spec-review verdict と conformance context で相互排他的に決定する。

**採用理由**: 名前が挙動を偽らないようにする。`specFixerForwardsToTestGen` は新モデルで test-materialize へ
forward するため 3am デバッグの罠になる。

**却下案**: 名前を据え置いて target だけ変える → misleading name。

### D3: FixTarget に `test-case-gen` を追加し spec-review 承認前のみ routable にする

spec-review が test-cases.md に出す fixable finding を needs-fix（再生成）で解消するため、
`FixTarget` union に `"test-case-gen"` を追加し canon judgment に登録する。

変更点:
1. `src/kernel/report-result.ts`: `FixTarget` union に `"test-case-gen"` を追加（additive）。
   conformance の report tool schema は変更しない（conformance は test-case-gen を fixTarget として emit しない）。
2. `src/core/step/canon-write-scope.ts`: `writableByFixer` に
   `["test-case-gen", {<folder>/test-cases.md}]` を追加。
3. `src/core/step/canon-escalation.ts`: `testCaseGenEffectiveFixer: (f) => "test-case-gen"` を追加。
   既存 `specReviewEffectiveFixer` は変更しない。
4. `src/core/step/judge-verdict.ts` `deriveSpecReviewVerdict` の優先順を更新:

   ```
   1. ok=false → escalation
   2. evidence.checked === 0 → escalation
   3. decision-needed ≥ 1 → escalation
   4. canonScope 有:
      tc   = selectRoutableCanonFindings(findings, scope, testCaseGenEffectiveFixer)
      spec = selectRoutableCanonFindings(findings, scope, specReviewEffectiveFixer)
      unroutable = (fixable ∩ canonPaths) − tc − spec    # request.md / attestation
      4a. unroutable ≥ 1        → escalation  # request.md/attestation は承認前でも operator-only
      4b. tc ≥ 1                → needs-fix   # TC finding は severity 問わず常時再生成
      4c. spec に critical|high → needs-fix
   5. 非 canon critical|high ≥ 1 → needs-fix
   6. else → approved
   ```

**承認後の保護は自然帰結として維持される**:
- `deriveConformanceVerdict` は `conformanceEffectiveFixer`（implementer）を使う。test-cases.md finding →
  implementer は test-cases.md を書けない → unroutable → escalation。**変更なし**。
- `deriveJudgeVerdict` / `deriveRegressionGateVerdict` は `judgeEffectiveFixer`（code-fixer）を使う。
  code-fixer は test-cases.md を書かない → unroutable → escalation。**変更なし**。
- test-case-gen は spec-review（design phase、承認前）でのみ effective fixer になる。
  承認後に走るどの reviewer も test-cases.md を test-case-gen へ routable にしない。
  「承認前 = 設計成果物 / 承認後 = 凍結 canon」の区別が**どの step が finding を出したか**で自然に表現される。

**採用理由**: TC を裁く場（spec-review）を作る以上、直す手（test-case-gen 再生成）も機械経路で持つ。
test-cases.md への finding を operator-only のまま残すと TC レビュー導入が escalation の量産装置になる。
生成物（test-cases.md）の修正手段は生成者（test-case-gen）の再生成であり、fixer に書かせる必要はない。

**却下案 A**: `specReviewEffectiveFixer` を path-aware に改造（test-cases.md → test-case-gen）→
leaf module にファイル名リテラル判定が増え、TC finding と spec finding が二重計上される。
**却下案 B**: test-cases.md finding を spec-fixer に書かせる →
生成物の修正は生成者が行う原則に反する。spec-fixer は test-cases.md を書かない。

### D4: TC-only needs-fix guard `specReviewNeedsFixIsTcOnly`（TC のみは spec-fixer を経由しない）

spec-review needs-fix が TC finding のみの場合、spec-fixer をスキップして test-case-gen に直行する。

```
specReviewNeedsFixIsTcOnly(state):
  findings = getLatestJudgeFindings(state, SPEC_REVIEW); if empty → false
  scope    = buildCanonWriteScopeFromState(state)
  tc       = selectRoutableCanonFindings(findings, scope, testCaseGenEffectiveFixer)
  if tc.length === 0 → false
  spec     = selectRoutableCanonFindings(findings, scope, specReviewEffectiveFixer)
  nonCanon = findings.filter(critical|high AND file ∉ canonPaths)
  return spec.length === 0 && nonCanon.length === 0
```

routing:
- TC-only (true): `spec-review needs-fix → test-case-gen` → 再生成 → spec-review。
- 混在/spec のみ (false): `spec-review needs-fix → spec-fixer` → (D2) → test-case-gen → spec-review。

needs-fix 状態では unroutable finding は存在しない（存在すれば D3-4a で escalation になる）ため、
guard が見るのは TC / spec-fixer / 非 canon findings のみ。

**採用理由**: 要件「TC への finding のみは spec-fixer を経由せず test-case-gen 再生成に直接入る」を、
既存の finding 分類（canon scope）で判定する。判断を agent に委ねない（決定的 predicate）。

**却下案**: spec-review に verdict suffix（`needs-fix:test-case-gen` 等）を導入 →
scope が verdict 種別変更を禁止。observation pass と同じ「finding を見る guard」パターンで足りる。

### D5: TC 再生成は常時・判断で分岐させない

spec-fixer の修正後に TC 再生成が必要かを走行中に判定させない。常時再生成する。

**採用理由**: spec-fixer の修正が TC に影響するかを agent が判断する場面を作ると不確実性が増す。
test-case-gen は軽量工程であり、常時再生成のコストは判断の不確実性より安い。
spec-review loop 予算は spec-review の run 数で数えるため、間に test-case-gen を挟んでも予算計上は不変。

### D6: spec-review の照合拡張（入力に test-cases.md、照合観点 3 点）

- `src/core/step/spec-review.ts` reads(): `isTestGenRequired(state.request.type)` が真のとき
  `<folder>/test-cases.md` を追加（条件付き `required: true`）。免除 type では test-cases.md が存在しないため条件付き。
- `src/prompts/spec-review-system.ts`: 照合観点を追加:
  - (a) TC が spec の Scenario / Requirement を過不足なく検証しているか
  - (b) tasks と TC の間に実装計画の穴がないか
  - (c) TC が実装の API・内部構造・assertion の形式に踏み込んでいないか（振る舞いレベルからの逸脱検査）

**採用理由**: 抽象度の歯は生成側 prompt だけでは後退する（自己申告）。照合側に踏み込み検査を置くことで
構造的に検出する。免除 type は TC を持たないため条件付き read で STEP_INPUT_MISSING を回避。

**却下案**: test-cases.md を無条件 `required: false` で read →
非免除でも存在検証が効かず TC 入力を保証できない。

### D7: test-case-gen の振る舞いレベル化と責務固定（prompt のみ）

`src/prompts/test-case-gen-system.ts` に追加:
- TC は「何を確認できればよいか」を記述し、特定の関数呼び出し手順・内部状態の具体値・assertion 形式を
  GIVEN/WHEN/THEN に書かない。検証手段の選択は実装側の裁量。
- tasks.md を編集しない（writes 宣言 {test-cases.md} 維持）。tasks と TC の不整合に気づいたら
  test-cases.md 内の申し送り注記として記録し、判定は spec-review に委ねる。

**採用理由**: D6-c の照合歯と組で入れる。生成側の指示だけでは後退するため照合側の歯が必要。

## Alternatives Considered

### A1: TC 専用レビュー step を新設する

test-cases.md を専用の reviewer step（例: `TC_REVIEW`）に照合させ、spec-review とは独立したループを持たせる案。

- **Pros**: spec-review の責務を増やさない。TC 専用の verdict 種別・ループ上限を持てる
- **Cons**: step の追加はトークンコスト（実行コスト・状態管理）の増大を招く。spec-review は spec / tasks / TC の三者を同時に見ることで「TC が spec の Scenario を過不足なく検証しているか」を判定できる。TC を別 step に分離すると spec と TC の相互参照が困難になる
- **Why not**: spec-review の照合拡張（入力に test-cases.md を追加）で同じ検査が達成できる。step 追加は YAGNI。request.md 「architect 評価済み」で明示的に却下。

### A3: 観察 pass の意味論を TC 位置変更に合わせて変える

approved 後の再レビュー禁止（stop gate）規律を緩め、観察 pass 後にも TC 再生成・再レビューを行う案。

- **Pros**: TC を常に最新 spec 状態と整合させられる
- **Cons**: stop gate 規律を崩す。非ブロッキング指摘によるループを防ぐ既存の設計意図を破壊する。
  観察修正は「spec の意味を変えない」という前提（非ブロッキングの定義）のため TC 再生成も不要。
- **Why not**: 既存の stop gate 規律を維持することが priority。観察修正は TC に影響しない。

### A4: TC finding を spec-fixer に書かせる

spec-fixer の writableByFixer に test-cases.md を追加し、spec-fixer が TC も修正する案。

- **Pros**: 経路が単純。新 FixTarget を追加しない
- **Cons**: 生成物（test-cases.md）の修正手段は生成者（test-case-gen）の再生成であるべき。
  spec-fixer に TC 生成の responsibility を持たせることは責務境界の混乱を招く。
  test-case-gen の writes() 宣言と矛盾する。
- **Why not**: 生成物の修正は生成者経由。要件でも spec-fixer は test-cases.md を書かないと明示。

### A5: 承認前/後の区別を専用フラグで表現する

pipeline state にフラグ（`tcApproved: boolean`）を追加し、各 verdict 関数が参照する案。

- **Pros**: 「承認前 = mutable / 承認後 = frozen」が明示的
- **Cons**: state にフラグを追加すると「どの step がフラグを立てるか」の管理が必要になる。
  本 ADR の設計では承認前/後の区別を「finding を出した step の effective fixer」で自然に表現でき、
  承認後保護に追加コードが要らない（D3 参照）。
- **Why not**: 「どの step が finding を出したか」という既存の構造で分岐が完全に表現できる。余分な state 不要。

## Consequences

### Positive

- test-cases.md が設計フェーズの出口（spec-review）で照合されるため、TC が spec を正しく反映しているか
  およびTCの抽象度逸脱が構造的に検出される。
- TC への fixable finding が機械経路（test-case-gen 再生成）で解消できるため、TC レビュー導入が
  escalation の量産装置にならない。
- spec/design の修正後は TC が常時再生成されるため、needs-fix ループ後に TC と spec の不整合が残らない。
- 「承認前 = 設計成果物 / 承認後 = 凍結 canon」の区別が追加フラグなしで、
  finding を出した step の effective fixer 設定のみで実現される。

### Negative

- 通常 type の spec phase で test-case-gen が spec-review の前後に入るため、
  needs-fix ループ時の test-case-gen 実行回数が増加する（token コスト増）。
- STANDARD_TRANSITIONS が 49 行 → 52 行に増加する。

### Known Debt

- **test-case-gen の抽象度指示が後退した場合の検出速度**: spec-review が照合するため構造的には検出されるが、
  TC 生成 → spec-review 照合のサイクルが 1 回分必要。リアルタイム検出ではない。
- **spec-review loop 予算と test-case-gen 実行回数の分離**: 現状は spec-review の run 数で予算を数えるため
  test-case-gen の増加分は予算外。将来 TC 生成が高コスト化する場合は独立予算の検討が必要。

## References

- Request: `specrunner/changes/test-case-gen-design-phase/request.md`
- Design: `specrunner/changes/test-case-gen-design-phase/design.md`
- Related: `specrunner/adr/2026-05-26-observation-auto-fix-pipeline.md`（観察 pass / stop gate の確立）
- Related: `specrunner/adr/2026-04-29-spec-fixer-iteration-loop.md`（pipeline loop primitive）
- Related: `specrunner/adr/2026-06-02-test-case-gen-scenario-primary-source.md`（test-case-gen の入力源）
- Related: `specrunner/adr/2026-06-03-conformance-review-acceptance-gate.md`（conformance canonical routing）
- Related: `specrunner/adr/2026-08-13-test-generation-type-gate.md`（免除 type の設計、#987）
