# Design: 軽量 fast pipeline profile を追加する — permissionScope を宣言する最初の利用者

## Context

scope 機構は 3 段で揃っており、いずれもマージ済み:

- #689（scope-exceeded-escalation）: `PipelineDescriptor.permissionScope`（`src/core/pipeline/types.ts:49`）を宣言した profile について、checkpoint judge step で changed-files を禁止面（`ForbiddenSurface.paths` の glob denylist）に突合し、超過を `decision-needed` finding として escalation に載せる。評価は `computeExtraScopeFindings`（`src/core/step/scope-check.ts`）が judge/conformance step の verdict 導出前に走る。
- #692（scope-unevaluable-fail-closed）: changed-files を機械導出できない runtime（managed）では scope を fail-closed に escalation する。`RuntimeStrategy.canDeriveChangedFiles?()`（`src/core/port/runtime-strategy.ts`）が seam メタ情報で local→`true` / managed→`false`、test fake では optional（absent）。
- #693（pipeline-selection-capability-gate）: request.md Meta の `pipeline` 選択（`src/core/command/pipeline-run.ts:88`）と、`permissionScope` を宣言する descriptor を導出不能 runtime で実行しようとしたとき `bootstrapJob` の前に reject する汎用 capability gate（`assertRuntimeSupportsScope`、`src/core/pipeline/runtime-capability-gate.ts`）を提供する。判定は `descriptor.permissionScope !== undefined && runtime.canDeriveChangedFiles?.() === false` の交差で、profile 名では分岐しない。

しかしこの土台には **利用者がいない**。`PIPELINE_REGISTRY`（`src/core/pipeline/registry.ts:107`）には `permissionScope` を宣言する profile が 1 つも無く、#689/#693 の機構は production で inert（発火しない）。

本 request は **最初の利用者** = 軽量 `fast` pipeline を追加し、機構を初めて起動する。`fast` は標準より工程を削った経路だが、削るのは「深さと重複レビュー」（spec-review / test-case-gen / adr-gen）であって安全網ではない。verification・code-review・conformance（＋ scope checkpoint）は残す。

### 検証済みの現状（main の前提）

- registry は `STANDARD_DESCRIPTOR`（`registry.ts:30`、12-step）と `DESIGN_ONLY_DESCRIPTOR`（`registry.ts:83`、1-step）の 2 本。descriptor は `id / steps / transitions / loopName / loopNames / loopFixerPairs / startStep / roles / (summaryStep) / (maxIterations) / (permissionScope)` の宣言データ（`types.ts:61`）。
- `STANDARD_TRANSITIONS`（`types.ts:180`）は遷移テーブル。code-review/code-fixer 部は `buildReviewerChainTransitions(["code-review"])`（`reviewer-chain.ts:143`）で生成。`nextAfterReviewer("code-review", ["code-review"])` は chain 末尾なので `conformance` を返す。
- reverification チョークポイントは `conformanceApprovedLatest` / `codeChangedSinceLastVerification`（`reverification.ts`）を `when` ガードに用いる。
- pipeline 構築は `buildPipeline`（`run.ts:43`）が `new StepExecutor(..., descriptor.permissionScope)`（`run.ts:55`）で permissionScope を executor に注入する。executor は checkpoint step（`conformance` を含む judge/conformance step、`executor.ts:640,659`）で `computeExtraScopeFindings` を呼ぶ。
- `getPipelineDescriptor`（`registry.ts:116`）は未知 id を既知 id 一覧付きで throw する。`getPipelineId`（`src/state/pipeline-id.ts:19`）は absent→`standard` fallback。`JobState.pipelineId` は open な `string`（`src/state/schema.ts:279`、literal union ではない）。
- `composeReviewerDescriptor`（`compose-reviewers.ts:31`）は base を `...base` で spread して custom reviewer を挿入するため、`permissionScope` を保存する。
- 遷移テーブルで `(step, outcome)` に一致する行が無い場合、`pipeline.ts:298` は `transition?.to ?? "escalate"` で **escalate にフォールバック**する（安全側）。
- `PermissionScope.checkpoint` は **単一の step 名**（`types.ts:50`、「must be a judge step」）。`forbidden` は `ForbiddenSurface[]`（各 `id` + `paths: glob[]`）。glob 突合は `matchGlob`（`src/core/reviewers/glob-match.ts`）: `**` は `/` を跨ぐ任意文字列、完全パス指定は厳密一致。
- 既存テストの前提: `tests/unit/core/pipeline/registry-invariants.test.ts` の T-06-3 は「registry が **ちょうど 2 本**」「`permissionScope` 宣言 profile が **0 件**」を固定している。これは #693 時点の inert 前提の encode であり、本 request が意図的に覆す対象（後述 D8）。

