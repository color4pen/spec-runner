# Design: reviewer 工程を持たない pipeline では reviewer を job state に snapshot しない（INV-8 cleanup）

## Context

custom reviewer 機構と pipeline 選択機構は次の前提で揃っている（いずれもマージ済み、main `44c12d9` で読解検証済み）:

- job 開始時、`loadReviewerDefinitions` が `specrunner/reviewers/*.md` を読み込み、`validateReviewerDefinitions` を通った定義を `ReviewerSnapshot[]` に写し、`pipeline-run.ts:107` で **non-empty なら無条件に** `jobState.reviewers` へ snapshot する（`if (reviewers.length > 0) { jobState.reviewers = reviewers; }`）。この snapshot は resume で参照され、実行中の `reviewers/` 変更が走行中の job に影響しないことを保証する。
- `composeReviewerDescriptor`（`src/core/pipeline/compose-reviewers.ts`）は custom reviewer chain（先頭 `code-review`）＋ regression-gate を **CONFORMANCE step の手前**に挿入する。挿入位置は `conformanceIdx = baseSteps.findIndex(([name]) => name === CONFORMANCE)` で求め、CONFORMANCE が無ければ `insertIdx = baseSteps.length`（末尾 append）になる。
- `PIPELINE_REGISTRY`（`src/core/pipeline/registry.ts`）の 3 descriptor の reviewer 工程: `standard` と `fast` は `code-review` ＋ `conformance` を持つ。`design-only` はどちらも持たず、transitions も `design→success→end` / `design→error→escalate` のみ（reviewer 工程へ至る遷移が存在しない）。
- `#693` の capability gate（`assertRuntimeSupportsScope`）は `descriptor.permissionScope` の有無から発火する。`fast` は permissionScope を宣言するため、changed-files を導出できる runtime（local）でのみ着手でき、conformance で 3 forbidden surfaces を評価する。

この土台に **INV-8** の綻びがある。`#693` が `design-only` を request.md Meta から選択可能にして初めて到達可能になった経路で、`pipeline: design-only` ＋ リポジトリに custom reviewer 定義がある状態だと、`jobState.reviewers` に snapshot が載るが、`design-only` は reviewer 工程（chain 挿入アンカー）を持たないため `composeReviewerDescriptor` は reviewer chain を**末尾 append（到達不能 zombie）**にする。結果、**「実行されない reviewer が state に残る」記録上の不整合**が生じる。機能影響はゼロ（reviewer は実際には走らない）だが、state が「走るはずだったが走らなかった reviewer」を抱える綻びである。

本 request はその綻びを正す。最重量の変更は **reviewer snapshot を「解決した descriptor が reviewer 工程を持つとき」に限定する guard を `pipeline-run.ts` に入れる**ことである。`descriptor` は同 `prepare()` 内 `pipeline-run.ts:89`（`getPipelineDescriptor` 解決）で snapshot 時点に in-scope。`reviewers` フィールドの schema（`src/state/schema.ts:314`）は既存で、set するか否かだけを変える。

加えて本 request は **fast pipeline の初回 dogfood** を兼ねる。修正面が `src/core/command/pipeline-run.ts` ＋ `src/core/pipeline/` の純粋ヘルパ ＋ test に閉じ、fast の forbidden 3 surfaces（`src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts`）に触れないため、conformance の scope checkpoint を素通りでき、fast を end-to-end で通せる。小さく isolated・ADR 不要・既に harmless と結論済みで blast radius がほぼゼロ ＝ 新 pipeline の慣らし運転に最適。

## Goals / Non-Goals

**Goals**:

- reviewer snapshot を **「解決した descriptor が reviewer 工程を持つ」** とき（かつ `reviewers.length > 0`）に限定する。判定は descriptor capability から導出し、profile 名（`pipelineId === "design-only"` 等）でハードコードしない。
- 「reviewer 工程を持つ」述語は **composer と同じアンカー = `descriptor.steps` に `CONFORMANCE` が在るか** で判定する。`code-review` 等の別概念で判定しない。
- `design-only`（reviewer 工程なし）では reviewer 定義が在っても `jobState.reviewers` を設定しない。`standard` / `fast`（CONFORMANCE 保持）では従来どおり設定する（挙動不変）。`reviewers.length === 0` では従来どおり未設定。
- guard は **自前の純粋述語**で判定し、`composeReviewerDescriptor` は無改変とする。guard と composer のアンカー概念がズレないことは **alignment test**（composer の実出力を観測）で封じる（correct-by-test）。
- 変更面を `src/core/command/pipeline-run.ts` ＋ `src/core/pipeline/` の純粋ヘルパ追加 ＋ test に最小化し、forbidden 3 surfaces を踏まない（fast 適格の維持＝初回 dogfood の blast radius 最小）。

**Non-Goals**:

