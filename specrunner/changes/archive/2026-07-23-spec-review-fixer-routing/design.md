# Design: spec-review の fixable canon finding を spec-fixer round で収束させる

## Context

spec-review は `reportTool: JUDGE_REPORT_TOOL` を使い、`judgeVerdictFn` を持たないため
verdict 導出は既定の `deriveJudgeVerdict` に落ちる（`src/core/step/spec-review.ts:69`）。

`deriveJudgeVerdict` の canon 判定は `judgeEffectiveFixer` 固定であり
（`src/core/step/judge-verdict.ts:53`）、この resolver は finding 内容によらず常に
`"code-fixer"` を返す（`src/core/step/canon-escalation.ts:41`）。code-fixer の canon 書込集合は
∅（`src/core/step/canon-write-scope.ts:47`）なので、canon file（spec.md / design.md を含む）への
fixable finding は必ず `selectUnroutableCanonFindings` に拾われ、severity を問わず
critical|high 判定より前段（`judge-verdict.ts:52-55`）で escalation に倒れる。

一方、遷移表には `spec-review needs-fix → spec-fixer`（`types.ts:234`）と
`spec-fixer approved → spec-review`（`types.ts:241`）の収束ループが既にあり、spec-fixer は
`{spec.md, design.md}` を合法的に書ける（`canon-write-scope.ts:51`）。しかし verdict 導出が
このループに到達させないため、転記型の spec 欠落のたびに job が awaiting-resume で停止し、
operator の手動修正と `resume --apply-canon` を要求する。

`protectedCanonPaths(slug)`（`src/core/step/write-scope.ts:64`）が返す canon file は
`{request.md, spec.md, design.md, tasks.md, test-cases.md, factCheckAttestation}` の 6 種。
このうち spec-fixer が書けるのは spec.md / design.md のみで、残り 4 種は spec-fixer も書けない。

`step-completion.ts:306` の escalationReason 計算は
`lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer` であり、spec-review を
code-fixer 扱いする。verdict 導出の resolver を差し替えるだけで escalationReason 側を放置すると
「routable なのに escalation 理由付き」等の drift が生じる。

## Goals / Non-Goals

**Goals**:

- spec-review round の fixer を構造的に spec-fixer として扱う専用 effective fixer resolver を導入し、
  canon 判定を spec-fixer の書込可能集合 `{spec.md, design.md}` に対して行う。
- spec-fixer が書ける canon file への fixable finding は severity を問わず `needs-fix` とし、
  既存ループで spec-fixer に routing する。
- spec-fixer が書けない canon file（request.md / tasks.md / test-cases.md / attestation）への
  fixable finding は従来どおり `escalation` とし、CANON_FINDING_ESCALATION 理由を設定する。
- verdict 導出と escalationReason 計算が同一の effective fixer 定義を参照するようにし、drift を構造的に排除する。

**Non-Goals**:

- spec-review の finding 網羅性（round ごとの全量列挙規律）は扱わない。
- halt→resume 時の stale step result ファイル掃除は扱わない。
- conformance の fixTarget routing は変更しない（既に `conformanceEffectiveFixer` が `f.fixTarget` を尊重）。
- spec-fixer の書込可能集合は変更しない。
- judge（code-review）/ conformance / regression-gate / request-review の verdict 導出挙動は変更しない。
- 遷移表・loopNames・loopFixerPairs は変更しない（必要な edge は既存）。

## Decisions

### D1: spec-review 専用 effective fixer resolver `specReviewEffectiveFixer` を導入する

`src/core/step/canon-escalation.ts` に、finding 内容によらず常に `"spec-fixer"` を返す
resolver `specReviewEffectiveFixer` を追加する。既存の `judgeEffectiveFixer` /
`conformanceEffectiveFixer` と同じ「1 行 const」形で、単一定義（single source of truth）として置く。

