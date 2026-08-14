# テスト証拠と工程順序の分離(第1弾): red 強制・テスト変更禁止・偽 baseline 判定の撤回

## Meta

- **type**: spec-change
- **slug**: strip-test-authority
- **base-branch**: main
- **adr**: true

## 背景

現行 pipeline は「テストが実装より先に書かれた」という工程順序を、テストの真実性の証明として扱っている。この昇格は複数の機構に分散して埋め込まれている:

- test-materialize は新規テストに「red を観測するまで完了不可、green なら書き直して再実行」を命じる
- implementer は test-materialize の実行歴があるだけで「production code only、テスト変更禁止」モードに入る
- bite-evidence は「最新 test-materialize commit = base(実装なし)」を暗黙前提に red→green を判定する

この前提は初回の一直線の走行でのみ真であり、implementer 通過後の resume(spec-fixer / test-case-gen / test-materialize からの再走)で破れる。破れた状態では各機構が逆向きに作用する:

1. test-materialize は実装済み worktree で新規テストを実行して green を観測し、「何も見張っていないテスト」と誤認して**正しいテストを既存実装に対して fail するよう書き直す**(prompt の明文命令)
2. implementer は歪んだテストを「変更禁止・pass させろ」と命じられ、**正しい実装を壊す**
3. bite-evidence は実装混入済みの base で green→green を検出し、実際に噛んでいるテストを hollow と誤判定して escalation で停止する(issue #989 実例: aozu change op-element、再走 2 巡目で 7 ファイル中 4-5 ファイルが偽陰性)

3 は判定の誤りだが、1→2 は成果物の破壊であり、さらに escalation の出口が cancel → 再起票しかない。テスト保証の強化が pipeline の回復経路(resume / fixer / operator 裁定)を塞ぐ構造になっている。

本 request は連作「テスト証拠と工程順序の分離」の第 1 弾として、**工程順序に由来する権威を撤回する(引き算)**。テスト実行の観測記録(証拠)は残し、red の強制(権威)を消す。恒久的な baseline 再設計(Evidence Base: job 開始時の実装 tree + 最終テスト tree の合成)は後続 request で行う。

## 現状コードの前提

- `src/prompts/test-materialize-system.ts:93-98` — expected-red 分類の定義に「green は欠陥」、「fail しなかった新挙動テストは書き直してから再実行する」「期待と観測の不一致は完了不可」の命令。`:161` — 初回 message に「confirm they fail (red) as expected」
- `src/prompts/test-materialize-system.ts:112` 付近 — Evidence 要求(実行コマンド・対象ファイル・観測結果・期待分類の記録)。この観測記録要求は本 request 後も維持する
- `src/core/step/implementer.ts:198` — `testsMaterialized = Boolean(state.steps?.[STEP_NAMES.TEST_MATERIALIZE]?.length)`(実行歴の有無のみで判定)。`:82-98` — true のとき「write production code only, do NOT create or modify test files」を build する
- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids`: base = 最新 test-materialize run の commitOid、candidate = 最新 implementer run の commitOid。順序前提の検証は無い
- `src/core/step/bite-evidence/gate.ts:239-273` — base-green(green→green)は verdict "failed"。`src/core/pipeline/types.ts:260` — failed → escalate
- bite-evidence は scopedTestCommand 未設定プロジェクトでは strategy-deferred で素通りする(実行手段が無いため)。本 request はこの挙動を変えない

## 要件

1. **test-materialize の red 強制の撤回** — system prompt から「red になるまで完了不可」「green なら書き直して再実行」の命令を削除する。維持するもの: 新規テストの実行義務、観測記録(コマンド・対象ファイル・fail/pass 件数・期待分類)。変更するもの: expected-red が green だった場合は「書き直す」のではなく、**観測事実と考えられる理由を記録する**(例: 既存実装が要求を満たしている / 分類誤り / 見張れていない疑い)。判断は下流の review に委ね、materialize 自身に裁かせない。

2. **implementer のテスト変更禁止モードの撤回** — `testsMaterialized` による「production code only / テスト変更禁止」の指示を廃止する。materialize 済みテストが存在する場合の指示は「test-cases.md と spec を正として、テストと実装の両方を整合させる。テストを変更した場合は、変更したテストとその理由を作業の報告に明示する」とする(新しい成果物ファイルは増やさない)。テストの正しさの根拠は canon(test-cases.md)との整合であり、「先に書かれたこと」ではない。

3. **bite-evidence の前提破れ検知(暫定)** — base/candidate の解決時に、**base(最新 test-materialize commit)の祖先に、その materialize より前に記録された implementer run の commit が含まれる**場合は red→green 判定を行わず、「baseline 構築不能(base に実装が混入)」を理由に明示した deferral(strategy-deferred と同じ合流先)として記録し verification へ通す。偽 verdict(hollow 誤判定 → escalate)を出さない。前提が保たれている走行(初回一巡)の判定挙動は無変更。
   - 注: 「candidate が base の祖先か」では検知できない。再走の実形状は implementer-1 → test-materialize-2(= base、既に実装混入)→ implementer-2(= candidate)であり、Git 上は正常な base → candidate の形をとる。見るべきは「過去の implementer commit が base に混入しているか」。

4. **既存テストの更新列挙** — 1・2 は意図した挙動変更であり、対応する既存の prompt contract テスト・implementer mode テストの期待値更新を伴う。design で更新対象を全列挙し、各項目に更新根拠を明示する。列挙外の既存テストは無変更で green。

## スコープ外

- Evidence Base の構築(job 開始時実装 tree + 最終テスト tree の合成)と bite-evidence の baseline 置換
- candidate の effective HEAD 化(--adopt-commits の反映)
- test-materialize step の implementer への統合・step 削除
- scenario freeze(SC-XXX + hash による canon 束縛)の変更 — canon への束縛は工程順序への束縛ではないため維持
- test-case-gen の挙動変更
- 鏡写しテスト対策(implementer 内の論理フェーズ分離等)— 統合を扱う後続 request の論点

## 受け入れ基準

- [ ] test-materialize system prompt に「red になるまで完了不可」「green なら書き直す」に相当する命令が**含まれない**ことをテストで固定する
- [ ] test-materialize system prompt に実行義務と観測記録要求(コマンド・対象・結果・分類)が**残る**ことをテストで固定する
- [ ] expected-red が green の場合の指示が「理由の記録」であり「書き直し」でないことをテストで固定する
- [ ] materialize 実行歴がある場合の implementer prompt に「テスト変更禁止」が含まれず、「canon を正として両方を整合・変更理由の記録」の指示が含まれることをテストで固定する
- [ ] 過去の implementer run の commit が base(最新 test-materialize commit)の祖先に含まれる状態で、bite-evidence が failed でなく明示的 deferral(理由: baseline 構築不能)を返し、verification へ遷移することをテストで固定する(再走形状: implementer-1 → materialize-2 → implementer-2)
- [ ] 前提が保たれた状態(base の祖先に過去の implementer commit が無い初回一巡)の bite-evidence 判定が無変更であることをテストで固定する
- [ ] 更新した既存テストの全列挙と根拠が design に記載され、列挙外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **引き算で直す(条件分岐の追加ではなく命令の削除)** — 「再走時のみ red 強制を無効化する」という条件追加は、壊れた前提の上に分岐を重ねる対症療法であり採らない。証拠(実行と観測の記録)と権威(red の強制・テストの不可侵)を分離し、権威側を撤回する。却下した代替案: 再走検知による prompt 切り替え(green の意味の判別が原理的に不能なまま命令だけ残る)。
- **前提破れは「偽判定」でも「封鎖」でもなく「判定不能の明示」** — escalate で塞ぐと cancel → 再起票しか出口の無い dead end を再生産する。gate は観測者として「証明できない」事実を記録して通し、判断材料として下流に渡す。黙って素通りはしない(理由を必ず記録に残す)。
- **「materialize commit = base」の意味付け自体はまだ消さない** — 置換先(Evidence Base)無しに消すと gate が拠り所を失う。本 request は前提破れ時の誤作動だけを止め、意味付けの削除は baseline 再設計の request で置換と同時に行う。
- **テスト変更の記録は prompt 指示に留め、機械の歯を作らない** — 変更宣言の機械検証を足すと「テストを触ったら咎める」新しい権威になる。整合性の判定は既存の review 工程(code-review / conformance)の責務のまま。