- **`reviewers` フィールドの schema 変更**（`src/state/schema.ts`）— フィールドは既存。set するか否かだけを変える。
- **到達可能性の厳密シミュレーション** — transitions を辿って reviewer chain が実際に到達するかまでは見ない。reviewer 工程（chain 挿入アンカー）の有無という近似で十分（現 3 descriptor を正しく弁別する）。
- **`composeReviewerDescriptor` の zombie step 抑止** — 末尾 append 自体は到達不能で無害。本 request は state への snapshot だけを正す。
- **「正当な記録」request（resume rationale / escalation メトリクス）** — 別 request。本件はその動機例。
- **fast の他の調整 / promote / fixup / magnitude** — いずれも別 request。

## Decisions

### D1: reviewer snapshot を descriptor の reviewer-stage capability で gate する（profile 名でハードコードしない）

`pipeline-run.ts:107` の条件を `reviewers.length > 0` から **`reviewers.length > 0` かつ「解決した descriptor が reviewer 工程を持つ」** の合成条件に変える。`descriptor`（`:89` で `getPipelineDescriptor(pipelineId)` 解決済み）は snapshot 時点で in-scope。reviewer 工程を持たない descriptor では reviewer 定義が在っても snapshot を設定しない。

**Rationale**: 「reviewer 工程を持つ descriptor だけ reviewer を snapshot する」は、`#693` の capability gate が「descriptor の性質（permissionScope の有無）から導出し profile 名で分岐しない」のと同じ筋。`design-only` を名指しせず、将来 reviewer-less な descriptor が増えても登録だけで自動的に正しく扱える。snapshot は state の事実であり、descriptor の性質に従属させるのが正しい従属方向。

**Alternatives considered**:
- `pipelineId === "design-only"` 等の profile 名分岐 → 却下。`#693` gate の設計（descriptor 性質から導出）に逆行し、将来の reviewer-less descriptor を都度ハードコードする負債になる。
- snapshot を常に設定し、消費側（compose / resume）で「reviewer 工程が無ければ無視」する → 却下。state に「走らない reviewer」が残る不整合を温存し、INV-8 を本質的に解消しない。snapshot を作る側で正すのが根本。

### D2: guard の述語は composer と同じ CONFORMANCE アンカー（`descriptor.steps` の CONFORMANCE 有無）

述語は `descriptor.steps.some(([name]) => name === CONFORMANCE)` とする。`composeReviewerDescriptor` は custom reviewer chain を CONFORMANCE step の手前に挿入し（`conformanceIdx = findIndex(name === CONFORMANCE)`）、CONFORMANCE が無ければ末尾 append＝到達不能とするため、「custom reviewer が実際に走る」⟺「base descriptor が CONFORMANCE を持つ」が成り立つ。

**Rationale**: composer の挿入アンカーは CONFORMANCE であり、reviewer が reachable かどうかを決めているのは CONFORMANCE の有無である。guard が同じアンカーを見れば、両者の「reviewer 工程」概念が一致する。`code-review` の有無で判定しても現 3 本では偶然一致するが、composer のアンカーは CONFORMANCE なので、`code-review` を述語にすると **guard と composer が別々の「reviewer 工程」概念を持ち将来ズレる**（例: CONFORMANCE 無＋code-review 有の descriptor が増えると、guard は snapshot するが composer は zombie 化＝再び INV-8 が再発する）。`#691` と同型の、述語選択による latent divergence を起票時に潰す判断。

**Alternatives considered**:
- `code-review` の有無で判定 → 却下。composer のアンカー（CONFORMANCE）と別概念で、現 3 本では偶然一致するが将来ズレ得る。
- `roles` から `reviewer` / `custom-reviewer` phase の有無を導出 → 却下。composer の実挙動を決めるのは `steps` の CONFORMANCE であり、`roles` は別の派生情報。composer が見るアンカーと同じものを見るのが drift を最小化する。

### D3: 純粋ヘルパは新モジュールに置き、composer は無改変（A: correct-by-test、B: 却下）

guard の述語を `src/core/pipeline/reviewer-capability.ts`（新規・純モジュール）に `descriptorHasReviewerInsertionPoint(descriptor)` として置く。`composeReviewerDescriptor` は touch しない。guard と composer がズレないことは shared 関数（correct-by-construction）ではなく **alignment test**（correct-by-test）で固定する。

**Rationale**: 初回 fast dogfood の変更面（＝慣らし運転の blast radius）を最小化することが最優先。新ファイルにすることで `compose-reviewers.ts` が byte 単位で無改変になり、「composeReviewerDescriptor 無改変」が diff で自明に検証できる。guard を別純関数にすることで `pipeline-run.ts` のロジックを汚さず単体検証できる（`runtime-capability-gate.ts` の前例どおり）。

