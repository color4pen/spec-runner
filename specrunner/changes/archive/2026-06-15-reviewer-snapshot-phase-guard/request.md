# reviewer phase を持たない pipeline では reviewer を job state に snapshot しない — INV-8 の cleanup（fast pipeline 初回 dogfood）

## Meta

- **type**: spec-change
- **slug**: reviewer-snapshot-phase-guard
- **base-branch**: main
- **adr**: false
- **pipeline**: fast

## 背景

#693（pipeline 選択＋汎用 gate）の run 中に cross-boundary-invariants が **INV-8** を上げた: `pipeline: design-only` ＋ リポジトリに custom reviewer 定義（`specrunner/reviewers/*.md`）がある状態だと、`loadReviewerDefinitions` の結果が `jobState.reviewers` に snapshot されるが、design-only は reviewer 工程に到達しないため **「実行されない reviewer が state に残る」記録上の不整合**が生じる（機能影響ゼロ）。この経路は #693 が design-only を Meta から選択可能にして初めて到達可能になった。

人間は escalation に対し **1=2（この request で直す）** を選んだが、resume の運用ミスで修正が実装されず、iter-2 の再レビューが LOW・無害と再分類して approved → **未修正のままマージ**された（記録上は「直す」決定だが実体は未修正、という綻び）。本 request はその決定を**正しい gesture フローで honor し直す**。

加えて本 request は **fast pipeline の初回 dogfood** を兼ねる。INV-8 の cleanup は次の理由で初 fast に最適:

- 修正箇所が `src/core/command/pipeline-run.ts`（＋ descriptor 判定）で、fast の forbidden 3 surfaces（`src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts`）に**触れない** → conformance の scope checkpoint を素通りし、fast を end-to-end で通せる。
- 小さく isolated・ADR 不要・spec/design 深度不要。
- 既に harmless と結論済みなので blast radius がほぼゼロ ＝ 新 pipeline の慣らし運転に最適。

### 現状コードの前提（検証済み・main `44c12d9`）

- snapshot 箇所は `src/core/command/pipeline-run.ts:107`: `if (reviewers.length > 0) { jobState.reviewers = reviewers; }`。**descriptor の reviewer 工程の有無に関係なく** non-empty なら snapshot する（INV-8 の原因）。`reviewers` フィールドは既存（`JobState`、`src/state/schema.ts`）。解決済み `descriptor` は同 `prepare()` 内 snapshot 時点で in-scope（`pipeline-run.ts:90` で `getPipelineDescriptor` 解決）。
- `composeReviewerDescriptor`（`src/core/pipeline/compose-reviewers.ts`）は custom reviewer chain を **CONFORMANCE step の手前**に挿入する（`conformanceIdx = findIndex(name===CONFORMANCE)`、`-1` なら `baseSteps.length` に append）。chain 先頭は `code-review`。design-only は CONFORMANCE も code-review も持たないため末尾 append ＝ **到達不能 zombie**。
- 3 descriptor の reviewer 工程: `standard`・`fast` は `code-review`＋`conformance` を持つ。`design-only` はどちらも無い（`src/core/pipeline/registry.ts`、steps/roles）。
- design-only の transitions は `design→success→end`/`design→error→escalate` のみ（zombie step に到達する遷移なし）。
- gate（#693 `assertRuntimeSupportsScope`）は `permissionScope` の有無から発火。本 request は fast（permissionScope 宣言あり）で走るので、changed-files 導出可能な runtime（local）でのみ着手でき、conformance で 3 surfaces を評価する。

## 要件

最重量の変更を名指しする: **reviewer snapshot を「descriptor が reviewer 工程を持つとき」に限定する guard を `pipeline-run.ts` に追加する**。判定は descriptor capability から導出し、profile 名でハードコードしない。

1. **snapshot を descriptor の reviewer 工程の有無で gate する**
   - `pipeline-run.ts:107` の `if (reviewers.length > 0)` を、**`reviewers.length > 0` かつ「解決した descriptor が reviewer 工程を持つ」** の合成条件にする。
   - 「reviewer 工程を持つ」は **descriptor から導出**するが、述語は **`composeReviewerDescriptor` と同じアンカー = `descriptor.steps` に `CONFORMANCE` が在るか** で判定する。composer は custom reviewer chain を **CONFORMANCE step の手前**に挿入し（`conformanceIdx = findIndex(name === CONFORMANCE)`）、CONFORMANCE が無ければ末尾 append＝到達不能とするため、「custom reviewer が実際に走る」⟺「base descriptor が CONFORMANCE を持つ」。`code-review` の有無で判定しても現3本では偶然一致するが、composer のアンカーは CONFORMANCE なので、`code-review` を述語にすると **guard と composer が別々の「reviewer 工程」概念を持ち将来ズレる**（例: CONFORMANCE 無＋code-review 有で誤判定）。`pipelineId === "design-only"` のような profile 名分岐は作らない（#693 gate の「permissionScope から導出」と同じ筋）。
   - guard は **自前の純粋述語**（例 `descriptorHasReviewerInsertionPoint(d) = d.steps.some(([n]) => n === CONFORMANCE)`）で判定し、**`composeReviewerDescriptor` は touch しない（無改変）**。両者のアンカー概念がズレないことは、shared 関数ではなく **alignment test**（AC 参照。composer の実挙動を観測する形）で封じる ＝ correct-by-test。これにより初回 dogfood の変更面を `pipeline-run.ts` ＋ 純粋ヘルパ ＋ test に最小化する。
   - reviewer 工程を持たない descriptor（design-only）では、reviewer 定義が在っても `jobState.reviewers` を**設定しない**。

