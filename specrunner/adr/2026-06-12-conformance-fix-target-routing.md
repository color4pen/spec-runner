# ADR-20260612: conformance needs-fix の戻り先を findings 駆動で 3 方向分岐する

## ステータス

accepted

## コンテキスト

前 ADR `2026-06-03-conformance-review-acceptance-gate` の D1 では「conformance には fix 分類がない（一律 implementer 戻し）」と決定し、A2 では「routing 分岐は判断場面を増やす」として却下していた。

しかしその後の運用（issue #561 / #560）で、conformance の findings は性質が混在することが判明した。「spec 自体の漏れ」を implementer に戻しても implementer は spec を直せず 2 回空振りした。conformance が発見する不適合は以下の 3 種に分類できる：

- **spec / design の誤り**：下流の実装・テスト・コード修正をすべて無効化する。spec-fixer で修正する必要がある。
- **実装の欠落 / design decision 未反映**：再実装で解消できる。implementer に戻す。
- **局所的なコード不適合**：再コード修正で解消できる。code-fixer に戻す。

一律 implementer 戻しを維持すると、spec の誤りが残置したまま再走が繰り返され、loop exhaustion → escalate でしか収束しない。

また、routing の分岐に際して以下の設計上の制約がある：

- **R7 契約**：verdict の最終導出は CLI が担い、agent の自己申告を直接 routing に使わない（`src/core/step/judge-verdict.ts` の `deriveJudgeVerdict`）。
- **遷移表は `(step, outcome)` キー**（`pipeline.ts:295-298`）。`StepOutcome.verdict` は `Verdict | string | null` であり、閉じた union を拡張しなくても任意文字列 outcome を扱える。
- **conformance は paired fixer を持たない loop step**。`CONFORMANCE_RETRIES_EXHAUSTED` が唯一の収束予算。

## 決定

### D1: conformance findings に `fixTarget` を付与し、conformance 専用 report tool を導入する

`src/kernel/report-result.ts` に `FixTarget = "implementer" | "code-fixer" | "spec-fixer"` を追加し、`Finding` に optional `fixTarget?: FixTarget` を追加する。`src/core/step/report-tool.ts` に conformance 専用の `CONFORMANCE_REPORT_TOOL` を新設し、findings schema に `fixTarget` を含める。他 judge step（spec-review / code-review / request-review / custom reviewers）は `fixTarget` を広告しない。

`fixTarget` を base `Finding` の optional にするのは `parseFindings` を 1 本に保つため（DRY）。capture と利用を分離し、利用は conformance 限定に封じ込める。

**採用理由**: executor は reportTool の identity で conformance を spec-review と区別でき（`executor.ts:617`）、専用導出に分岐できる。`fixTarget` を conformance にだけ広告することでスコープを封じ込める。

**却下案**:
- `fixTarget` を base Finding の必須フィールドにする → 他 judge step に無意味なフィールドを強制し schema が汚れる。却下。
- conformance 専用の `parseConformanceFindings` を別実装 → `parseFindings` と二重管理になり drift の温床。却下。

### D2: CLI が `fixTarget` を集約して戻り先付き verdict を導出する（R7 維持）

`src/core/step/judge-verdict.ts` に純関数 `deriveConformanceVerdict` を追加する。`deriveJudgeVerdict` を再利用して `approved | needs-fix | escalation` を得た後、`needs-fix` 時は needs-fix を惹起した findings（severity `critical | high`）の `fixTarget`（省略時 `implementer`）を集約し、優先則 **`spec-fixer > implementer > code-fixer`** で 1 つの戻り先を選んで `needs-fix:<target>` を返す。

**優先則の根拠**: spec の誤りは下流（test・実装・コード修正）をすべて無効化するため最優先。実装の欠落は再実装で解消し verification → code-review を再走する。コード不適合は最も局所的。混在時に「最も広い修正範囲」の戻り先を選ぶことで、狭い修正に倒して spec 誤りが残置するリスクを回避する。

**R7 維持の根拠**: agent は finding ごとに「問題の性質」を `fixTarget` としてラベル付けするだけで、routing の決定（集約・優先則・verdict 文字列化）は CLI の純関数が握る。agent の宣言値が直接 outcome になる経路は作らない。

**却下案**:
- agent が outcome 値（`needs-fix:implementer` 等）を直接宣言する → verdict 導出を CLI が持つ R7 契約と矛盾する。outcome 値の分割自体は採用するが、値は CLI が findings から導出する。却下。

### D3: 遷移表に 3 エントリを追加し、旧 `needs-fix` は残置する