**Alternatives considered（却下 B: shared 関数で correct-by-construction）**: guard と composer が同一ヘルパ（CONFORMANCE アンカーを返す関数）を参照すれば構造的にズレ得ない。しかし `composeReviewerDescriptor` をリファクタして挿入アンカー算出を共有関数へ抽出する必要があり、初回 dogfood の変更面が composer まで広がる（既存 compose-reviewers テストへの波及リスク）。最小・低リスクを優先し A を採用。将来 composer 周りを触る request が出たら、その時に shared 関数へ寄せてよい（移行は後方互換）。

### D4: alignment test は composer の実出力を観測する（X⟺X トートロジーを避ける）

alignment test は `PIPELINE_REGISTRY` の各 descriptor について **`composeReviewerDescriptor(d, [fake reviewer])` を実際に呼び、その出力での fake reviewer の配置を観測**する。観測した reachable 判定が guard の述語（`descriptorHasReviewerInsertionPoint`）と一致することを assert する。

reachable の観測は **アンカー（`conformanceIdx` 等）を test 内で再計算せず**、composer の実出力から導く: composed descriptor の `steps` 列で fake reviewer の index を取り、その後ろに **base descriptor 由来の step が 1 つ以上続くか** を見る。
- 続く（standard / fast）→ fake reviewer は CONFORMANCE の手前に挿入され、後段に base step（conformance 等）が残る ＝ **reachable**。
- 続かない（design-only）→ fake reviewer ＋ gate が末尾に append され、後続に base step が無い ＝ **zombie**。

**Rationale**: アンカーを test 内で再計算すると「guard が CONFORMANCE を見る ⟺ test が CONFORMANCE を見る」の `X ⟺ X` トートロジーになり、composer がアンカーを変えても test が落ちず drift を検出できない。composer の実出力（reviewer の配置）を観測すれば、将来 composer の挿入アンカーが変わったら配置が変わり、guard 述語との一致が崩れて test が落ちる。「fake reviewer の後ろに base step が続くか」という token 非依存の観測にすることで、CONFORMANCE という語を観測側で使わず、guard 述語と観測が独立であることを担保する。これが drift を検出する非トートロジー条件。

**Alternatives considered**:
- test 内で `findIndex(CONFORMANCE)` を再計算して比較 → 却下。`X ⟺ X` トートロジーで drift を検出できない。
- composed transitions を辿って reviewer の到達可能性を厳密シミュレーション → 却下（スコープ外）。chain 挿入アンカーの近似で現 3 descriptor を正しく弁別でき、observation も単純に保てる。

### D5: forbidden 3 surfaces 非接触で fast 適格を維持する

変更は `src/core/command/pipeline-run.ts` ＋ `src/core/pipeline/reviewer-capability.ts`（新規純ヘルパ）＋ test に限定し、`src/core/port/**` / `src/state/schema.ts` / `src/state/lifecycle.ts` を変更しない。`reviewers` フィールドの schema は既存のまま（条件付きで set するだけ）。

**Rationale**: 本 request は fast の初回 dogfood であり、fast の scope checkpoint（conformance）と `#693` gate を実 run で初めて通す題材。forbidden surface 非接触は fast 適格の条件であり、blast radius をほぼゼロに保つ。仮にこれらに触れると本 request 自身が conformance scope checkpoint で escalation になる（guard が正しく働く証左でもあるが、設計上は踏まない）。

**Alternatives considered**:
- `reviewers` フィールドを「reviewer 工程を持つ pipeline でのみ有効」と schema レベルで表現 → 却下（スコープ外＋forbidden surface 接触）。schema 変更は不要で、set するか否かの制御で十分。

## Risks / Trade-offs

- [guard 述語と composer のアンカーが将来ズレて INV-8 が再発する] → D4 の alignment test で「composer 実出力の reachable 判定 ⟺ guard 述語」を全 descriptor について固定。composer がアンカーを変えれば test が落ちる。
- [chain 挿入アンカーの近似が、厳密な到達可能性とズレる descriptor が将来現れる] → 現 3 descriptor は正しく弁別。厳密シミュレーションは明示的にスコープ外（Non-Goals）。将来 reviewer 工程の形が増えるなら、その request で近似の妥当性を再評価する。
- [意図せず forbidden surface に触れて fast の conformance で escalation する] → 変更面を pipeline-run.ts ＋ 新規純ヘルパ ＋ test に限定（D5）。`reviewers` schema は無改変。diff で forbidden surface 無変更を確認する受け入れ基準を置く。
- [behavioral test の mock（loadReviewerDefinitions / validateReviewerDefinitions）が脆い] → `pipeline-run-gate.test.ts` の確立した mock パターン（loadReviewerDefinitions を vi.mock）に倣い、validate も no-op mock して snapshot gating の検証に隔離する。

## Open Questions

- なし（設計分岐は D1–D5 で確定。述語アンカー＝CONFORMANCE、composer 無改変＋alignment test、forbidden surface 非接触はいずれも確定）。
