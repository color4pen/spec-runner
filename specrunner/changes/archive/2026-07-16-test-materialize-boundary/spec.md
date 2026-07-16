# Spec: scenario freeze と test-materialize→implement の commit 境界

自己完結の仕様。構造・型・FSM が自動的に強制しない Layer-1 の挙動を規定する。用語: 本仕様の「固定 scenario ID」は `test-cases.md` の各 scenario が持つ安定・一意・grep 可能な `TC-{NNN}` 識別子を指す（request の "SC-XXX" はこれに写像される、design D2）。

## Requirements

### Requirement: test-case-gen 境界での scenario freeze

システムは、test-case-gen が生成する `test-cases.md` の各 scenario が安定 ID（`TC-{NNN}`）を持つことを保証し、test-case-gen ノード完了時にその `test-cases.md` の content hash を branch-borne（events.jsonl の lineage record）に記録 SHALL する。この hash は後続（R4）の tamper 検知の基点となる。

#### Scenario: test-case-gen の lineage に test-cases.md の hash が記録される

**Given** test-case-gen ノードが `test-cases.md` を produce して完了する
**When** CommitOrchestrator が step 完了の lineage 記録を行う
**Then** `events.jsonl` に `type:"lineage"`・`step:"test-case-gen"` の record が append され、その `outputs` に `path` が `test-cases.md`・`hash` が `sha256:` で始まる非 null の ArtifactRef が含まれる

#### Scenario: test-cases.md の各 scenario が安定 ID を持つ

**Given** test-case-gen が生成した `test-cases.md`
**When** must priority の scenario を走査する
**Then** 各 must scenario は一意で grep 可能な `TC-{NNN}` 形式の ID を持ち、後続ノードはこの ID を再採番しない

### Requirement: test-materialize ステップの topology

システムは、standard pipeline に `test-materialize` ノードを test-case-gen と implementer の間に持ち、`SPEC_REVIEW→TEST_CASE_GEN→TEST_MATERIALIZE→IMPLEMENTER→VERIFICATION` の順で遷移 SHALL する。fast pipeline の topology は変更しない。

#### Scenario: STANDARD_DESCRIPTOR に test-materialize が含まれ role が gate/impl

**Given** `STANDARD_DESCRIPTOR`
**When** steps と roles を参照する
**Then** `steps` に `test-materialize` が test-case-gen より後・implementer より前に含まれ、`roles["test-materialize"]` は `{role:"gate", phase:"impl"}` であり、impl phase の creator は implementer ただ 1 つのままである

#### Scenario: 遷移順が test-case-gen→test-materialize→implementer

**Given** `STANDARD_TRANSITIONS`
**When** 遷移を辿る
**Then** `TEST_CASE_GEN on success → TEST_MATERIALIZE`、`TEST_MATERIALIZE on success → IMPLEMENTER`、`TEST_MATERIALIZE on error → escalate` が存在する

#### Scenario: fast pipeline は test-materialize を含まない

**Given** `FAST_DESCRIPTOR`
**When** steps を参照する
**Then** `test-materialize` は含まれず、fast の step 構成は本変更前と同一である

### Requirement: base コミット境界（test 在り／実装無し）

システムは、test-materialize ノード終端で **固定済み `test-cases.md` の各 must scenario を test コードに変換して書き出し（実装は書かない）**、node 終端の 1 コミットで **base OID** を feature branch に生じ SHALL させる。test-materialize の verdict は「各 must scenario に対応する test が存在する」を契約とし、test が pass することは要求しない。

#### Scenario: test-materialize 後に test を含み実装を含まない commit が生じる

**Given** 固定済み `test-cases.md` を入力に test-materialize が test コードを worktree に書き出す
**When** CLI が node 終端で commit する
**Then** feature branch に、tree diff（対親コミット）が test ファイル（`*.test.ts` 等）を 1 件以上含み、実装ソース（test 拡張子以外の src コード）を含まない commit（base）が生じる（test 実行結果ではなく commit の tree で検証する）

#### Scenario: 各 test に固定 scenario ID が埋め込まれる

**Given** test-materialize が生成した test コード
**When** must scenario の TC ID を走査する
**Then** 各 must scenario の `TC-{NNN}` が対応する test（関数名または直前コメント）に埋め込まれている

