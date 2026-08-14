# Design: severity と fixability の分離 — LOW も fixable なら直す

## Context

`severity`（pipeline を止める強さ）と `resolution`（修正対象かどうか）は本来独立した概念だが、
現行実装は複数箇所で「LOW severity なら修正対象から落とす」という特例を持っている。妥当で修正
方法も明確な finding が、深刻度が低いという理由だけで放置され、その辻褄を合わせるために
regression-gate 側でも「LOW は意図的に未修正」という ledger 除外を持っている。

この LOW 除外は過去の livelock（LOW を直す → 再レビュー → 同じ LOW を再指摘 → 無限ループ）への
対症として入った。しかし livelock の真因は「LOW を直すこと」ではなく「直した後に再レビューへ
戻すこと」にある。現行構造はすでに approved 経路の fixable を修正後に再レビューへ戻さない
（low/medium fixable → approved verdict、approve は stop gate、observation auto-fix）ため、この
経路に LOW を含めても livelock は構造的に起きない。

### 現状の LOW を落とす箇所（本変更の除去対象）

request.md が名指しした routing 層のフィルタに加えて、コード探索で以下を確認した。すべて除去
対象として列挙する。

| # | 箇所 | 現状の挙動 | 分類 |
|---|------|-----------|------|
| 1 | `src/core/step/judge-verdict.ts:201-203` `selectFixerTargetFindings` | `fixable && severity !== "low"` で LOW を除外 | routing 層フィルタ（正典） |
| 2 | `src/core/pipeline/findings-ledger.ts:230-242` `excludeKnownUnfixedRegressions` | ledger の `severity === "low"` エントリを gate finding から除外 | regression-gate 特例 |
| 3 | `src/core/step/step-completion.ts:213-217` | regression-gate verdict 導出前に `excludeKnownUnfixedRegressions` を適用 | #2 の呼び出し側 |
| 4 | `src/core/step/step-completion.ts:249-260` | regression-gate 永続化 findings を `excludeKnownUnfixedRegressions` で整列 | #2 の呼び出し側 |
| 5 | `src/core/step/code-fixer.ts:149-150 / 192-193 / 218-219 / 271 / 291-292` | 「HIGH/CRITICAL 必須、MEDIUM 条件付き」の step message（LOW に言及なし） | code-fixer prompt の severity 階層化 |
| 6 | `src/prompts/code-fixer-system.ts:40` | 旧 format fallback で「HIGH は必須、MEDIUM は設計変更不要の範囲、**LOW は無視**」 | code-fixer system prompt の severity 再フィルタ |
| 7 | `src/core/pipeline/reviewer-chain.ts:281-320` `codeReviewFindingsRoutingActive` + `src/core/step/no-op-detect.ts:44-49,97-101` `findingsRoutingApproved` + `src/core/step/executor.ts:19,482` | approved findings-routing 経路の code-fixer no-op を無条件に正常扱い（escalation 抑止）。コメントに「all fixable findings are LOW severity which the prompt intentionally ignores」 | fixer no-op 容認特例 |

### 変更しないもの（意味論の保存）

- **verdict 導出**：`deriveJudgeVerdict` / `deriveSpecReviewVerdict` の critical|high → needs-fix、
  low/medium fixable → approved は不変。再レビュー要否の線（critical|high = 再レビュー）は動かさない。
- **spec-fixer 経路**：spec-fixer は元々 severity フィルタを持たず（`getLatestJudgeFindings` +
  `buildFindingsBlock` の全件）、LOW を既に処理していた。本変更の影響は主に code-fixer 側。
- **findingTargetPaths / pipelineManagedPaths 免除**（no-op 検知の「finding が名指しした path への
  変更は仕事として数える」機構）は保存する。これは severity 特例ではなく作業帰属の機構であり、#1 の
  除去により LOW finding の target path が自然に免除集合へ入るようになるだけで正しさが増す。

## Goals / Non-Goals