## Goals / Non-Goals

**Goals**:

- `FAST_DESCRIPTOR`（id=`fast`、工程を削った steps）を `PIPELINE_REGISTRY` に追加し、`permissionScope`（checkpoint=`conformance`、3 forbidden surfaces）を宣言する。これにより #689 の checkpoint 検出と #693 の着手前 gate を **最初に起動**する。
- `fast` は #693 の汎用 gate を **継承するだけ**（`fast` 固有の分岐を作らない）。導出不能 runtime での着手前 reject は `assertRuntimeSupportsScope` が `permissionScope` の有無から導出する。
- slim design を **構造で encode**する: design 成果物（design step）は残し、独立 spec-review は fast steps から除き、test-case-gen は別 step を持たず implementer に統合する。adr-gen も持たない。
- 既存 profile（`standard` / `design-only`）・既定経路（`pipeline` 未指定）・reviewer activation・`FindingResolution` union を完全に不変に保つ。

**Non-Goals**（request スコープ外を再掲）:

- pipeline 選択機構・汎用 capability gate そのものの実装（#693 の領分。本 request は乗るだけ）。
- standard へのフォールバック（substitution + requested/effective 記録）— promote request に合流。
- 新規トップレベル module surface（surface 4）/ magnitude envelope（diff サイズ判定）。
- 自動昇格（fast→standard, mid-run）/ fixup 再入場 / managed への changed-files 能力付与。
- request 意図との意味的対応・公開契約の意味的（content 粒度）変更の完全検出 — 引き続き reviewer の semantic finding が担う（#689 の content 粒度 deferral 踏襲）。
- 既存 step（design / implementer / verification / code-review / conformance 等）の prompt・振る舞いの変更。

## Decisions

### D1: FAST_DESCRIPTOR の steps — spine 7 + 残存 loop の fixer 2 = 9 entry

`steps`（`[stepName, Step]` の順序付き配列）を以下で構成する。**spine（happy path）は 7 step**、これに残す loop が機能するための fixer 2 step を加える:

| # | step | 由来 | role |
|---|------|------|------|
| 1 | `request-review` | startStep | gate / spec |
| 2 | `design` | creator | creator / spec |
| 3 | `implementer` | creator | creator / impl |
| 4 | `verification` | gate（CLI step） | gate / impl |
| 5 | `build-fixer` | verification の fixer | fixer / impl |
| 6 | `code-review` | reviewer | reviewer / impl |
| 7 | `code-fixer` | code-review の fixer | fixer / impl |
| 8 | `conformance` | acceptance gate ＋ scope checkpoint | gate / impl |
| 9 | `pr-create` | terminal（CLI step） | gate / impl |

**除外する step**（`standard` から削るもの）: `spec-review` / `spec-fixer` / `test-case-gen` / `adr-gen`。

**Rationale**: request 要件の「spine = request-review → design → implementer → verification → code-review → conformance → pr-create」はあくまで進行の幹であり、`verification` ループと `code-review` ループを**実際に自己修復できる安全網**として残すには、対の fixer（`build-fixer` / `code-fixer`）を steps Map に含める必要がある。削る対象は「深さ・重複レビュー」= spec-review（独立仕様レビュー）/ spec-fixer / test-case-gen / adr-gen であって、loop の fixer ではない。Step オブジェクトは既存のもの（`RequestReviewStep` … `PrCreateStep`）をそのまま再利用し、新規 Step は作らない。

