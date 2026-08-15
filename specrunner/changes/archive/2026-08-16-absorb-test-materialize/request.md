# test-materialize step の廃止: テスト実体化を implementer に統合する

## Meta

- **type**: spec-change
- **slug**: absorb-test-materialize
- **base-branch**: main
- **adr**: true

## 背景

test-materialize は「implementer より前に、実装を見ずにテストを実体化する」ための独立 step だった。この分離が担っていた保証は歴史的に 2 つある:

1. **時系列による真実性**(テストが実装より先に書かれた) — strip-test-authority(#991)と Evidence Base(#997)で解体済み。red→green の証明は Evidence Base(不変の job base + candidate 時点のテスト overlay)上の機械実行が担い、テストが「いつ」書かれたかは証明に一切寄与しない。
2. **テストが canon(test-cases.md)だけから書かれる**(実装からの逆算を物理的に不能にする) — test-case-gen の design phase 移動(#996)で、テストの設計正典(test-cases.md)は spec-review の照合対象になった。実体化はその機械的翻訳であり、独立 session を要する工程ではない。

分離のコストは実測で明確になっている: test-materialize は毎 job で最重量級の独立 agent session を 1 つ消費し(実測 ~18 分 / job の事例あり)、さらに「implementer は既存テストを変更してよいか」「materialize 後の再走で base が汚染する」等、工程境界そのものが生む escalation 類型の温床だった(#985 の破壊ループ、#989 の偽 baseline、いずれも境界起因)。

対応: test-materialize step を廃止し、テスト実体化(test-cases.md → テストコード)を implementer の責務に統合する。implementer は test-cases.md を正典としてテストと実装を一体で書き、真実性の証明は Evidence Base 上の red→green(bite-evidence)が機械で担う。

## 現状コードの前提

- `src/core/pipeline/types.ts` — `SPEC_REVIEW approved → TEST_MATERIALIZE`(unconditional)、`TEST_MATERIALIZE success → IMPLEMENTER` / `error → escalate`。exempt type は `SPEC_REVIEW approved → IMPLEMENTER (when: isTestGenExempt)` で既にバイパスしている
- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids` の baseOid = 最新 test-materialize run の commitOid。**gate(file-set 同定: `listCommitChangedFiles(baseOid)`)と archive floor(P2 / blob freeze: `diffPathsBetweenCommits(baseOid, finalHeadOid, ...)`)の両方がこれに依存**
- `src/core/step/bite-evidence/gate.ts` — red は `runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, headOid)`、green は `runTestsAtCommit(headOid)`(#997)。file-set 同定のみが test-materialize commit に残存依存
- `src/core/archive/achieved-assurance.ts` — P2 で baseOid 必須(null → 両 dimension absent)。testDerivation の blob freeze は「baseOid 以降 final HEAD までテスト blob が不変」を検証する
- `src/core/step/test-materialize.ts` + `src/prompts/test-materialize-system.ts` — step 定義と prompt。`src/core/step/implementer.ts` は `testsMaterialized` フラグで implement-only mode / TDD mode を分岐(`buildImplementerInitialMessage`)
- `src/core/pipeline/test-gen-exemption.ts` / `src/config/type-config.ts` — `isTestGenExempt` は test-case-gen・test-materialize・bite-evidence の 3 箇所のバイパスを制御(#987)
- `src/core/resume/resolve-step.ts` — `--from test-materialize` が有効候補。absorb-build-fixer が確立する `LEGACY_STEP_ALIASES`(build-fixer → implementer)と同じ互換パターンが使える
- 参照箇所は production 27 ファイル(registry / write-scope / staging-containment / output-contract / templates / prompts / tc-source-contract / step-names / agent-definition / config-effective / verification test-coverage 等)
- 過去 job の state / journal に test-materialize 実行歴が残っている(fold は `StepName = string` の passthrough で保持)

## 要件

1. **遷移の置換** — `SPEC_REVIEW approved → IMPLEMENTER` を全 type の経路とし、TEST_MATERIALIZE への遷移・TEST_MATERIALIZE の行を削除する。exempt type の bite-evidence バイパス(`IMPLEMENTER success → VERIFICATION when isTestGenExempt`)は不変。
2. **implementer への実体化統合** — implementer は test-cases.md を正典としてテストの実体化と実装を一体で行う。prompt は「test-cases.md の全 TC をテストコードに実体化し、実装と整合させる」責務を明示する。`testsMaterialized` の mode 分岐(implement-only / TDD)は廃止し単一 mode にする。
3. **file-set 同定の Evidence Base ネイティブ化** — bite-evidence gate と archive floor の materialized test files 同定を「test-materialize commit の changed files」から「**Evidence Base 参照(fork point)と candidate の diff のうちテストパターンに合致するファイル**」へ置換する(`selectMaterializedTestFiles` のフィルタは維持)。baseOid(test-materialize run の commitOid)への依存を gate / floor から除去する。
4. **testDerivation(blob freeze)の意味論再定義** — 「materialize 以降テスト blob 不変」という工程境界ベースの freeze は成立しなくなる。置換後の testDerivation が何を保証するか(例: scenario 凍結 = test-cases.md ↔ テストファイルの対応の final HEAD 時点検証に縮退、freeze 部分の廃止等)は design で確定し、archive floor・ADR-20260717 系の期待値との整合を明示する。縮退させる場合は根拠を design に記録する。
5. **削除と互換** — step 定義・prompt・遷移・registry・write-scope・staging-containment・output-contract・templates・`--from test-materialize` 候補を削除する。resume 互換は legacy alias(test-materialize → implementer)で担保する(absorb-build-fixer の `LEGACY_STEP_ALIASES` と同じ場所・同じパターン)。test-materialize 実行歴を含む既存 state の読み込み・fold・resume が壊れないこと。
6. **exemption の縮退** — `isTestGenExempt` の制御対象は test-case-gen バイパスと bite-evidence バイパスの 2 箇所に縮退する。exempt type の観測可能な挙動(test-case-gen を通らない・bite-evidence を通らない)は不変。

## スコープ外

- code-fixer の統合(別判断)
- test-case-gen step・spec-review の TC 照合(#996 の形を維持)
- Evidence Base の構築方式・red→green 判定自体(#997 の形を維持)
- hollow テスト(実装から逆算した鏡写しテスト)の意味的検出 — 本 request は初回走行の「実装を見ずに書く」物理的保証を手放すことを含む。これは approved batch の設計判断であり、機械の歯(EB red→green)が「テストが変更に噛んでいる」ことを保証し続ける

## 受け入れ基準

- [ ] 全 type で spec-review approved から implementer へ直行することをテストで固定する(遷移表に TEST_MATERIALIZE 行が存在しない)
- [ ] implementer prompt に test-cases.md 全 TC の実体化責務が含まれることをテストで固定する
- [ ] bite-evidence gate が test-materialize run の無い state で file-set を EB↔candidate diff から同定し、red→green 判定に到達することをテストで固定する(baseOid 依存の deferral が発生しない)
- [ ] archive floor が同様に baseOid 無しで判定に到達することをテストで固定する
- [ ] testDerivation の再定義後の挙動をテストで固定する(design で確定した意味論に対応)
- [ ] legacy state(test-materialize 実行歴あり)の読み込み・resume(`--from test-materialize` alias 含む)が壊れないことをテストで固定する
- [ ] exempt type の観測可能挙動(test-case-gen / bite-evidence を通らない)が不変であることを既存テストの green で確認する
- [ ] 遷移表・test-materialize 関連の既存テストの更新対象を design で全列挙し根拠を明示する。列挙外は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **独立 session の分離は保証を生んでいない** — 時系列真実性(#991/#997 で解体)と canon 由来性(#996 で spec-review 照合に移管)のどちらも、もはや step 分離に依存しない。残っているのは最重量級 session 1 つ分のコストと、工程境界が生む escalation 類型だけである。
- **file-set 同定は fork point diff が正しい** — 「このジョブが追加・変更したテスト」の定義として、工程 commit ではなく EB↔candidate の diff が Evidence Base の意味論と一貫する。resume・再走・複数回の implementer 実行のいずれでも同一の答えになる。
- **初回の物理的分離を手放すことは明示的な選択** — 実装を見た鏡写しテストは EB 上でも red→green を通り得る(検出限界)。この限界は分離があっても resume 経路では既に存在しており、初回だけ守っても保証としては不完全だった。防御は test-cases.md の質(spec-review 照合)と red→green の機械実行に一本化する。
