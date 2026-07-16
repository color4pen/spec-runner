# scenario freeze と test-materialize→implement の commit 境界を作る（R3, Option A 二ノード分割）

## Meta

- **type**: spec-change
- **slug**: test-materialize-boundary
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260716（assurance profile 境界）D4 で ratify 済み。本 request はその R3 を、既存の1ノード1コミットモデル上で二ノード分割として実装する（Option A）。同一 session composite（内部多重コミットの新実行 primitive）は採らない。R4（BiteEvidence 機械生成）は本 request の射程外。新規 architecture ADR を要さない。 -->

## 背景

ADR-20260716 D4 は「歯を残すには test scenario 固定と、test materialize（= base）→ implement（= candidate）の commit 境界が要る」と定めた。現状はこの境界が無い:

- `implementer` ステップが **test コードと実装を同一コミットに混ぜて書く**（`src/prompts/implementer-system.ts`: TDD でテストを先に書くが、コミットは1回）。→「test は在るが実装が無い」base OID が存在しない。
- ステップは node 終端で**1回だけ** commit する（`src/core/step/executor.ts:433` の `finalizeStepArtifacts`→`commitAndPush`）。1ノード内で複数の内部 commit 境界を作る seam は無い。

そこで**既存の1ノード1コミットモデルのまま**、implementer を2ノードに割って commit 境界を作る（Option A）。R4（gate が base/candidate OID で test を実行し BiteEvidence を生成）は本境界の上に乗るが、本 request では実装しない。

## 現状コードの前提

調査で確認済み。実装はこの前提に沿うこと。

- **test-case-gen**: `src/core/step/test-case-gen.ts`。散文の scenario（`test-cases.md`）を生成、**コードは書かない**（`src/prompts/test-case-gen-system.ts`: "scenario descriptions only"）。`writes()` = `${changeFolder}/test-cases.md`。verdict ファイル無し（出力 gate `validateStepOutputs` のみ）。
- **implementer**: `src/core/step/implementer.ts`。`writes()` = `[{path: changeFolder, artifact:"gitState"}, {path: tasks.md, verify:false}]`。プロンプトで test（TC ID 付き）＋実装を書き、CLI が1コミット。`completionVerdict:"success"`。verification が `*.test.ts` を grep して TC ID 存在を機械検証。
- **transitions**（`src/core/pipeline/types.ts`）: `SPEC_REVIEW→TEST_CASE_GEN→IMPLEMENTER→VERIFICATION`。needs-fix ループ: `CONFORMANCE →(needs-fix:implementer)→ IMPLEMENTER`、verification/code-review も implementer に戻りうる。
- **1ノード1コミット**: `executor.ts:433` が非 round ステップで `finalizeStepArtifacts` を commitMutex 下で1回呼ぶ。`commit-push.ts:36` が `git add -A`→commit `"${step.name}: ${slug}"`→push。
- **artifact hash 記録**: `LocalRuntime.digestArtifacts`（`src/core/runtime/local.ts:822`）が `sha256:` を計算。`LineageRecord`（`src/store/event-journal.ts:93`, `{step, outputs:ArtifactRef[], inputs}`）が events.jsonl に best-effort 追記される（state.json には materialize されない）。scenario hash 記録はこの経路を使える。
- **step 追加の型**: STANDARD_DESCRIPTOR（`src/core/pipeline/registry.ts`）に `[STEP_NAMES.X, XStep]`、`roles`、transitions を足す。step 名は `src/kernel/step-names.ts`。新 agent step は `test-case-gen.ts` / `implementer.ts` を雛形にできる。

## 要件

1. **scenario freeze（SC-XXX 安定 ID ＋ hash）**: test-case-gen が生成する `test-cases.md` の各 scenario に**安定 ID（SC-XXX）**を持たせる。test-case-gen → 次ノードへ渡る境界で `test-cases.md` の**hash を branch-borne に記録**する（既存 `digestArtifacts`＋`LineageRecord`/events.jsonl 経路を使う）。この hash が後続（R4）の tamper 検知の基点になる。