**Alternatives considered**:
- build-fixer を落として `verification failed → escalate` にする → 却下。verification が自己修復できなくなり「安全網は削らない」に反する。
- fast 専用の Step（augmented implementer 等）を新設 → 却下（D5）。per-profile の step 分岐は surface を増やし「既存 step 不変」を崩す。

### D2: FAST_TRANSITIONS — `standard` を範に、削った step の行を除去し adr-gen を pr-create に差し替え

遷移テーブルを `STANDARD_TRANSITIONS` の隣（`src/core/pipeline/types.ts`）に `FAST_TRANSITIONS` として定義する。`types.ts` は既に `buildReviewerChainTransitions` / `conformanceApprovedLatest` / `codeChangedSinceLastVerification` / `STEP_NAMES` を import 済みで、遷移テーブルの正規配置場所である（registry.ts は薄い descriptor 組み立てに保つ）。

```
// --- request-review gate（最初の step） ---
{ REQUEST_REVIEW, on: approve,          to: DESIGN }
{ REQUEST_REVIEW, on: needs-discussion, to: escalate }
{ REQUEST_REVIEW, on: reject,           to: escalate }
{ REQUEST_REVIEW, on: error,            to: escalate }
// --- design → implementer（spec-review / test-case-gen を飛ばして直結） ---
{ DESIGN,       on: success, to: IMPLEMENTER }
{ DESIGN,       on: error,   to: escalate }
// --- implementer → verification ---
{ IMPLEMENTER,  on: success, to: VERIFICATION }
{ IMPLEMENTER,  on: error,   to: escalate }
// --- verification loop（reverification チョークポイント含む） ---
{ VERIFICATION, on: passed,    to: PR_CREATE,   when: conformanceApprovedLatest }  // 再検証完了 → 直接 PR
{ VERIFICATION, on: passed,    to: CODE_REVIEW }
{ VERIFICATION, on: failed,    to: BUILD_FIXER }
{ VERIFICATION, on: escalation, to: escalate }
{ BUILD_FIXER,  on: success,   to: VERIFICATION }
{ BUILD_FIXER,  on: error,     to: escalate }
// --- code-review loop（標準と同じ生成器を chain=[code-review] で使用） ---
...buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW])   // code-review approved(clean) → conformance
// --- conformance（acceptance gate ＋ scope checkpoint） ---
{ CONFORMANCE, on: approved,              to: VERIFICATION, when: codeChangedSinceLastVerification }  // 再検証
{ CONFORMANCE, on: approved,              to: PR_CREATE }                                              // adr-gen の代わりに pr-create
{ CONFORMANCE, on: needs-fix:implementer, to: IMPLEMENTER }
{ CONFORMANCE, on: needs-fix:code-fixer,  to: CODE_FIXER }
{ CONFORMANCE, on: needs-fix,             to: IMPLEMENTER }   // legacy 平 needs-fix の catch-all
// （needs-fix:spec-fixer は意図的に無し → 不一致 → escalate。後述）
// --- pr-create（terminal） ---
{ PR_CREATE,   on: success, to: end }
{ PR_CREATE,   on: error,   to: escalate }
```

差分の要点（`STANDARD_TRANSITIONS` 比）:
- `design success → spec-review` を `design success → implementer` に変更（spec-review / test-case-gen を経由しない）。
- spec-review / spec-fixer / test-case-gen / adr-gen に関する全行を削除。
- `verification passed → adr-gen (when reverify)` を `verification passed → pr-create (when reverify)` に、`conformance approved → adr-gen` を `conformance approved → pr-create` に差し替え。
- `code-review` ループ生成は標準と同一（`buildReviewerChainTransitions(["code-review"])`）。chain 末尾なので clean approved は `conformance` に進む。
- reverification ガード 2 本（`conformanceApprovedLatest` / `codeChangedSinceLastVerification`）は保持。順序も保持（`when` 付き行を無条件行の**前**に置く。`transitions.find` は先頭一致のため）。