#### Scenario: test 存在契約は満たすが実装が無いため test は red でよい

**Given** test-materialize が全 must scenario の test を書いたが実装は書いていない
**When** test-materialize の output-gate（test-coverage contract）が評価される
**Then** 「各 must TC ID の test ファイルが存在し assertion（`expect(`/`assert(`）を含む」ことのみを grep で検証し、test を実行せず、実装不在による red を理由に契約違反としない

#### Scenario: must scenario の test が欠落すると契約違反で halt する

**Given** test-materialize が一部の must scenario の test を書き出さなかった
**When** output-gate（test-coverage contract, policy halt）が評価される
**Then** 欠落 TC ID を violation として halt する（base コミットは作られない）

### Requirement: implementer は実装専用（standard）

システムは、standard topology の implementer が **test コードを書かず**、`tasks.md`＋固定 scenario＋materialize 済み test を入力に **実装コードのみ**を書き SHALL する。materialize 済み test は implementer の reads に soft input として含まれ、verification の TC-ID grep は materialize 済み test に対して従来どおり成立する。fast topology の implementer は従来の TDD 挙動を保持する。

#### Scenario: standard の implementer 初期メッセージが実装専用を指示する

**Given** state に `test-materialize` の実行記録がある（standard）
**When** implementer の初期メッセージを構築する
**Then** メッセージは「materialize 済み test を書き換えず実装のみを書く」旨を含み、「テストを先に書く（TDD）」の無条件指示を含まない

#### Scenario: fast の implementer 初期メッセージは TDD 挙動を保持する

**Given** state に `test-materialize` の実行記録が無い（fast）
**When** implementer の初期メッセージを構築する
**Then** メッセージは本変更前と同一の TDD 手順（テストを先に書く）を含む

#### Scenario: implementer の test-cases.md read は soft である

**Given** `ImplementerStep.reads()`
**When** IoRef を走査する
**Then** `test-cases.md` の IoRef は `required:false`（soft）であり、fast の descriptor-input-completeness 検証で violation を生まない

#### Scenario: verification の TC-ID grep が materialize 済み test に成立する

**Given** test-materialize が must TC を埋め込んだ test を書き、implementer が実装を書いた後
**When** verification の test-coverage grep が走る
**Then** 各 must TC ID が materialize 済み test ファイルに見つかり coverage が成立する

### Requirement: needs-fix ループは implement に戻す

システムは、verification / code-review / conformance の needs-fix を **implement 系（implementer / build-fixer / code-fixer）**に戻し、`test-materialize` を再実行 SHALL しない。test-materialize は test-case-gen の後に一度だけ走る。

#### Scenario: test-materialize を宛先とする遷移は test-case-gen からの 1 本のみ

**Given** `STANDARD_TRANSITIONS`
**When** `to === "test-materialize"` の遷移を列挙する
**Then** ちょうど 1 本であり、その `step` は `test-case-gen` である

#### Scenario: conformance needs-fix:implementer は implementer に戻る

**Given** conformance が `needs-fix:implementer` を返す
**When** 次ノードを解決する
**Then** `implementer` に遷移し、`test-materialize` には遷移しない

### Requirement: 挙動保存（回帰なし）と checkpoint/resume 継続

システムは、新ノード挿入以外の pipeline / verification / conformance ループ・attach・checkpoint の挙動を保存 SHALL し、固定 scenario と base/candidate の commit 履歴を checkpoint/resume を跨いで保持する。

#### Scenario: resume の allowed step に test-materialize が含まれる

**Given** `AGENT_STEP_NAMES` に test-materialize が追加されている
**When** resume の allowed step set を構築する
**Then** `test-materialize` が含まれ、`resolveResumeStep` は resumePoint.step / state.step が `test-materialize` のとき verbatim に返す

#### Scenario: 既存の挙動保存テストが無変更で green

**Given** 本変更適用後のコードベース
**When** loop / attach / checkpoint / reverification の既存挙動保存テストを実行する
**Then** それらのテストは無変更で green である（topology 列挙テストの新ノード反映は挿入そのものであり回帰ではない）

#### Scenario: typecheck と test が green

**Given** 本変更の全実装
**When** `bun run typecheck && bun run test` を実行する
**Then** どちらも成功する