**Goals**:

- fixable finding を severity を問わず fixer 対象とする（LOW を含む）。
- 「LOW は意図的に未修正」という前提に依存した特例（表 #2〜#7）をすべて除去する。
- fixer 経路の唯一の判定点を routing 層（`selectFixerTargetFindings`）に一本化し、fixer prompt /
  system prompt に severity 再フィルタを残さない。
- LOW も含めた fixable を「一度きりの修正機会 + 再レビューなし」で処理し、その修正が行われない no-op を
  silent に通さない。

**Non-Goals**:

- verdict 種別・escalation 条件の変更。
- 再レビュー要否の基準変更（critical|high = 再レビューの線は不変）。
- conformance / custom reviewers の挙動変更。
- fixer の write scope 変更。
- attestation の severity 集計（`src/core/attestation/build-attestation.ts:43` の `bySeverity.low++`）—
  統計表示であり routing フィルタではないため対象外。

## Decisions

### D1: `selectFixerTargetFindings` から LOW 除外を外す（routing 層の一本化）

`selectFixerTargetFindings` の `.filter((f) => f.severity !== "low")` を除去し、
`collectFixableFindings(findings)` と同義（fixable 全 severity）にする。関数と 2 つの呼び出し
（`code-fixer.ts` buildMessage / `routed-findings.ts` Branch 3）は温存し、「routing 層が唯一の LOW
判定点」という現行規律の器を保つ。両者のコメント（「LOW excluded」旨）を「fixable 全件を返す」に
更新する。

- **Rationale**: request 要件 1 が「関数は残しフィルタのみ外す」と明示。関数を消して
  `collectFixableFindings` に置換すると routing 概念の名前が失われ、requirement 4 の「唯一の判定点」を
  表す器も消える。フィルタ 1 行の除去が最小かつ意図に忠実。
- **Alternatives considered**: (a) `selectFixerTargetFindings` を削除し呼び出しを
  `collectFixableFindings` に置換 → 命名概念の喪失で却下。(b) LOW を渡すが code-fixer prompt 側で絞る →
  requirement 4（prompt に severity 再フィルタを持ち込まない）に反するため却下。

### D2: `excludeKnownUnfixedRegressions` を廃止し regression-gate を ledger 全件検証に戻す

`excludeKnownUnfixedRegressions`（findings-ledger.ts）を削除し、step-completion.ts の 2 つの呼び出し
（verdict 導出前フィルタ / 永続化整列）を除去する。regression-gate は ledger 全件（旧・既知未修正 LOW
相当を含む）を最終コードに対して再検証する。`deriveRegressionGateVerdict` の「fixable 検出 →
needs-fix（severity 不問）」は不変。関数のコメント（呼び出し側が excludeKnownUnfixedRegressions を先に
適用する前提、という記述）を「ledger 全件を受け取り、残存する fixable は真の退行なので needs-fix」に
更新する。

- **Rationale**: LOW も修正されるため「fixer に回されなかった LOW」という状態が消える。除外機構は保守
  対象としてだけ残る死んだ複雑さになる。ledger 全件検証に戻すのが一貫し、spec-review 由来の LOW
  （spec-fixer は元々処理していた）も gate で検証されるようになり、修正と検証の非対称も解消する。
- **副次的な単純化**: `deriveRegressionGateVerdict` は「任意の fixable → needs-fix」なので、除外後に
  「approved かつ fixable が残る」状態は原理的に発生しない。よって step-completion.ts の永続化整列
  ブロック（`regression-gate approved (fixable) → code-fixer` transition や `regressionGateActive` が LOW で
  誤発火しないための整列）は不要になり削除できる。
- **import 整理**: 除去に伴い step-completion.ts の `excludeKnownUnfixedRegressions` /
  `computeRegressionLedger` / `deriveImplReviewerChain` / `REGRESSION_GATE_STEP_NAME` の各 import が未使用に
  なれば削除する（typecheck で確認）。