**`needs-fix:spec-fixer` を持たない理由**: `deriveConformanceVerdict`（`judge-verdict.ts:79`）は finding の `fixTarget` が `spec-fixer` のとき `needs-fix:spec-fixer` を返しうるが、fast には spec 系 fixer ループが無い。この verdict には一致する遷移が無く、`pipeline.ts:298` の `?? "escalate"` で **escalate にフォールバック**する。これは意図した正直な挙動: spec/design レベルの修正が要る変更は fast の slim 前提に合わず、人間にエスカレーションするのが正しい（fast は「軽いが net 付き」。D5 の「ADR 必要な変更は fast 不適格」と同種の判断）。

**Rationale**: 既存の生成器・ガード関数・Step を再利用し、テーブルから不要行を引くだけで構成できる。新しい遷移ロジック・新しい predicate を導入しないため回帰面が最小。

**Alternatives considered**:
- conformance `needs-fix:spec-fixer → implementer` にマップ → 却下。implementer は design.md を編集できない（責任範囲外）ので spec/design 修正を強制できず、不誠実な前進になる。escalate が誠実。

### D3: permissionScope — checkpoint=`conformance`、3 surfaces（glob denylist）

`FAST_DESCRIPTOR.permissionScope` を以下で宣言する:

```
checkpoint: "conformance"
forbidden: [
  { id: "public-types",      paths: ["src/core/port/**"] },
  { id: "persisted-format",  paths: ["src/state/schema.ts"] },
  { id: "state-transitions", paths: ["src/state/lifecycle.ts"] },
]
```

- **checkpoint=`conformance`**: fixer（code-fixer 等）が diff を変え終えた後の**最終 diff が出揃う最後の judge step**。code-review を却下した理由は、code-fixer がその後に diff を変えうるため最終 diff を見るには早すぎるから。`PermissionScope.checkpoint` は単一なので 1 つに決める。`conformance` は executor が checkpoint として認識する judge/conformance step（`executor.ts:640` `isConformanceStep`）であり、#689 の checkpoint 制約（judge step であること）を満たす。
- **glob 集合の確定**:
  - `public-types` → `src/core/port/**`。Ports & Adapters の公開インターフェース境界（`src/core/port/` 配下）全体を 1 glob で覆う。`matchGlob` の `**`→`.*` 展開により `src/core/port/runtime-strategy.ts` 等の直下ファイルも捕捉する。
  - `persisted-format` → `src/state/schema.ts`（永続化される JobState スキーマ。厳密ファイル一致）。
  - `state-transitions` → `src/state/lifecycle.ts`（state-transition 表。厳密ファイル一致）。
- **surface 4（新規トップレベル module）を入れない**: それは「許可リスト」概念で `ForbiddenSurface.paths` の denylist-glob モデルに乗らない（スコープ外）。surfaces 1–3（公開型 / 永続形式 / state-transition 表）が大構造変更を**推移的に**捕まえるため十分。magnitude（大きさ）も別軸として後回し。content 粒度の意味的公開型変更は path gate の範囲外で、引き続き reviewer の semantic finding が担う（#689 踏襲）。

**Rationale**: これら 3 アンカーは「軽い変更経路で勝手に触られると影響が広い構造境界」。fast を選んだ変更がこれらに触れたら、conformance で機械検出され `decision-needed` finding（origin:"scope"）→ escalation となり「正直に止まる」。

**Alternatives considered**:
- checkpoint=code-review → 却下（上記）。
- 個別 port ファイルを列挙 → 却下。`src/core/port/**` の 1 glob で境界全体を簡潔かつ将来追加ファイルも含めて覆える。

### D4: gate は継承する — `fast` 固有の分岐を作らない