2. **既存挙動の不変**
   - `standard` / `fast` は CONFORMANCE（reviewer 挿入アンカー）を持つので従来どおり snapshot（挙動不変）。
   - `reviewers.length === 0` のときは従来どおり未設定。
   - reviewer activation・`composeReviewerDescriptor`・transitions は無改変（snapshot するかどうかだけを変える）。

3. **forbidden surface を踏まない（fast 適格の維持）**
   - 変更は `src/core/command/pipeline-run.ts` ＋ `src/core/pipeline/` の純粋ヘルパ追加 ＋ alignment test に限定し、**`src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` を変更しない**。`reviewers` フィールドの schema は既存のまま（条件付きで set するだけ）。**`composeReviewerDescriptor` も無改変**（drift は alignment test で封じる）。
   - 仮にこれらに触れると、本 request 自身が fast の conformance scope checkpoint で escalation になる（＝ guard が正しく働いている証左でもあるが、設計上は踏まない）。

## スコープ外

- **`reviewers` フィールドの schema 変更**（`src/state/schema.ts`）— フィールドは既存。set するか否かだけを変える。
- **到達可能性の厳密シミュレーション** — transitions を辿って reviewer chain が実際に到達するかまでは見ない。reviewer 工程（chain anchor）の有無という近似で十分（現 3 descriptor を正しく弁別する）。
- **`composeReviewerDescriptor` の zombie step 抑止** — 末尾 append 自体は到達不能で無害。本 request は state への snapshot だけを正す。
- **「正当な記録」request（resume rationale / escalation メトリクス）** — 別 request。本件はその動機例。
- **fast の他の調整 / promote / fixup / magnitude** — いずれも別 request。

## 受け入れ基準

- [ ] `design-only` ＋ reviewer 定義ありで job 生成すると `jobState.reviewers` が**設定されない**（test）
- [ ] `standard` / `fast` ＋ reviewer 定義ありでは従来どおり `jobState.reviewers` が設定される（test、挙動不変）
- [ ] `reviewers.length === 0` では従来どおり未設定（test）
- [ ] snapshot 判定が descriptor capability から導出され、`pipelineId === "design-only"` 等の profile 名ハードコードが無い（test/構造）
- [ ] guard の述語が `descriptor.steps` の `CONFORMANCE` の有無に基づき、`code-review` 等の別概念で判定していない（test/構造）
- [ ] **alignment test** が1本ある（drift 検出）: `PIPELINE_REGISTRY` の各 descriptor について **`composeReviewerDescriptor(d, [fake reviewer])` を実際に呼び、その出力での fake reviewer の配置を観測**する（conformance step より前に挿入された＝reachable か／末尾 append で後続に終端しかない＝zombie か）。その reachable 判定が **guard の snapshot 判定と一致**することを assert する。**アンカー（`conformanceIdx` 等）を test 内で再計算しない** ―― composer の実出力を観測することで、将来 composer の挿入アンカーが変わったら配置が変わり test が落ちる（`X ⟺ X` のトートロジーにしない）。
- [ ] `src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` に変更が無い（＝ fast の conformance scope checkpoint を素通りする条件）
- [ ] reviewer activation・`composeReviewerDescriptor`・transitions が無改変（既存テスト green）
- [ ] `FindingResolution` union は `fixable | decision-needed` のまま
- [ ] `bun run typecheck && bun run test` green、arch 不変条件（B-1〜B-11 ＋ DSM）green

## architect 評価済みの設計判断

- **snapshot 判定は descriptor capability から導出（profile 名でハードコードしない）**: 「reviewer 工程を持つ descriptor だけ reviewer を snapshot する」は scope 宣言の gate（#693）と同じ「descriptor の性質から導出」の筋。design-only を名指しせず、将来 reviewer-less な descriptor が増えても自動で正しく扱える。
- **guard の述語は composer と同じ CONFORMANCE アンカー。composer は無改変 ＋ alignment test で封じる（A: correct-by-test）**: `composeReviewerDescriptor` は custom reviewer chain を CONFORMANCE の手前に挿入し、CONFORMANCE が無ければ末尾 append＝到達不能とする。よって「reviewer が実際に走る」⟺「descriptor が CONFORMANCE を持つ」。guard は自前の純粋述語で同じアンカーを見るが **composer は touch せず**、両者がズレないことは alignment test で固定する。**この alignment test は composer の実出力（`composeReviewerDescriptor` を呼んだ結果の reviewer 配置）を観測する**こと――アンカーを test 内で再計算すると `X ⟺ X` のトートロジーになり drift を検出できないため。`code-review` を述語にすると現3本では偶然一致するが composer とズレ得るので採らない。これは #691 と同型の、述語選択による latent divergence を起票時に潰す判断。
  - **却下 B（shared 関数で correct-by-construction）**: guard と composer が同一ヘルパを参照すれば構造的にズレ得ないが、`composeReviewerDescriptor` をリファクタするため初回 dogfood の変更面（＝慣らし運転の blast radius）が広がる。最小・低リスクを優先し A を採用。将来 composer 周りを触る request が出たら、その時に shared 関数へ寄せてよい。
- **ADR 不要**: INV-8 は #693 の cross-boundary-invariants で既に分析・記録済みで、新たな設計判断を導入しない cleanup。fast は adr-gen を持たないこととも整合。
- **pipeline: fast で走らせる（初回 dogfood）**: bounded・forbidden surface 非接触・ADR 不要・低リスク。fast の scope checkpoint（conformance）と #693 gate を実 run で初めて通す題材として最適。#695 で蒸発した 1=2 を正しい gesture フロー（request issue → `pipeline: fast` → label → crontab）で honor し直す。
- **依存**: #689 / #692 / #693 / #694（fast pipeline）すべてマージ済み（main `44c12d9`）。