- **Alternatives considered**: 除外集合を LOW から空へ縮小して機構だけ残す → 常に no-op な機構を残すのは
  dead flexibility で却下。

### D3: code-fixer step message を severity 不問の修正義務に統一

`code-fixer.ts` buildMessage の全 5 分岐（conformance / coordinator 集約 / coordinator fallback /
標準 embedded / 標準 findingsPath fallback）の「Fix all HIGH and CRITICAL ... (mandatory) / Fix
MEDIUM ... only if ...」の severity 階層化指示を、「上記の finding はすべて修正対象。severity を問わず
（LOW/MEDIUM/HIGH/CRITICAL いずれも）必須で修正する」旨の単一指示へ置き換える。write-scope ガード
（新機能追加・設計変更の禁止、review-feedback 自体を変更しない等）は別行として保持する。安定した pin 用
部分文字列として英語の "regardless of severity" を含める。

- **Rationale**: routing 層で fixer に届いた finding は severity で再階層化しない、が requirement 4 の
  規律。message が severity 階層を語ると routing 層と二重判定になり、LOW が欠落する。
- **Alternatives considered**: 標準経路の 2 分岐のみ更新 → conformance / coordinator 経路にも同じ階層化
  文言が実在（request が 149-150 を明示）。全分岐で兄弟 caller を残すと片手落ちになるため全 5 分岐を更新。

### D4: code-fixer system prompt の severity 再フィルタ（「LOW は無視」）を除去

`code-fixer-system.ts:40` の旧 format fallback 「severity に基づいて判断する（HIGH は必須、MEDIUM は
設計変更不要の範囲、LOW は無視）」を、severity で選別しない指示（提示された finding はすべて最小修正で
解消する）に置き換える。line 38 の「Fix: yes の finding は severity に関わらずすべて修正する」は既に
正しいため保持する。

- **Rationale**: requirement 4 は「code-fixer / spec-fixer prompt に severity 再フィルタを持ち込まない」。
  この行は system prompt に残った LOW 除外であり requirement 3 の「LOW を無視する特例の全除去」に該当する。
  spec-fixer system prompt には severity 文言がなく変更不要。
- **Alternatives considered**: 放置（buildMessage が Fix カラム付きで埋め込むため到達しにくい）→ 規律
  違反の文言を残すと将来 regression し得るため除去。

### D5: fixer no-op 容認特例（`codeReviewFindingsRoutingActive` / `findingsRoutingApproved`）を除去

approved findings-routing 経路の code-fixer no-op を無条件に正常扱いする抑止機構を削除する。

- `reviewer-chain.ts` の `codeReviewFindingsRoutingActive` を削除。
- `no-op-detect.ts` の `findingsRoutingApproved` パラメータと対応分岐（source 無変更でも抑止して
  `undefined` を返す枝）を削除。
- `executor.ts` の import と呼び出し（`findingsRoutingApproved: … codeReviewFindingsRoutingActive(state)`）を削除。

除去後、routed target finding を持つ run で fixer が source（および finding-named path）を変更しなければ、
no-op 検知が verdict を needs-fix に override する。code-fixer の needs-fix には遷移行が無いため
`pipeline.ts:366`（`transition?.to ?? "escalate"`）により escalate（terminal）になる。これは再レビュー
再入ではないため livelock を生まない。

- **Rationale**: この抑止は「approved 経路の fixable は全部 LOW で、prompt が意図的に無視するから no-op は
  正常」という前提の上に立つ（コメントに明記）。D1 で LOW が fixer 対象になり前提が消える。architect 判断
  「LOW/MEDIUM に与えるのは一度きりの修正機会 + 再レビューなしであって no-op の容認ではない」に一致。
  doc-only 修正は findingTargetPaths 免除が仕事として数えるため escalate しない。
- **Livelock 非再発の確認**: escalation は terminal であり再レビューへ戻さない。livelock の真因（修正後の
  再レビュー再入）を再導入しないため、除去は安全。