非対応 runtime（`canDeriveChangedFiles?.() === false`、managed）で `fast` を選んだときの着手前 reject は、#693 の `assertRuntimeSupportsScope`（`pipeline-run.ts:90` で `bootstrapJob` の前に呼ばれる）が `FAST_DESCRIPTOR.permissionScope !== undefined` から自動的に発火させる。本 request は registry に `fast` を登録し scope を宣言する**だけ**で、`pipelineId === "fast"` のような分岐を `pipeline-run.ts` にも gate にも一切追加しない。

**Rationale**: 「scope を宣言することの性質」を gate が表現しているので、`fast` は宣言だけで net を得る。これにより将来の scope 宣言 profile も登録だけで gate（＋ #689 checkpoint backstop）を継承する。gate をすり抜けても #689 の checkpoint UNKNOWN/breach escalation が backstop として効く（本 request では #689/#693 を変更しない）。

**Alternatives considered**:
- `pipeline-run.ts` に `if (pipelineId === "fast") …` を追加 → 却下。受け入れ基準・architect 判断で明示的に禁止。拡張のたびに gate を触る負債になる。

### D5: slim design は構造で encode、test-case-gen は implementer に統合（prompt 変更なし）

- **design 成果物は残す**: `design` step を fast steps に含める。design は従来どおり design.md / tasks.md / spec.md を書く（共有 `DesignStep` を再利用、prompt 不変）。fast が落とすのは「design 成果物」ではなく「独立 spec-review ループの深さ」。
- **独立 spec-review を省略**: fast steps に `spec-review` / `spec-fixer` を持たない。design 後は直接 implementer に進む。
- **test-case-gen を implementer に統合**: fast steps に独立した `test-case-gen` step を持たない。impl-phase の creator である `implementer`（既存の `ImplementerStep`、責任範囲に「source code, tests」を含む）がテストも生成する。test-case-gen が持っていた「テストシナリオ生成」の責務は implementer の remit に畳み込まれる。**`ImplementerStep` の prompt は変更しない**（共有 step ゆえ変更すると standard に波及するため）。「統合」は構造的に満たす: fast に test-case-gen step が無く、implementer が impl-phase でテストを書く creator として存在する。
- **adr-gen を持たない / ADR 必要な変更は fast 不適格**: fast steps に `adr-gen` を含めない。ADR が必要と判断される変更は slim design 前提と衝突するため fast 不適格とし、必要なら standard を選ぶ。

> 注: 「`adr: true`」は**本 request 自身の実行**を指す（pipeline registry と実行契約を変える構造変更なので standard pipeline で実行し ADR を生成する）。追加される **fast profile の挙動**とは軸が違い、fast profile では ADR 生成を行わない。ADR の具体的な path / ファイル名はここに記載せず、生成は adr-gen step に委ねる。

**Rationale**: 「全件 design を残してきた一貫性」を崩さず深さだけ圧縮する。step を新設せず既存 step の取捨だけで構成することで、回帰面と per-profile 分岐を最小化する。

**Alternatives considered**:
- fast 専用 implementer に「テスト生成」を明記した prompt を持たせる → 却下。共有 `ImplementerStep` を変えると standard に波及し、別 step を新設すると surface が増える。implementer の既存責任範囲（tests を書く）で統合は満たされる。

### D6: roles — spec 相に reviewer が無いのは design-only と同じ前例で許容

`roles` は D1 表のとおり（request-review: gate/spec, design: creator/spec, implementer: creator/impl, verification: gate/impl, build-fixer: fixer/impl, code-review: reviewer/impl, code-fixer: fixer/impl, conformance: gate/impl, pr-create: gate/impl）。

`types.ts:82` の doc「各 phase に creator と reviewer がちょうど 1 つ」は fast の spec 相（request-review + design のみ、reviewer 無し）では満たされないが、これは:
- **machine-enforced ではない**: `pipeline-roles.test.ts` の TC-002 は `STANDARD_DESCRIPTOR` に限定した assertion で、registry 全体を走査しない。`DESIGN_ONLY_DESCRIPTOR`（design のみ、reviewer 無し）が既に creator-only の spec 相を持つ前例。
- **resume に影響しない**: `resolveResumeStep`（`resolve-step.ts`）は step 名の membership だけを見て roles を読まない。