- **Rationale**: spec-review round の fixer は registry の `loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER`
  により構造的に spec-fixer 一択である。routing を agent の申告に委ねる必要がない。
- **Alternatives considered**:
  - *findings の `fixTarget` 申告に依存する方式（`conformanceEffectiveFixer` 型）*: 却下。
    申告漏れ・誤申告で routing が壊れる面を新設する。spec-review round では fixer が一意なので不要。

### D2: `deriveSpecReviewVerdict` を追加し、routable な canon fixable finding を severity 非依存で `needs-fix` にする

`src/core/step/judge-verdict.ts` に `deriveSpecReviewVerdict(findings, ok, evidence?, canonScope?)`
を追加する。優先順位:

1. `ok === false` → `escalation`
2. `evidence` present かつ `evidence.checked === 0` → `escalation`（vacuous check）
3. `decision-needed` finding ≥ 1 → `escalation`
4. `canonScope` present のとき:
   - 4a. spec-fixer が**書けない** canon file への fixable finding（unroutable）≥ 1 → `escalation`
   - 4b. spec-fixer が**書ける** canon file への fixable finding（routable）≥ 1 → `needs-fix`（severity 非依存）
5. `critical|high` finding ≥ 1 → `needs-fix`（非 canon finding の既存挙動を保持）
6. それ以外 → `approved`

4a を 4b より前に評価する。両者が共存する場合は escalation が優先される（operator が
request.md 等を修正して resume した後、spec-review が再走し spec.md finding を spec-fixer に routing する）。
これは既存 `deriveJudgeVerdict` の「canon escalation は critical|high needs-fix より前段」という
優先順位と整合する。

判定 4a / 4b のために、`canon-escalation.ts` に `selectUnroutableCanonFindings` と対称な
`selectRoutableCanonFindings`（fixable かつ canon path かつ effective fixer の書込集合に**含まれる**もの）
を追加し、両 verdict 関数から共有する。

- **Rationale**: resolver 差し替えのみで severity 規則を現状維持（critical|high のみ needs-fix）にすると、
  medium / low の fixable spec finding が無修正のまま approve され、既知の仕様欠落が test-case-gen 以降へ流れる。
  spec-review round の目的（spec の収束）に反する。
- **Alternatives considered**:
  - *resolver 差し替えのみ、severity 規則は `deriveJudgeVerdict` 流用*: 却下（上記のとおり medium/low が漏れる）。
  - *routable 判定を `deriveSpecReviewVerdict` 内にインライン展開*: 却下。既存 `selectUnroutableCanonFindings` と
    非対称になり、単体テストの粒度が下がる。named helper の方が drift-guard・単体テストが書きやすい。

### D3: `SpecReviewStep.judgeVerdictFn = deriveSpecReviewVerdict` を配線する

`src/core/step/spec-review.ts` の `SpecReviewStep` に `judgeVerdictFn` フィールドを追加する。
executor は `step.judgeVerdictFn` があればそれを使い（`step-completion.ts:194-197`）、`canonScope` を
第 4 引数で渡す（`step-completion.ts:201`）。したがって verdict 導出の切替はこの 1 箇所の宣言追加で完結する。

- **Rationale**: regression-gate が `judgeVerdictFn: deriveRegressionGateVerdict` で同型の切替を
  行っている（`regression-gate.ts:98`）。既存の拡張点をそのまま使う。
- **Alternatives considered**:
  - *executor 側で step 名を分岐して verdict 関数を選ぶ*: 却下。step 定義が振る舞いを宣言する
    既存パターン（Step as data）に反し、executor に step 固有知識を漏らす。

### D4: escalationReason の resolver を verdict 導出と同一化する（drift-proof）

`src/core/step/step-completion.ts` の verdict 導出ブロックで、canon 判定に用いた effective fixer resolver
を導出地点で捕捉する変数 `lastCanonResolver` を導入し、escalationReason 計算はこの捕捉値を参照する。

