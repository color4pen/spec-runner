# 軽量 fast pipeline profile を追加する — permissionScope を宣言する最初の利用者

## Meta

- **type**: new-feature
- **slug**: fast-pipeline
- **base-branch**: main
- **adr**: true

## 背景

#689（scope 宣言＋超過の機械導出）／#692（評価不能 runtime の fail-closed）／#693（pipeline 選択機構＋汎用 capability gate）で土台は揃った。だが `permissionScope` を宣言する profile はまだ 1 つも無く、機構は inert。

本 request は **最初の利用者** = 軽量 `fast` pipeline を追加し、機構を初めて起動する。`fast` は標準より工程を削った経路だが、削るのは「深さと重複レビュー」であって安全網ではない。**宣言した変更権限（permissionScope）を越えた事実を checkpoint で機械検出し、越えれば正直に止まる**。そして scope を検証できない runtime では #693 の汎用 gate が**着手前に拒否する**（`fast` 固有の分岐ではなく、permissionScope を宣言したことで gate を継承する）。本 request は #689 / #692 / #693 の上に乗る（前2者マージ済み、#693 は先行依存）。

### 現状コードの前提（検証済み）

- registry は `STANDARD_DESCRIPTOR`（`src/core/pipeline/registry.ts:30`）と `DESIGN_ONLY_DESCRIPTOR`（`:83`）の 2 本（`PIPELINE_REGISTRY` `:107`）。descriptor は `id / steps / transitions / startStep / (summaryStep) / reviewerFixerPairs` 等の宣言データ。
- `PermissionScope`（`src/core/pipeline/types.ts:49`）は `checkpoint: string`（**単一**、doc「must be a judge step / verdict を導出する judge 系 step」`:46,50`）＋ `forbidden: ForbiddenSurface[]`。`ForbiddenSurface.paths`（`:34`）は base...HEAD 変更ファイルに当てる **glob denylist**。
- scope 評価は judge/conformance step の verdict 導出前に `computeExtraScopeFindings` が走り（#689）、breach は `deriveJudgeVerdict` → escalation、`canDeriveChangedFiles()===false` は UNKNOWN escalation（#692）。
- #693 が request.md Meta の `pipeline` 選択と、`permissionScope` を持つ descriptor ＋ 非対応 runtime を bootstrap 前に reject する汎用 gate を提供する（**本 request はそれに乗るだけで gate を実装しない**）。
- `canDeriveChangedFiles` は local→`true` / managed→`false`（#692）。

## 要件

最重量の変更を名指しする: **`FAST_DESCRIPTOR`（工程を削った steps）を registry に追加し、それに `permissionScope`（checkpoint=conformance、3 forbidden surfaces）を宣言する**。これにより #689 の checkpoint 検出と #693 の着手前 gate を最初に起動する。既存 profile・既存挙動は不変。

1. **`FAST_DESCRIPTOR` を registry に追加**
   - id = `fast`。steps = `request-review → design → implementer → verification → code-review → conformance → pr-create`。**spec-review / test-case-gen / adr-gen は含めない**。
   - transitions / startStep（`request-review`）/ reviewerFixerPairs（code-review・conformance の reviewer/fixer 対）/ summaryStep は `standard` を範に、削った step を除いて構成（正確な表は design）。
   - `PIPELINE_REGISTRY` に登録。`standard` / `design-only` は無改変。

2. **`fast` に permissionScope を宣言**
   - `checkpoint` = **`conformance`**（単一・judge step。fixer 後の最終 diff が出揃う最後の judge step）。
   - `forbidden` = **3 surfaces**（glob denylist、id 付き）:
     - `public-types` → `src/core/port/**`
     - `persisted-format` → `src/state/schema.ts`
     - `state-transitions` → `src/state/lifecycle.ts`
   - 正確な glob 集合（特に `public-types` の範囲）は design が確定してよいが、上記 3 アンカーを起点とする。**新規トップレベル module / magnitude（大きさ）は forbidden に含めない**（スコープ外参照）。

3. **design は profile=fast の slim 版を残す（landed 決定の encode）**
   - design 成果物は**残す**が fast 用に必須項目を絞る。独立 spec-review は省略。test-case-gen は implementer に統合。
   - **ADR が必要と判断される変更は fast 不適格**とする（slim design 前提と ADR 要求は衝突しやすいため、fast 内で adr-gen を回さず、必要なら standard へ）。

4. **backstop（#689 / #693 を変更しない）**
   - 非対応 runtime での着手前 reject は **#693 の汎用 gate** が担う（`fast` は permissionScope 宣言により継承するだけ。`fast` 固有の gate を作らない）。
   - gate をすり抜けた場合の checkpoint UNKNOWN/breach escalation（#689）は **backstop** として現状のまま維持（本 request では変更しない）。