`STANDARD_TRANSITIONS` の conformance 区画に以下を追加する：
- `{ CONFORMANCE, on: "needs-fix:spec-fixer", to: SPEC_FIXER }`
- `{ CONFORMANCE, on: "needs-fix:implementer", to: IMPLEMENTER }`
- `{ CONFORMANCE, on: "needs-fix:code-fixer", to: CODE_FIXER }`
- 旧 `{ CONFORMANCE, on: "needs-fix", to: IMPLEMENTER }` は **残置**（後方互換）

戻り先 step の後続遷移は新設しない。`spec-fixer → spec-review`、`implementer → verification`、`code-fixer → conformance`（`buildReviewerChainTransitions` 供給）の既存遷移が引き受ける。

**残置の根拠**: 新しい conformance run は常に `needs-fix:<target>` を産出するため通常は plain `needs-fix` は出ない。しかし旧 history の resume・将来の fallback 経路が plain `needs-fix` を lookup に流す可能性がある。残置すれば `transition?.to ?? "escalate"` の escalate 落ちを防ぎ、歴史的既定（implementer）へ解決する。既存テスト（TC-070/071）も無変更 green のまま。

**却下案**:
- plain `needs-fix` を削除（置換）→ 旧 history resume と既存テストが escalate 落ちする可能性。後方互換要件に反する。却下。

### D4: 戻り先 step への conformance findings 注入（state-based + entry 検出）

`src/core/step/fixer-helpers.ts` に純関数 `getConformanceFixContext(state, stepName)` を追加し、「この step が今 conformance の戻り先として入場したか」を判定する。判定条件：

1. 最新 conformance run の verdict が `needs-fix:<stepName>` 形である。
2. **recency 判定**：最新 conformance run の `endedAt` が、この step の通常前駆 step の最新 run の `endedAt` より新しい。

条件を満たす場合のみ conformance findings を返す。各戻り先 step の `buildMessage` で非 null のとき findings を埋め込む。

**recency 判定が必要な理由**: conformance verdict は次の conformance run まで `needs-fix:spec-fixer` のまま残る。`conformance → spec-fixer → spec-review →（needs-fix）→ spec-fixer` の二巡目では spec-fixer は spec-review から入場しており、spec-review findings を使うべきである。verdict-target 一致のみでは両者を区別できない。

**却下案**:
- file-based `enrichContext` で conformance-result.md を実読み → `enrichContext` が state を持たず entry 条件を判定できない。prose の再 parse も必要で構造化 findings を失う。却下。
- verdict-target 一致のみで判定 → 二巡目で stale な conformance findings を誤注入する。却下。

### D5: 単一収束予算（CONFORMANCE_RETRIES_EXHAUSTED）への統一と二重カウント解消

conformance の `loopIters["conformance"]` が唯一の収束予算。`pipeline.ts:387-393` の打ち切り判定は `needs-fix:<target>` でも従来どおり発火する。

**二重カウント解消**：`pipeline.ts` の reset ブロックの後・exhaustion 判定の前に、`nextStep` が fixer かつ `currentStep === CONFORMANCE` のとき、`fixerIters[nextStep]` と対応 review の `loopIters[pairedReview]` を 0 にリセットする。これにより：
- code-fixer 経路で `CODE_REVIEW_RETRIES_EXHAUSTED` を誤発火しない。
- spec-fixer 経路で `SPEC_REVIEW_RETRIES_EXHAUSTED` を誤発火しない。

**根拠**: 既存 reset（`pipeline.ts:365-380`）は「loop step への非 paired-fixer 入場」のみを fresh episode 化する。conformance は fixer に直接入場するため既存 reset を素通りし、内側 fixer/loop カウンタが run 内で累積する。conformance 起点の fixer 入場を同型の fresh episode として扱うことで、唯一の打ち切り予算を conformance カウンタに一本化する。

**却下案**:
- conformance を `loopFixerPairs` に登録して専用 fixer を与える → conformance 自身のカウンタ意味論（生涯カウンタ = 全 phase 再実行の termination guarantee）が壊れる。TC-071 が崩れる。却下。
- 内側 loop の予算リセットをしない → 単一 run 内で内側 loop が先に exhaust し `CONFORMANCE_RETRIES_EXHAUSTED` を覆い隠す。却下。

## 検討した代替案

### A1: agent が outcome 値（`needs-fix:implementer` 等）を直接宣言する

issue 本文の原案。agent が report_result の approved フィールドや専用フィールドで routing 先を直接指定する。

- **Pros**: 実装がシンプル。CLI 側に集約ロジックが不要。
- **Cons**: verdict 導出を CLI が持つ R7 契約と矛盾する。agent の自己申告が routing を直接決める経路を新設してしまう。agent が誤った outcome 値を宣言しても CLI が検証できない。
- **Why not**: outcome 値の分割自体は採用するが、値は CLI が findings から導出する。`fixTarget` を finding のラベルに留め、集約・優先則・verdict 文字列化は CLI 純関数が担うことで R7 契約を維持する。