- conformance branch → `conformanceEffectiveFixer` を捕捉
- judge branch → `step.name === STEP_NAMES.SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer` を捕捉

現行の `lastIsConformancePath` boolean を捕捉値に置換する（`lastIsConformancePath` は :306 の resolver
選択のみに使われている）。`lastCanonResolver` は `lastUndecidedFindings` と同じ typed branch でのみ設定
されるため、escalationReason の guard（`lastUndecidedFindings !== null`）が成立するときは必ず非 null で、
未設定値を参照しない。

- **Rationale**: 要件 4。boolean を後段で resolver に再マップする現行構造は、resolver が 3 種に増えると
  「導出地点の選択」と「後段の再マップ」を別々に一致させ続ける必要があり drift 面を持つ。導出地点で
  resolver を捕捉すれば選択点が 1 つになり、escalationReason が verdict 導出と同一 resolver を使うことが
  構造的に保証される。
- **Alternatives considered**:
  - *`lastIsConformancePath` を残し :306 を 3-way 分岐にする*: 動作は同じだが「どの step → どの resolver」の
    選択式が verdict 導出（judgeVerdictFn 配線）と escalationReason で二重化し、drift 面が残る。捕捉方式を採用。

### D5: 遷移表・ループ機構は変更しない

`spec-review needs-fix → spec-fixer`（:234）と `spec-fixer approved → spec-review`（:241）は既存。
spec-review の escalation は遷移表に一致行がなく、既定の `transition?.to ?? "escalate"`（`pipeline.ts:366`）で
`escalate` 終端 → awaiting-resume に落ちる（現行と同じ）。SPEC_REVIEW は registry の `loopNames` に含まれ
`loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` が宣言済みで、ループはグローバル `maxIterations` で有界。

- **Rationale**: 本変更は verdict 導出の分類を変えるだけで、新しい遷移 edge・ループ経路を作らない。
  needs-fix routing は既存 edge を通り、既存の loop exhaustion（`SPEC_REVIEW_RETRIES_EXHAUSTED`）で有界。

### D6: ADR

本変更は spec-review の canon-finding routing 規則を変える設計判断であり ADR-worthy である。ADR の生成・
配置は adr-gen step に委ねる（本 design / tasks では ADR の path を記載しない）。

## Risks / Trade-offs

- **[Risk] escalationReason resolver の drift（要件 4）** → D4 で導出地点の resolver を捕捉し、単一選択点にする。
  drift-guard テスト（spec-review step の canon finding で verdict と escalationReason が同一 resolver に基づく
  ことを固定）で機械的に検出可能にする。
- **[Risk] routable/unroutable 共存時の優先順位が直感に反する** → 4a（escalation）を 4b（needs-fix）より
  優先する規則を design と spec に明記。operator 修正後の resume で spec.md finding が spec-fixer に routing される
  収束経路を確保する。
- **[Risk] spec-review → spec-fixer の反復増による無限ループ懸念** → 新規 edge を作らず既存 loop exhaustion で有界
  （D5）。有界性をテストで固定する。
- **[Risk] 既存 TC-021 コメントの陳腐化** → `judge-verdict.test.ts` の TC-021 は inline step（`judgeVerdictFn` 無し）+
  非 canon file を使うため assertion は unchanged で green。コメント（"judgeVerdictFn absent → falls back"）は
  実 `SpecReviewStep` の挙動を表さなくなるが assertion への影響はない。必要なら実 `SpecReviewStep` を対象とする
  ケースを別途追加する（非ブロッキング、tasks の test 課題で扱う）。
- **[Trade-off] 要件 5 の維持** → judge / conformance / regression-gate / request-review はいずれも
  `step.name !== SPEC_REVIEW`（あるいは別 report tool / 別 verdict 関数）であり、D4 の捕捉で従来 resolver が
  そのまま選ばれる。挙動不変。

## Open Questions

なし（request の architect 評価で採否が確定済み。in-scope の主要アサーションはコードで検証済み）。