- **Alternatives considered**: (a) 抑止を「routed findings が空のとき」に限定して残す → D1 後は「approved +
  fixable」経路で routed findings は空にならない（LOW も含む）ため条件が常に偽になり死んだ分岐になる。削除が
  一貫。(b) 抑止を残す → 「LOW も直す」と宣言しつつ直らなくても通す設計になり architect 判断に反するため却下。

### D6: verdict / 再レビュー要否の意味論は不変

`deriveJudgeVerdict`（critical|high → needs-fix、low/medium fixable → approved）、
`deriveSpecReviewVerdict`（routable canon の critical|high → needs-fix、low/medium → approved）、
`deriveRegressionGateVerdict`（任意の fixable → needs-fix）の判定は変更しない。本変更は「どの finding を
fixer に渡すか」と「no-op を許容するか」の層のみを触る。

- **Rationale**: request のスコープ外（verdict 種別・再レビュー基準の変更）を侵さない。受け入れ基準
  「critical|high の needs-fix 経路が不変」「low/medium が approved 経路で処理され再レビューが走らない」を
  保存する。
- **Alternatives considered**: なし（スコープ制約）。

## Risks / Trade-offs

- **[Risk] LOW/MEDIUM の no-op が escalation を増やす** — 従来 silent に通っていた「fixer が routed finding を
  直さない」ケースが escalation になる。→ **Mitigation**: これは意図した挙動（architect 判断「no-op の容認では
  ない」）。doc 修正は findingTargetPaths 免除で仕事として数えられ escalate しない。escalate は再レビュー再入
  ではなく terminal なので livelock は起きない。

- **[Risk] regression-gate が LOW 退行で needs-fix を出し fixer ループが増える** — ledger 全件検証で LOW の退行も
  needs-fix になる。→ **Mitigation**: gate → code-fixer ループは `REGRESSION_GATE_MAX_ITERATIONS`（3）で有界。
  LOW も真の退行なら修正されるべきで、これは意図した一貫性回復。旧来の「LOW は検証しない」非対称の方が問題だった。

- **[Risk] 既存テストの広範な更新漏れ** — LOW 除外を pin したテストが複数ファイルに分散する。→ **Mitigation**:
  末尾「Existing Test Update Ledger」で全件を根拠付きで列挙。列挙外は無変更で green を維持し、
  `typecheck && test` で担保する。

## Open Questions

- なし。設計判断は architect 評価済み（livelock 対策の置換、regression-gate 除外廃止の簡素化）で確定している。

## Existing Test Update Ledger（LOW 除外を pin した既存テストの更新対象）

受け入れ基準「LOW 除外を pin していた既存テストの更新対象を design で全列挙し根拠を明示する。列挙外は無変更で
green」に対応。**この表に挙げたテストのみ更新し、他は無変更で green を保つ。**