### A2: 戻り先ごとに新しい後続遷移を定義する

`conformance → spec-fixer` 遷移に加えて `spec-fixer（conformance 起点）→ conformance` 等、conformance 起点専用の後続遷移を遷移表に追加する案。

- **Pros**: routing の全経路が遷移表に明示され、見通しが良くなる。
- **Cons**: 遷移表は `(step, outcome)` キーであり、「同じ step の異なる入場文脈」を表現できない。戻り先 step の既存遷移（`spec-fixer → spec-review`、`implementer → verification`）と重複定義になり drift の温床になる。
- **Why not**: 遷移表の構造上、戻り先 step の完了後フローは各 step の既存遷移が自然に引き受ける。重複定義は不要であり追加しない。

### A3: file-based `enrichContext` で conformance-result.md を実読みして findings を注入する

`build-fixer.ts` の `enrichContext` パターンを流用し、conformance-result.md ファイルを実読みして戻り先 step の dynamicContext に注入する案。

- **Pros**: 既存の `enrichContext` パターンを再利用でき、新規 seam が不要。
- **Cons**: `enrichContext` は `(dynamicContext, cwd, slug)` 署名で state を受け取らないため、「conformance 起点入場か否か」の条件分岐（state 依存）を表現できない。prose の再 parse が必要で構造化 findings（`fixTarget` 含む）を失う。
- **Why not**: state-based 注入（`getConformanceFixContext`）を採用し、entry 条件判定（recency 判定）と構造化 findings の受け渡しを両立する。

### A4: conformance を `loopFixerPairs` に登録して専用 fixer を与える

`STANDARD_LOOP_FIXER_PAIRS` に conformance の paired fixer を登録し、conformance 専用の fixer loop として管理する案。

- **Pros**: loop の paired-fixer 機構が明示され、既存の episode-reset が自動適用される。
- **Cons**: conformance の fixer は問題の性質によって異なる（implementer / code-fixer / spec-fixer の 3 種）ため、単一の paired fixer を登録できない。`loopIters["conformance"]` の意味論（生涯カウンタ = 全 phase 再実行の termination guarantee）が壊れる。TC-071 が崩れる。
- **Why not**: D5 の conformance 起点 fixer 入場時の明示的リセット（`fixerIters[nextStep] = 0` + `loopIters[pairedReview] = 0`）で同等の効果を得る。単一収束予算を conformance カウンタに一本化する設計を維持する。

## 前 ADR との関係

`2026-06-03-conformance-review-acceptance-gate` の以下の決定を部分的に覆す：

- **D1「専用 tool を新設しない」を覆す**：conformance の fixTarget スコープ封じ込めのため `CONFORMANCE_REPORT_TOOL` を新設する。
- **A2「routing 分岐は判断場面を増やす」を覆す**：routing の最終決定を CLI に残す（R7 維持）ことで、agent の判断場面を増やさずに分岐を実現できると判断した。

## 影響

### Positive

- conformance が spec の誤りを見つけたとき spec-fixer に直接戻れるようになり、implementer 空振りが解消される。
- routing の最終決定が CLI 純関数にあり続けるため、R7 契約（verify-don't-trust）を維持したまま多方向分岐を実現できる。
- 旧形式 history の resume は再導出 + 残置エントリの二重安全で壊れない。

### Negative

- conformance が agent の `fixTarget` 分類を誤ると不適切な戻り先に routing される。ただし conformance が再評価し、最大 `CONFORMANCE_RETRIES_EXHAUSTED` で打ち切られるため無限ループにはならない。
- code-fixer 経路（`conformance → code-fixer → conformance`）は code-review を再走しない。conformance が最終ゲートであるため受け入れ品質は担保されるが、code-review の追加確認は得られない。

### Known Debt

- design step への戻り（`needs-fix:design`）は本変更のスコープ外。実需が観測されたら別 request で追加検討する。優先則は `design > spec-fixer > implementer > code-fixer` に自然拡張できる。
- 他 judge step（spec-review / code-review / request-review）への fixTarget 導入は本変更のスコープ外。

## 参照

- Request: `specrunner/changes/conformance-fix-target/request.md`
- Design: `specrunner/changes/conformance-fix-target/design.md`
- Supersedes (partially): `specrunner/adr/2026-06-03-conformance-review-acceptance-gate.md`
- Related: `specrunner/adr/2026-04-29-spec-fixer-iteration-loop.md`（pipeline loop primitive）
- Related: `specrunner/adr/2026-05-26-observation-auto-fix-pipeline.md`（code-fixer 遷移の先行変更）