## スコープ外

- **pipeline 選択機構 ＋ 汎用 capability gate** — #693 の領分（先行依存）。本 request は profile を登録し scope を宣言するのみ。
- **standard へのフォールバック（D）** — pipeline substitution ＋ requested/effective の正直記録で deferred promote と同一 shape。promote request に合流。
- **新規トップレベル module surface** — allowlist 概念で `ForbiddenSurface.paths` の denylist-glob モデルに乗らない。surfaces 1–3 が大構造変更を推移的に捕まえるため drop。
- **magnitude envelope（diff サイズ等での適格判定）** — #688/#689 が実装していない別軸。後回し。
- **自動昇格（fast→standard、mid-run）/ fixup 再入場 / fixup の custom reviewer 再実行** — いずれも別 request。
- **managed に changed-files 導出能力を与える** — 本 request は「評価できないなら gate で止める」であって managed を対応させない。
- **request 意図との意味的対応 / 公開契約の意味的変更の完全検出** — path 粒度の gate の範囲外。引き続き reviewer の semantic finding が担う（#689 の content 粒度 deferral を踏襲）。
- **LLM による fast 自動選択** — 選択は request.md Meta の明示宣言のみ（#693）。

## 受け入れ基準

- [ ] `FAST_DESCRIPTOR` が registry に登録され、steps から spec-review / test-case-gen / adr-gen が除かれている（test）
- [ ] `fast.permissionScope.checkpoint === "conformance"` かつ checkpoint が judge step である（#689 の checkpoint 制約に適合）
- [ ] `fast.permissionScope.forbidden` が 3 surfaces（public-types / persisted-format / state-transitions）を glob で表す（test）
- [ ] `canDeriveChangedFiles()===true`（local）では fast が end-to-end 実行され、conformance checkpoint で 3 surfaces を評価する（test or 実行）
- [ ] `canDeriveChangedFiles()===false`（managed fake）で `fast` を選ぶと **#693 の汎用 gate が bootstrap 前に reject**（job state が作られない）＝`fast` が gate を継承していることを固定（test）
- [ ] design slim: design 成果物は残り、独立 spec-review は fast steps に無く、test-case-gen が implementer に統合されている（test / 構造）
- [ ] `standard` / `design-only` descriptor、`pipeline` 未指定の既定経路、reviewer activation が無変更（既存テスト green）
- [ ] `FindingResolution` union は `fixable | decision-needed` のまま（新 resolution 値なし）
- [ ] `bun run typecheck && bun run test` green、arch 不変条件（B-1〜B-11 ＋ DSM）green

## architect 評価済みの設計判断

- **checkpoint = conformance（単一 judge step）**: fixer 後の最終 diff が出揃う最後の judge step。**却下 code-review**: code-fixer がその後に diff を変えうるため、最終 diff を見るには遅い conformance が適切。`PermissionScope.checkpoint` は単一なので 1 つに決める。
- **3 surfaces のみ、surface 4（新規 module）は drop**: denylist-glob に乗らない allowlist 概念であり、surfaces 1–3（公開型 / 永続形式 / state-transition 表）が大構造変更を推移的に捕まえる。magnitude も別軸として後回し。content 粒度の意味的公開型変更も path gate の範囲外（#689 踏襲）。
- **gate は継承、`fast` 固有の分岐を作らない**: 非対応 runtime の reject は #693 の `permissionScope` 由来の汎用 gate に委ねる。`fast` は scope を宣言することで自動的に net を得る。`pipelineId === "fast"` のような分岐を本 request でも作らない。
- **design は profile=fast の slim 版を残す**: 「全件 design を残してきた一貫性」を崩さず深さだけ圧縮、独立 spec-review を落とす。ADR 必要な変更は fast 不適格（slim 前提と衝突）。
- **`adr: true` は本 request 自身の実行を指す（fast profile の挙動ではない）**: 本 request 自体は pipeline registry と実行契約を変更する構造変更なので **standard pipeline で実行し、ADR を生成する**。追加される **fast profile では ADR 生成を行わない**（ADR 必要な変更は fast 不適格）。「fast request なのに adr:true」という混同を避けるための区別——前者は本 request の*実行経路*、後者は fast profile の*挙動*で、軸が違うため矛盾しない。
- **削るのは深さ・重複レビューであって安全網ではない**: spec-review/test-case-gen/adr-gen を削っても、verification・code-review・conformance（＋ scope checkpoint）は残す。fast は「軽いが net 付き」。
- **依存**: #689（permissionScope / scope-check / checkpoint）＋ #692（`canDeriveChangedFiles` / `RealRuntimeStrategy`）＋ **#693（pipeline 選択 ＋ 汎用 gate、先行依存）**。#693 がマージされてから本 request を着手するのが前提。