| ファイル | テスト / describe | 現状の pin | 更新方針・根拠 |
|---------|------------------|-----------|----------------|
| `src/core/step/__tests__/regression-gate-false-loop.test.ts` | TC-008（`selectFixerTargetFindings — low fixable を除外…`）の「high fixable は保持される」「low fixable のみ→空配列」 | LOW 除外 | LOW も返る前提へ更新（`toContain("LOW")`、only-LOW は空でなく LOW 全件）。「critical 保持」「空→空」は不変。D1 |
| 同上 | TC-009 / TC-010（`excludeKnownUnfixedRegressions …`） | 削除関数の挙動 | 関数削除に伴い describe ごと削除。D2 |
| 同上 | TC-001 / TC-002（`approved 経路の未修正 low … approved`） | 未修正 LOW を gate で除外 | 前提（未修正 LOW）消滅 + 関数削除。describe ごと削除。D2 |
| 同上 | TC-003 / TC-004（`新規/修正済み退行は needs-fix`） | `excludeKnownUnfixedRegressions` 経由 | 削除関数に依存。退行→needs-fix の芯は `src/core/step/__tests__/judge-verdict.test.ts` の `deriveRegressionGateVerdict` で既にカバー。冗長分は削除。D2 |
| 同上 | TC-005（`standard reviewer path の routing は low を除外`）3 件 | `collectRoutedFixerFindings` が LOW 除外 | LOW も含む前提へ更新（`toContain("LOW")`）。D1 |
| 同上 | TC-011（`computeRegressionLedger …`） | — | **不変**（LOW 除外に非依存、high/medium fixture）。参考: 列挙外。 |
| `tests/unit/step/fixer-findings.test.ts` | TC-FF-C-005（`… low excluded`） | code-fixer message が LOW を埋め込まない | LOW も埋め込まれる前提へ更新（`[LOW]` と LOW title を `toContain`）。D1/D3 |
| `tests/unit/step/code-fixer.test.ts` | describe「prompt severity contract: … include HIGH and CRITICAL」TC-001〜005 | 全分岐に `"Fix all HIGH and CRITICAL severity findings"` を要求 | severity 不問の新文言に更新（例: `"regardless of severity"` を `toContain`、旧文言 assert を除去）。D3 |
| `src/core/step/__tests__/executor-no-op.test.ts` | 「Req 1: … low fixable … no source changes → approved」 | approved 経路 no-op を抑止 | 抑止除去に伴い `needs-fix` を期待するよう更新。D5 |
| 同上 | 「TC-008: … findingsRoutingApproved suppression → approved」 | 同上 | `needs-fix` を期待するよう更新（「approved 経路 no-op は escalate」に読み替え）。D5 |
| 同上 | TC-001〜007 / 009 / 010 / 012、Req 2 / Req 3 / Req 4 | findingTargetPaths 免除・#734 | **不変**（high severity fixture、免除機構は保存）。参考: 列挙外。 |
| `src/core/step/__tests__/no-op-detect-exemption.test.ts` | 「TC-011: approved findings-routing, params omitted → undefined (suppression preserved)」 | `findingsRoutingApproved: true → undefined` | param 削除に伴い削除。D5 |
| 同上 | その他全 `detectNoOp` 呼び出し（`findingsRoutingApproved: false` を渡す箇所） | — | param 削除に伴い当該引数行を除去（挙動は不変）。D5 |
| `src/core/pipeline/__tests__/reviewer-chain.test.ts` | describe「codeReviewFindingsRoutingActive」+ import | 削除関数の挙動 | 関数削除に伴い describe ごと削除、import から除去。D5 |
| 同上 | 「returns true when regression-gate approved with fixable findings」 | `regressionGateActive` の approved+fixable 分岐 | D2 により derive が fixable≥1 を needs-fix に変換し当該分岐は到達不能。分岐削除（regression-gate finding 起因）に伴いテストも削除。 |
| `src/core/step/__tests__/judge-verdict.test.ts` | `deriveJudgeVerdict` / `deriveRegressionGateVerdict` 各テスト | verdict 意味論 | **不変**（verdict 導出は変更しない）。参考: 列挙外・green のまま。D6 |
| `tests/unit/step/judge-verdict.test.ts` | `collectVerdictAffectingFindings`（low/medium fixable を除外） | verdict-affecting 判定 | **不変**（verdict 層であり fixer routing ではない）。参考: 列挙外。 |
| `tests/unit/prompts/fragments.test.ts` | `PIPELINE_RULES` が "LOW" を含まない | 共有 fragment | **不変**（変更対象は `code-fixer-system.ts` の `CODE_FIXER_BASE`、`PIPELINE_RULES` fragment ではない）。参考: 列挙外。 |
| `tests/unit/core/pipeline/spec-observation-autofix.test.ts` | low/medium → approved の spec observation autofix | verdict 意味論 | **不変**（spec-fixer は元々 severity フィルタなし、verdict も不変）。参考: 列挙外。 |
