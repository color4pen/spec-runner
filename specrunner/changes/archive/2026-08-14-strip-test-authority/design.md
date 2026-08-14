# Design: テスト証拠と工程順序の分離(第1弾)

## Context

現行 pipeline は「テストが実装より先に書かれた」という**工程順序**を、テストの真実性の証明として扱っている。この昇格は 3 つの機構に分散している:

- **test-materialize** (`src/prompts/test-materialize-system.ts`): 新規テストに「base で red を観測するまで完了不可、green なら書き直して再実行」を命じる (`## Method` 節 + 初回 message)。
- **implementer** (`src/core/step/implementer.ts`): `testsMaterialized`(test-materialize の実行歴の有無)が true のとき「production code only、テスト変更禁止」モードに入る (`buildImplementerInitialMessage` の true 分岐)。
- **bite-evidence** (`src/core/step/bite-evidence/`): base = 最新 test-materialize commit を「実装なし」と暗黙前提に、base-red → candidate-green を判定する (`gate.ts` / `oids.ts`)。

この前提は初回の一直線走行でのみ真であり、implementer 通過後の resume(spec-fixer / test-case-gen / test-materialize からの再走)で破れる。実形状は `implementer-1 → test-materialize-2(= base、実装混入済み)→ implementer-2(= candidate)` となり、Git 上は正常な base → candidate の形をとる。破れた状態で 3 機構が逆向きに作用する:

1. test-materialize が実装済み worktree で新規テストを green 観測 →「見張っていないテスト」と誤認して**正しいテストを fail するよう書き直す**(prompt の明文命令)。
2. implementer が歪んだテストを「変更禁止・pass させろ」と命じられ**正しい実装を壊す**。
3. bite-evidence が実装混入済み base で green→green を検出し、噛んでいるテストを hollow と誤判定して `failed → escalate` で停止する(issue #989、再走 2 巡目で 7 ファイル中 4–5 が偽陰性)。escalation の出口は cancel → 再起票のみで、回復経路(resume / fixer / operator 裁定)を塞ぐ。

本 change は連作の第 1 弾として、**工程順序に由来する権威を撤回する(引き算)**。テスト実行の観測記録(証拠)は残し、red の強制(権威)を消す。

### 現状コードの確認(検証済み)

- `src/prompts/test-materialize-system.ts:93` — expected-red 定義に「green は欠陥（何も見張っていないテスト）」。`:96` — 「fail（red）することを観測してから完了する」。`:98` — 「fail しなかった…書き直してから再実行」「不一致は完了不可」。`:161`(初回 message)— 「confirm they fail (red) as expected」。
- `src/prompts/test-materialize-system.ts:104-113` — Evidence step 固有要求(実行したコマンド・対象テストファイル・観測結果 fail/pass 件数・期待分類)。**本 change 後も維持**。
- `src/core/step/implementer.ts:82-105` — `testsMaterialized` true 分岐が「write production code only, do NOT create or modify test files」を build。lockfile 同期指示(step 5)を含む。
- `src/core/step/bite-evidence/oids.ts:resolveBaseCandidateOids` — base = 最新 test-materialize commitOid、candidate = 最新 implementer commitOid。順序前提の検証なし。**この関数は `src/core/archive/achieved-assurance.ts:222` も利用する(署名変更不可)**。
- `src/core/step/bite-evidence/gate.ts:234-274` — base-green(green→green)は `allVerified=false` → verdict "failed"。`src/core/pipeline/types.ts:260` — `{ BITE_EVIDENCE, on: "failed", to: "escalate" }`。`:259` — `{ BITE_EVIDENCE, on: "strategy-deferred", to: "verification" }`。
- `src/state/schema/types.ts:StepRun` — 各 run は `startedAt` / `endedAt`(ISO 8601、必須)と `commitOid`(任意)を持つ。step 群は順次実行され、timestamp が step 間の全順序キーになる。

## Goals / Non-Goals

**Goals**:

- G1. test-materialize system prompt と初回 message から「red になるまで完了不可 / green なら書き直す」命令を削除する。実行義務と観測記録(コマンド・対象・fail/pass 件数・期待分類)は維持。expected-red が green の場合は「書き直し」でなく「観測事実と理由の記録」に変更。
- G2. implementer の `testsMaterialized` による「production code only / テスト変更禁止」指示を廃止。materialize 済みテスト存在時の指示を「canon(test-cases.md / spec)を正としてテストと実装の両方を整合。テスト変更時は変更点と理由を報告に明示」に変更。
- G3. bite-evidence が「base に過去の implementer commit が混入」を検知した場合、red→green 判定を行わず「baseline 構築不能」を明示した deferral(既存 strategy-deferred の合流先 = verification)を返す。偽 verdict(hollow 誤判定 → escalate)を出さない。
- G4. G1・G2 に伴う既存テストの期待値更新を全列挙し、根拠を明示する(D5)。列挙外の既存テストは無変更で green。

**Non-Goals**(request スコープ外に一致):

- Evidence Base の構築(job 開始時実装 tree + 最終テスト tree の合成)と bite-evidence の baseline 置換。
- candidate の effective HEAD 化(`--adopt-commits` の反映)。
- test-materialize step の implementer への統合・step 削除。
- scenario freeze(SC-XXX + hash による canon 束縛)の変更 — canon への束縛は工程順序への束縛ではないため維持。
- test-case-gen の挙動変更。
- 鏡写しテスト対策(implementer 内の論理フェーズ分離等)。
- 「materialize commit = base」の意味付け自体の削除(bite-evidence が拠り所を失うため、置換先=Evidence Base と同時に後続 request で行う)。
- テスト変更の機械検証(新しい歯)。整合性判定は既存 review 工程(code-review / conformance)の責務のまま。

## Decisions

### D1: 引き算で直す(条件分岐の追加ではなく命令の削除)

test-materialize prompt から red 強制の命令文(`green は欠陥`・`書き直してから再実行`・`不一致は完了不可`)を**削除**する。「再走時のみ red 強制を無効化する」条件分岐は加えない。

- **維持**: `## Method` の新規テスト実行義務、実行方法が agent 裁量である旨、expected-red / expected-green の**分類ラベル**(観測記録の一部)、`## Evidence` の観測記録要求(コマンド・対象・fail/pass 件数・期待分類)。
- **変更**: expected-red が green だった観測時の指示を「書き直す」から「観測事実(green)と考えられる理由(既存実装が要求を満たしている / 分類誤り / 見張れていない疑い等)を Evidence に記録し、判断は下流 review に委ねる」に置換する。
- 初回 message(`buildTestMaterializeInitialMessage`)の「confirm they fail (red) as expected」も同じ権威なので、「新規テストを実行し観測結果を記録してから完了する」に中立化する(root-cause: 権威は 2 箇所に分散しているため両方を消す)。

**Rationale**: green の意味(実装済みで通った / 見張っていない)は工程順序が壊れた状態では原理的に判別できない。判別できない命令(「green なら書き直す」)を条件付きで残すのは、壊れた前提の上に分岐を重ねる対症療法。証拠(実行と観測の記録)と権威(red 強制・テスト不可侵)を分離し、権威側だけを撤回する。

**Alternatives considered**: 再走検知による prompt 切り替え(green の意味を判別できないまま命令だけ残る)→ 却下。

### D2: implementer の指示を「canon 整合」に置換(テスト不可侵の撤回)

`buildImplementerInitialMessage` の `testsMaterialized` **true 分岐だけ**を書き換える。「write production code only, do NOT create or modify test files」を削除し、「test-cases.md と spec を canon(正)としてテストと実装の両方を整合させる。テストを変更した場合は、変更したテストとその理由を完了報告に明示する」に置換する。

- default(TDD)分岐は**無変更**。両分岐は状況が異なる(true = 既にテスト materialize 済み / false = fast pipeline で未 materialize)ため分岐構造は維持し、true 分岐の文面のみ変更する。
- lockfile 同期指示・tasks.md checkbox 更新・end_turn の各手順は true 分岐に**残す**(既存契約 TC-010)。
- 新しい成果物ファイルは増やさない。テスト変更の報告は完了報告(既存の報告手段)に載せる。

**Rationale**: テストの正しさの根拠は canon(test-cases.md)との整合であり、「先に書かれたこと」ではない。整合性の判定は下流 review の責務。

**Alternatives considered**: テスト変更宣言の機械検証を足す → 新しい権威(「テストを触ったら咎める」)になるため却下(request 明示)。

### D3: bite-evidence の前提破れ検知は純関数 + 既存 strategy-deferred の再利用

`src/core/step/bite-evidence/oids.ts` に**新規の純関数**を追加する(既存 `resolveBaseCandidateOids` の署名は変えない — archive floor が共用しているため):

```
detectBaseImplementationContamination(state): string | null
  latest = last(state.steps["test-materialize"])          // = base の run
  latest が無ければ null
  for run in state.steps["implementer"] ?? []:
    if run.commitOid が存在 かつ run.startedAt < latest.startedAt:
      return run.commitOid            // base より前に走った implementer commit = 混入
  return null
```

`gate.ts` の OID 解決直後(step 3、baseOid / candidateOid とも非 null を確認した後、runtime capability check の前)にこの関数を呼び、非 null が返れば早期 return:

```
verdict: "strategy-deferred", records: [],
reason: "baseline unbuildable: implementer commit <oid> predates the base test-materialize commit (implementation mixed into base) — red→green cannot be established"
```

- **検知キー**は「過去の implementer commit が base に混入しているか」= base(最新 test-materialize)の run より前に開始された implementer run が存在するか。pipeline は step を順次 commit するため、base より前に走った implementer commit は必ず base の Git 祖先になる。timestamp(`startedAt`)が step 間の全順序キー。
- 「candidate が base の祖先か」では検知できない(実形状は正常な base → candidate)ため、この向きでは判定しない。
- **verdict は既存の "strategy-deferred" を再利用**する(新 verdict / 新 transition を作らない)。`{ BITE_EVIDENCE, on: "strategy-deferred", to: verification }`(types.ts:259)が合流先 verification への遷移を既に提供する。deferral が silent にならないよう、`reason` で「baseline 構築不能 / base に実装混入」を明示する。
- 前提が保たれた走行(初回一巡: base の run より前に implementer run が無い)では関数が null を返し、判定挙動は**無変更**。base-green による genuine hollow(初回一巡での green→green)は従来どおり `failed` のまま。

**Rationale**: escalate で塞ぐと cancel → 再起票しか出口の無い dead end を再生産する。gate は観測者として「証明できない」事実を記録して通し、判断材料を下流へ渡す。純関数化で unit test 可能、runtime 非依存(managed でも state だけで判定可)。「materialize commit = base」の意味付けは消さず、前提破れ時の誤作動だけを止める(暫定)。

**Alternatives considered**:
- `resolveBaseCandidateOids` に汚染フラグを追加 → archive floor 側の呼び出しに波及するため別関数に分離。
- git ancestry 用の新 port method(`isAncestor`)追加 → 両 runtime + fake 実装と I/O が必要で重い。state の run 順序が pipeline の線形 commit と厳密に一致するため、純関数で十分。
- 新 verdict `deferred-contaminated` + 新 transition 追加 → 合流先は verification で strategy-deferred と同一のため冗長。request は「strategy-deferred と同じ合流先」を要求。

### D4: 検証の歯(runnable check)

- D3 の純関数は state fixture だけで判定できるため、`gate.test.ts` に「再走形状 → strategy-deferred(理由: baseline 構築不能)」「初回一巡 → 判定無変更」の 2 ケースを追加する(D5 参照)。
- D1・D2 の prompt 変更は既存の prompt contract test の期待値反転で固定する(D5)。

### D5: 既存テスト更新の全列挙(R4)

**下表の項目のみ**を更新する。列挙外の既存テストは無変更で green を維持する。

| # | ファイル / テスト | 現在の期待 | 変更後の期待 | 根拠 |
|---|---|---|---|---|
| 1 | `tests/unit/prompts/test-materialize-red-check-contract.test.ts` — TC-001「書き直して再実行する旨が含まれる」(`書き直して` / `何も見張っていないテスト`) | `## Method` に**含まれる** | **含まれない**に反転 | D1: 書き直し命令を削除 |
| 2 | 同上 — TC-002「expected-red は green が欠陥である旨が含まれる」(`green は欠陥` / `欠陥`) | 含まれる | **含まれない**に反転 | D1: green=欠陥 の権威を削除 |
| 3 | 同上 — TC-002「不一致は完了不可とする旨が含まれる」(`完了不可` / `不一致`+`完了`) | 含まれる | **含まれない**に反転 | D1: 完了不可の権威を削除 |
| 4 | 同上 — TC-002「修正または再分類の根拠を Evidence に記す旨」(`再分類`\|`修正` + `Evidence`) | 含まれる | **理由の記録**を assert(green 観測時に理由 + Evidence への記録)に変更 | D1: 「書き直し / 再分類」から「観測事実と理由の記録」へ |
| 5 | 同上 — ファイル冒頭 docstring | red 強制を pin する記述 | 反転後の意味(権威撤回 / 観測記録維持)に更新 | 上記 1–4 の整合 |
| 6 | `tests/unit/step/test-materialize-boundary.test.ts` — TC-TMB-05「message contains 'production' and NOT 'TDD'」 | true 分岐に `production` を含む | canon 整合の文面(`test-cases.md` 参照 + 両方整合)を assert。`(TDD: write tests first` を**含まない**は維持 | D2: 「production only」文面の廃止 |
| 7 | 同上 — TC-TMB-05「message says not to create or modify test files」 | `do not create or modify test` を含む | **含まない**に反転 + 「変更したテストと理由を報告」の指示を assert | D2: テスト不可侵の撤回 |
| 8 | 同上 — TC-TMB-07「state with test-materialize record → implementation-only mode」の `production` assert | `production` を含む | 6 と同じ canon 整合文面を assert。`(TDD: write tests first` 不在は維持 | D2: 同上(state 経由の分岐検出は維持) |

**新規テスト**(既存の更新ではないが D5 の完全性のため明記):

- `tests/unit/prompts/test-materialize-red-check-contract.test.ts` に追加:
  - **初回 message の red 非強制**: `buildTestMaterializeInitialMessage` に代表的な入力(title・requestContent・testCasesMd)を与えて生成した message が「confirm they fail (red)」等の red 強制表現を含まず、観測結果を記録してから完了する旨を含むことを assert する。(spec Requirement 1「初回 message も red を確認して完了する旨を含まない」の対応 Scenario を機械的に固定する)

- `src/core/step/bite-evidence/__tests__/gate.test.ts` に 2 describe を追加:
  - **再走形状**: `implementer:[impl1@t1, impl2@t3]`, `test-materialize:[mat1@t0, mat2@t2]`(base=mat2、impl1 が base より前) + base-green を返す runtime → `verdict === "strategy-deferred"` かつ `reason` が baseline 構築不能を示す。加えて `STANDARD_TRANSITIONS` に `{ bite-evidence, strategy-deferred → verification }` が存在することを assert(verification へ遷移する受け入れ基準)。state の request type は forward type(`bug-fix` または `new-feature`)を使用すること(gate step 1 で非 forward type を strategy-deferred にするため、汚染検知コードに到達する前に偶然 deferral が成立するのを避ける)。
  - **初回一巡(前提保持)**: `test-materialize:[mat@t0]`, `implementer:[impl@t1]`(base より前の implementer 無し) + base-green の genuine hollow → `verdict === "failed"`(判定無変更)。distinct timestamp を使い、検知が発火しないことを固定する。state の request type も forward type を使用すること(上記と同じ理由)。

**無変更で green を維持する主な既存テスト**(抜粋、代表確認):

- `test-materialize-red-check-contract.test.ts` の TC-001(完了報告 / 観測 / 裁量 / 5 節骨格)、TC-002(expected-red / expected-green ラベル、expected-green は green が正常)、TC-003(Evidence 観測記録)、TC-004(manual / gate / traceability / skeleton)、TC-005(result file 不在)。
- `test-materialize-prompt-contract.test.ts` 全体(traceability コメント手順・5 節骨格)。
- `tests/prompts/implementer-system.test.ts` 全体(IMPLEMENTER_SYSTEM_PROMPT はテスト不可侵文言を含まない — 変更対象は message builder のみ)。
- `test-materialize-boundary.test.ts` の TC-TMB-01..04 / 06 / 08..19 / A1 / F1。
- `gate.test.ts` の TC-003/004/005/006/007/008/022/030/031/032(初回一巡・非 forward・tamper・OID 欠如の各挙動)。

### D6: archive floor にも同じ前提破れ検知を適用する

D3 の deferral 化により、汚染再走(implementer-1 → test-materialize-2 → implementer-2)は escalation で止まらず archive まで到達可能になる。archive floor(`deriveAchievedAssurance`)は gate と独立に `resolveBaseCandidateOids` で base を解決し base-red を評価するため、汚染 base に偽の biteEvidence="required" を付与しうる(cross-boundary-invariants レビュー Finding 1)。

対応: `detectBaseImplementationContamination` を archive floor の precondition(P2.5)としても適用し、汚染検知時は biteEvidence / testDerivation を absent のまま残す(既存の precondition 群と同じ fail-closed 早期 return)。「materialize commit = base」の意味付け自体は維持し(D3 の方針どおり)、前提破れ時の評価拒否だけを第 2 の消費者に広げる。baseline の置換は Evidence Base request で行う。

追加テスト: `src/core/archive/__tests__/achieved-assurance.test.ts`(新規)— 汚染形状で両次元 absent + diagnostics 記録 + provenance I/O 不実行を固定。clean 形状の biteEvidence 付与は既存 e2e(bite-evidence-e2e-gate.test.ts TC-010 floor)が引き続き固定する。

## Risks / Trade-offs

- **[Risk] timestamp の同値衝突で再走を見逃す** — 実 pipeline の agent session は分単位で離れて走るため実害は極小。万一 `impl.startedAt == base.startedAt` の場合は「前提保持」扱い(検知せず)にフォールバックし、従来の(誤り得る)判定に戻るだけで、新たな偽 verdict は増やさない。→ **Mitigation**: 本 change は暫定検知(request 明記)。恒久解は後続の Evidence Base 再設計で置換する。`ponytail: startedAt 全順序に依存、Evidence Base 導入時に tree 合成へ置換`。
- **[Risk] prompt の権威撤回で red 観測が緩み、hollow テストが下流に流れる** — bite-evidence(前提保持時)と code-review / conformance が引き続き検出する。observation record は維持されるため review の判断材料は残る。→ **Mitigation**: 証拠は残す設計。判定は下流 review の責務(D2)。
- **[Trade-off] implementer が test を触れるようになる** — 意図された挙動変更(canon 整合)。テスト変更の妥当性は code-review / conformance が canon 突合で裁く。機械の歯は足さない(request 明示)。

## Open Questions

- なし(スコープ内の設計判断は architect 評価済み。恒久的 baseline 再設計は後続 request に委譲)。