2. **`test-materialize` ステップの新設（= base コミット）**: test-case-gen と implementer の間に新ノード `test-materialize` を挿入する。役割: 固定済み `test-cases.md` の各 SC-XXX を **test コードに変換して書き出す（実装は書かない）**。各 test に SC-XXX ID を埋め込む。node 終端で1コミット = **base OID（test は在る／実装は無い）**。verdict は「各 must SC-XXX に対応する test が存在する」を契約とし、**test が pass することは要求しない**（実装が無いので red は正常）。

3. **`implementer` を実装専用にする（= candidate コミット）**: implementer は **test コードを書かず**、`tasks.md` ＋ 固定 scenario ＋ materialize 済み test を入力に**実装コードのみ**を書く。node 終端で1コミット = candidate OID。implementer の `reads()` に materialize 済み test を加え、プロンプトから「テストを書く」責務を外す。verification の TC-ID grep 検証は materialize 済み test に対して従来どおり成立する。

4. **loop 配慮**: verification / code-review / conformance の needs-fix は **`implementer`（= implement）に戻す**（test は固定済みなので `test-materialize` を再実行しない）。`test-materialize` は test-case-gen の後に**一度だけ**走る。既存の implementer 宛 needs-fix transition の宛先が implement 専用ノードになるよう整合させる。scenario を作り直す必要が生じた場合の経路（test-case-gen 再入）は既存の挙動を変えない。

5. **checkpoint/resume 継続**: 固定済み scenario（SC-XXX＋hash）と base/candidate の commit 履歴が checkpoint/resume を跨いで保持される（branch-borne truth なので commit 済みなら自然に継続。state/events に記録した hash も同様）。

## スコープ外

- **R4**: gate が base/candidate OID で test を実行して `BiteEvidence`（base-red→candidate-green 等）を機械生成すること。bite strategy の category 別ロジック。本 request は commit 境界と freeze を作るのみで、evidence は生成しない。
- **R2**: minimumAssurance floor / protected paths。
- **R6**: fast profile / assurance 値に基づく工程分岐。本 request は standard の topology を「test-case-gen→test-materialize→implement→verification」に変えるだけで、profile 値は参照しない。
- 同一 session composite の新実行 primitive（内部多重コミット）。本 request は既存の1ノード1コミットモデルで二ノードとして実現する。

## 受け入れ基準

- [ ] `test-cases.md` の各 scenario が安定 ID（SC-XXX）を持ち、test-case-gen 境界で `test-cases.md` の hash が branch-borne に記録される（events.jsonl lineage 等）ことをテストで固定する。
- [ ] `test-materialize` ステップが STANDARD_DESCRIPTOR に入り、`SPEC_REVIEW→TEST_CASE_GEN→TEST_MATERIALIZE→IMPLEMENTER→VERIFICATION` の順で遷移する。
- [ ] `test-materialize` の後に、**test ファイルが存在し実装が存在しない commit（base）** が feature branch に生じることを固定する（test 実行結果ではなく commit の tree で検証）。
- [ ] `implementer` は test コードを書かず実装のみを書く（materialize 済み test を reads に含む）。verification の TC-ID grep が materialize 済み test に対して成立する。
- [ ] verification / code-review / conformance の needs-fix が `implementer`（implement）に戻り、`test-materialize` を再実行しないことをテストで固定する。
- [ ] 既存の pipeline / verification / conformance ループ・attach・checkpoint の挙動保存テストが無変更で green（新ノード挿入以外の回帰なし）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **commit 境界は既存の1ノード1コミットモデルで二ノード分割として作る（Option A）**。→ 却下: 同一 session の内部多重コミット primitive を新設する（foundation 級、本 request の射程を超える。必要なら別途 attended ADR）。
- **test-materialize は test 存在を契約とし、pass は要求しない**（実装前なので red が正常＝base）。→ 却下: test-materialize で test を pass させる（実装を先に書くことになり base 境界が消える）。
- **needs-fix ループは implement に戻す**（scenario は固定済み）。→ 却下: needs-fix で test-materialize から再実行する（固定 scenario が壊れ、hash 継続が崩れる）。
- **本 request は commit 境界と freeze のみ、BiteEvidence は R4**。→ 却下: base/candidate OID で test を実行して evidence を前倒しで作る（R4 の射程を侵食）。