したがって fast の creator-only spec 相は安全。design-only の前例に倣う。

### D7: loopName / loopNames / summaryStep（進行表示・要約。cosmetic）

- `loopNames`: `[verification, code-review, conformance]`（standard から spec-review を除いた残りの loop step）。
- `loopName`（`[iter N/M]` の primary 進行表示）: `code-review`（fast の主要レビューループ）。
- `summaryStep`（`pipeline:summary` イベント）: `code-review`。`printPipelineFinished` は `summaryStep` が steps に在るときだけ emit するため安全。

これらは stdout の進行・要約表示にのみ影響し、遷移・受け入れ基準には影響しない（cosmetic）。制約は `loopName ∈ loopNames` かつ `summaryStep ∈ steps` のみ。

### D8: 既存 registry 不変テストの「flip」を明示する — standard/design-only 不変とは別

`registry-invariants.test.ts` の T-06-3 は #693 時点で「registry が**ちょうど 2 本**」「`permissionScope` 宣言 profile が **0 件**（gate は production-inert）」を固定していた。本 request はこの **inert 前提を意図的に覆す**ため、この 2 つの assertion は更新が必要:
- 「ちょうど 2 本」→ `standard` / `design-only` / `fast` の **3 本**（3 者を含むことを固定）。
- 「scope 宣言 profile 0 件」→ **`fast` ちょうど 1 件が `permissionScope` を宣言し、`standard` / `design-only` は宣言しない**。

これは受け入れ基準「`standard` / `design-only` descriptor … が無変更（既存テスト green）」とは**別物**である。後者は standard / design-only の **descriptor 内容と挙動**が不変という意味で、`registry-invariants` の cardinality / inertness 不変条件はまさに本 request が起動する対象。実装者はこの 2 テストを更新すること（放置すると赤になる）。一方、`scope-escalation.test.ts` の T-01（STANDARD/DESIGN_ONLY が permissionScope を持たない）・T-08（FindingResolution union）や `pipeline-run-gate.test.ts`（standard/design-only の存在チェックのみで cardinality は固定しない）は **無変更で green** のままであることを確認する。

## Risks / Trade-offs

- [fast の遷移テーブルに spec-fixer 行が無く、conformance が `needs-fix:spec-fixer` を返すと escalate する] → 意図した挙動（D2）。fast は spec レベルの修正を要する変更には不適格で、その場合の escalation は「正直に止まる」設計どおり。テストで `needs-fix:implementer` / `needs-fix:code-fixer` routing を固定し、spec-fixer routing が**無い**ことも構造で確認する。
- [build-fixer / code-fixer を steps に含め忘れると loop が機能しない] → D1 の 9-entry を厳守。テストで steps Map に両 fixer が在ることを固定する。
- [既存 registry 不変テストの放置で赤になる] → D8 で明示。実装タスク（T-07）に更新を含める。
- [loopName / summaryStep を loop でない step にすると進行表示が壊れる] → D7 の制約（`loopName ∈ loopNames`、`summaryStep ∈ steps`）を満たす。
- [`src/core/port/**` glob が意図より広く/狭く当たる] → `matchGlob` の `**`→`.*` 展開を前提に、`src/core/port/` 配下の任意ファイルに当たり配下外には当たらないことをテストで固定する（`deriveScopeBreach` 経由 or `matchGlob` 直）。
- [managed end-to-end で fast を選べてしまう] → #693 gate が着手前に reject する。本 request はそれを継承するだけで、`fast` を managed 対応にはしない。

## Open Questions

- なし。設計分岐は D1–D8 で確定。standard フォールバック・surface 4・magnitude・自動昇格はいずれも明示的にスコープ外（別 request）。
