# Design: reviewer finding に remediation 契約を追加し fixer / regression-gate へ渡す

## Context

### 観測された問題

custom reviewer（cross-boundary-invariants）が needs-fix → approved に至るまで同一 job で 5〜6 イテレーションを要する事例が反復している
（`specrunner/changes/archive/2026-08-29-exclusion-aware-publish-prediction/cross-boundary-invariants-result-001〜005`、
`specrunner/changes/archive/2026-08-23-push-capability-preflight/cross-boundary-invariants-result-001〜006`）。
各イテレーションの finding は再掲ではなく、**前回の修正が同じ不変条件を共有する隣接経路を直していないために露出した同型の欠陥**である。

exclusion-aware iter 2 の evidence file（`cross-boundary-invariants-result-002.md`）は
`src/core/step/commit-push.ts:584` と `src/core/pipeline/parallel-review-round.ts:401` を
**同一の順序欠陥として同時に**名指しし、「exclusion filter より前に write-scope 検査を全 changed path に対して走らせよ」という
不変条件レベルの修正方針を書いている。しかし fixer に届いたのは typed finding のみで、site は 1 件・方針は rationale に圧縮されていた。

### 現行実装の確認事実（本設計で verify 済み）

| 箇所 | 事実 |
|---|---|
| `src/kernel/report-result.ts:40-99` | `Finding` は severity / resolution / file / line? / title / rationale / fixTarget? / options? / origin? / fileMissing? / ledgerRef? のみ。修正方針・関連 site を表す型がない |
| `src/core/step/report-tool.ts:75-86, 153-165` | `findingSchema` / `conformanceFindingSchema` も同じ形。`findingSchema` は JUDGE / CODE_REVIEW / REQUEST_REVIEW の 3 tool が共有 |
| `src/core/port/report-result.ts:178-244` | `parseFindings(raw, strict)`。strict は `decision-needed` の options ≥ 2 のみ強制。未知フィールドは黙って捨てる |
| `src/core/port/report-result.ts:333-371` | `parseJudgeReportInput` は ok=true で findings/evidence 必須。parse 失敗は `{ok:false, missingFields}` |
| `src/adapter/claude-code/agent-runner.ts:647-658, 1347-1376` | parse 失敗時は tool result を捕捉せず、`no-tool-call` として最大 2 回再試行 |
| `src/core/step/step-completion.ts:293-306` | toolResult が null のまま終わると judge step は **escalation**（request-review は needs-discussion）。**approved には決してならない** |
| `src/core/step/fixer-helpers.ts:60-73` | `buildFindingsBlock` は severity / title / file:line / resolution / rationale / source の 6 行のみ。evidence file の path も内容も出さない |
| `src/core/step/code-fixer.ts:267-285` | structured findings がある限り `findingsPath` を prompt に書かない。path が出るのは findings 空の fallback（288-304）と coordinator fallback（216-232）のみ |
| `src/core/step/fixer-helpers.ts:115-127` | `buildContinuationMessage` の structured 分岐も `findingsPath` を出さない |
| `src/core/step/spec-fixer.ts:173-190` | spec-fixer の structured 分岐も `findingsPath` を出さない（request.md の「code-fixer 固有の欠落」という記述は不正確 — 両方に欠落がある） |
| `src/core/step/code-fixer.ts:88-116` | `reads()` は executor の入力存在検証用。prompt 注入も読取指示もしない |
| `src/prompts/code-fixer-system.ts:18, 31, 35, 42` | Contract 入力は `review-feedback-NNN.md`、Method 1 は「指定された review-feedback-NNN.md を読み込む」。user prompt が path を出さないため成立していない。役割は「指摘事項の最小限修正のみ」/ Method 3「最小限の機械的修正」 |
| `src/core/pipeline/findings-ledger.ts:179-181, 247-250` | `findingFingerprint` = `file|line|title`、`computeLedgerRef` = その SHA-256 先頭 8 hex |
| `src/core/decision/decision-ledger.ts:32-38` | `computeFindingKey` = `step|file|line|title|rationale`（wontfix / disposition の identity） |
| `src/core/step/regression-gate.ts:50-74` | ledger entry は file / resolution / rationale / provenance ref を出す。site 概念がない |
| `src/store/event-journal.ts:425-433, 496-513` | `outcome.toolResult` は丸ごと透過保存・復元される。findings の各フィールドを列挙していない |
| `src/adapter/codex/strict-schema.ts` | OpenAI strict mode 変換は再帰的。optional は nullable 化されるため、agent は `remediation: null` / `line: null` を送り得る |
| `src/prompts/judge-rules.ts` | finding の remediation 形式は未定義 |

### 制約

- verdict 導出（`judge-verdict.ts`）、`AgentRunResult`、Git / PR profile の挙動は変えない
- persisted state / events には remediation を持たない finding が存在する。migration を要求しない
- managed / codex runtime でも同じ tool schema が通る必要がある
- evidence file は証拠であり機械 parse の対象にしない（参照 path を渡すだけ）

## Goals / Non-Goals

**Goals**:

- `Finding` に remediation 契約（破れた不変条件 / 同型 site の全列挙 / 推奨修正方向）を additive に追加する
- fixer に流れる judge step の `fixable` finding について remediation を parse 時に fail-closed で必須化し、
  欠落が **needs-fix → approved に化けない**ことを構造的に保証する
- `buildFindingsBlock` が remediation を展開し、code-fixer / spec-fixer が「列挙された全 site を同一イテレーションで直す」ことを指示される
- code-fixer / spec-fixer の structured 経路に evidence file path を参照として含める（Method 1 の記述矛盾を解消）
- ledger entry が sites を保持し、regression-gate が全 site で不変条件成立を検証対象にできる
- `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` の identity を一切変えない

**Non-Goals**:

- evidence file（`*-result-NNN.md`）の形式標準化・機械 parse
- verdict 導出規則の変更、fixer の model / turn budget の変更
- reviewer の paths / criteria の見直し
- 修正の自動適用、fixer の自己レビュー loop
- adapter（claude-code / managed / codex）の retry・診断経路の改修（D7 で理由を述べる）
- inbox / CLI 表示層への remediation 表示追加
- R4 provider lifecycle refactoring との同時実施

## Decisions

### D1: remediation は `Finding` の optional なネスト object として additive に追加する

```
FindingRemediation = {
  invariant: string      // 破れた不変条件を 1 文で
  sites: { file: string; line?: number }[]   // 同じ不変条件を共有する全経路（>= 1）
  approach: string       // 推奨する修正の方向
}
Finding.remediation?: FindingRemediation
```

型は `src/kernel/report-result.ts` に定義し、`src/core/port/report-result.ts` が re-export する
（`Finding` / `DecisionOption` と同じ流通経路）。`src/state/schema/types.ts` と `src/state/helpers.ts` の
persisted 型は `Finding` を型参照しているため、フィールド追加だけで persisted 型も追随する（別途の型追加は不要）。

**Rationale**: 型レベル optional にすることで、remediation を持たない既存 persisted finding がそのまま型検査を通る。
必須性は「型」ではなく「live tool call の parse 規則」で表現する（D3）。フィールド名は request.md の最小形をそのまま採用し、
ADR で確定させる語彙のブレを最小化する。

**Alternatives considered**:
- `Finding` を flat に拡張（`invariant` / `sites` / `approach` を直接持たせる）: 3 フィールドが常に同伴すべき単位であることが型に現れず、
  「invariant だけある finding」が表現可能になってしまう。却下。
- 別の side-car 配列（`remediations: []` を findings と並置し index で対応付け）: index 対応は persisted state 上で壊れやすい。却下。
- `sites` を `string[]`（"file:line" 形式）にする: parse・照合で文字列分解が必要になり、既存 `file` / `line?` の意味と乖離する。却下。

### D2: 必須化の適用範囲は「finding が fixer に流れる judge step」に限定する

remediation 必須（fail-closed）を適用するのは
**code-review / custom reviewer / spec-review / conformance / regression-gate**（= `parseJudgeReportInput` 系）。
**request-review は適用外**（`parseRequestReviewReportInput`）。

**Rationale**: request-review の finding は fixer に渡らず人間に返る（needs-discussion）。
sites / approach を要求しても消費者がおらず、pipeline gate で needs-discussion を誤爆させるだけの副作用になる。
逆に spec-review / conformance / regression-gate の fixable finding は spec-fixer / code-fixer / implementer に流れ、
regression-gate ledger にも載るため、同じ契約を課す価値がある。

**Alternatives considered**:
- 全 judge step に一律適用: 契約は単一化されるが、request-review の escalation リスクを対価に得るものがない。却下（ADR で再確認する）。
- code-review + custom reviewer のみ: 痛点の中心ではあるが、ledger は spec-review 由来 finding も含む（`collectSpecReviewLedger`）ため、
  regression-gate が sites を持つ entry と持たない entry の混在に常時晒される。却下。

### D3: 必須性は parse 層で fail-closed に強制し、経路は「既存 escalation」に合流させる

`parseFindings` の signature を
`parseFindings(raw, strict = false, requireRemediation = false)` に拡張する（第 3 引数は additive、既存呼び出しは無変更で従来挙動）。

- `strict && requireRemediation` かつ `resolution === "fixable"` で remediation 欠落 → `{ ok: false, reason: "remediation-missing" }`
- remediation が存在するが不正形（invariant / approach が空、sites が非配列 / 空 / 要素不正）→ `{ ok: false }`（resolution 問わず）
- 非 strict（persisted 再読込・legacy）→ 要求しない。整形式なら捕捉、不正形なら黙って落とす（`options` と同じ扱い）

`parseJudgeReportInput` は `parseFindings(obj.findings, true, true)` を呼び、
remediation 起因の失敗のときだけ `missingFields: ["findings.remediation"]` を返す（それ以外は従来どおり `["findings"]`）。
`parseRequestReviewReportInput` は `parseFindings(obj.findings, true, false)` のまま。

**fail-closed が approved を作らないことの根拠**: parse 失敗 → runner は tool result を捕捉しない → 最大 2 回の再試行 →
それでも失敗すれば `toolResult === null` → `step-completion.ts:293-306` により judge step は **escalation**。
`findings: []`（= approved）に化ける経路は存在しない。**この不変条件を drift-guard テストで固定する**（T-08）。

**Rationale**: 「typed error または escalation として表面化させる」という要求を、新しい halt 経路を足さずに既存の
tool-report 失敗経路へ合流させる。`missingFields` のラベル分離により、codex adapter の
`completionReportDiagnostics` と `DEFAULT_TOOL_RETRY` の `invalid-input` 文面に原因が乗る。

**Alternatives considered**:
- 欠落 finding だけを drop する: needs-fix が approved に化ける経路を作る。request.md が明示的に禁止。却下。
- remediation を欠く finding を `decision-needed` に強制変換する: verdict 導出の意味を変える（escalation 化）ため
  「verdict 導出規則を変更しない」に抵触。却下。
- 欠落時に CLI 側で remediation を自動合成（invariant=title, sites=[自 site], approach=rationale）: fail-open となり、
  reviewer に隣接経路走査を強制する目的が消える。却下（ただし D4 の自 site 補完だけは例外的に採用する）。

### D4: 自 site の包含は「検証」ではなく「正規化」で保証する

`sites` に finding 自身の `file` が含まれない場合、parse 層が `{ file, line }` を **先頭に補完**する
（`file|line` で dedupe）。これは reject 条件にしない。

**Rationale**: 「sites は finding の file:line を含む」は消費者側（fixer / gate）が依存する不変条件だが、
その違反は情報欠落ではなく記法の抜けである。reject にすると些末な書式で job 全体が escalation する。
補完なら不変条件は常に成立し、fail-closed の発火点は「方針そのものが無い」場合だけに絞れる。

**Alternatives considered**:
- strict 検証して reject: escalation ノイズが増え、reviewer が finding 報告を避ける誘因になる（Stop Condition 1 に接近）。却下。
- 消費者側（buildFindingsBlock / ledger）で毎回補完: 補完ロジックが複数箇所に散る。parse を単一の正規化点にする。却下。

### D5: identity（fingerprint / ledgerRef / findingKey）は remediation を含めない

`findingFingerprint`（`file|line|title`）、`computeLedgerRef`（その SHA-256 先頭 8 hex）、
`computeFindingKey`（`step|file|line|title|rationale`）はいずれも変更しない。remediation は identity に寄与しない。

**Rationale**: ledgerRef は wontfix provenance の解決に使われ、過去 job の persisted 値と一致し続ける必要がある。
remediation を含めると、同一欠陥が方針の言い回し違いで別 entry になり、dedupe / wontfix が壊れる。
sites を ledger に載せるのに identity 変更は不要である（ledger entry は `Finding` そのものを保持しているため、
remediation はすでに entry に同伴して運ばれる）。Stop Condition 3 は発火しない。

**Alternatives considered**:
- site 単位に ledger entry を分割する（1 finding × N sites → N entry）: entry ごとに新しい fingerprint が必要になり、
  既存 ledgerRef 互換が壊れる。regression-gate の verdict 集計単位も変わる。却下。

### D6: fixer への受け渡しは「1 finding = invariant + 全 sites + approach + evidence path」に統一する

- `buildFindingsBlock` は remediation を持つ finding に対して
  `**Invariant**` / `**Sites (fix all in this iteration)**`（全 site を 1 行ずつ）/ `**Approach**` を追加出力する。
  remediation を持たない finding の出力は 1 バイトも変えない（legacy 互換）。
- ブロック内に 1 件でも remediation があれば、末尾に**全 site 同時修正指令**を付す
  （「列挙された全 site を同一イテレーションで修正する。approach より狭い修正を選ぶ場合は理由を出力に残す」）。
  `buildFindingsBlock` は code-fixer / spec-fixer / implementer(conformance 経路) の共有点であり、ここに置けば単一定義で全経路に届く。
- evidence file path は **structured findings がある経路でも**必ず prompt に含める。対象は
  code-fixer の 3 経路（conformance / coordinator / 通常）、spec-fixer の 2 経路（conformance / 通常）、
  および `buildContinuationMessage` の structured 分岐。coordinator 経路では needs-fix member **全員**の result path を列挙する
  （現状 fallback は先頭 1 件しか出していない）。path は「参照用。機械 parse はしない」と明示する。

**Rationale**: fixer が受け取る情報を「typed finding が正典 / evidence file は補足証拠」という 1 つの規律に揃える。
`reads()` は executor の存在検証専用であり prompt には現れないため、path は buildMessage が明示的に載せるほかない。

**Alternatives considered**:
- evidence file の内容を prompt に埋め込む: 非機械解釈の原則に反し、prompt 長も予測不能になる。却下。
- 全 site 指令を各 step の user message に個別記述する: 3 step × 5 経路で重複し drift する。却下。

### D7: adapter の retry / 診断経路は本変更で触らない

parse 失敗時の再試行文面（local runtime は `no-tool-call` 固定）や tool result のエラー返却は変更しない。

**Rationale**: fail-closed の安全性（escalation）は adapter を触らずに成立する（D3）。
adapter 3 実装（claude-code / managed / codex）の retry 経路は verification 範囲が広く、
本変更の目的（契約の追加）と独立に評価すべきである。`missingFields: ["findings.remediation"]` を返す準備だけ整えておき、
文面改善は別 Issue とする（Open Questions Q2）。

**Alternatives considered**:
- claude-code runner だけ `invalid-input` 再試行に切り替える: runtime 間で回復挙動が非対称になる。却下。

### D8: reviewer 側の記述は共有 fragment 1 本で供給する

`src/prompts/judge-rules.ts` に `FINDING_REMEDIATION_DEFINITION` を追加し、
`custom-reviewer-system.ts` / `code-review-system.ts` / `spec-review-system.ts` / `conformance-system.ts` /
`regression-gate-system.ts` の Completion（finding 形式）へ注入する。各 prompt の JSON 例にも remediation を追記する。
`request-review-system.ts` には注入しない（D2）。`specrunner/reviewers/*.md` の定義本文には一切要求しない。

fragment には形式定義に加えて**走査義務**を書く:
「finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路・同じ検査を行う別レイヤを走査し、
成立していない箇所をすべて sites に列挙する。1 site しかない場合は、走査したうえで 1 件であることを rationale か evidence file に記す」。

**Rationale**: reviewer 定義（user 提供）ではなく CLI が所有する judge contract 側に置くことで、
reviewer ごとの重複記述と drift を防ぐ。既存の `DECISION_NEEDED_DEFINITION` / `SEVERITY_DEFINITION` と同じ供給形式に揃う。

### D9: regression-gate は ledger entry の全 site を検証単位にする

`buildLedgerEntry` は remediation を持つ entry に `**Invariant**` と `**Sites**`（全列挙）を追加出力する。
`REGRESSION_GATE_SYSTEM_PROMPT` の Method に「ledger entry に Sites がある場合、**列挙された全 site** で不変条件が
成立しているか確認し、いずれかで破れていれば退行として報告する」を追加する。
退行 finding 自身も remediation を持つ（D2 適用対象）ため、gate は ledger entry の invariant / sites を
自分の finding.remediation に引き継ぐよう指示される。ledgerRef は従来どおり verbatim echo。
verdict 導出（`deriveRegressionGateVerdict`）は変更しない。

**Rationale**: 「片側だけ直った状態」を検出できないという ledger の欠落を、identity を変えずに埋める唯一の経路。

**Alternatives considered**:
- gate が sites を再走査して新規 site を発見する: gate の「ledger 外の新規 finding は報告しない」規律に反する。却下。

### D10: schema は optional、null は absent として正規化する

`report-tool.ts` の `remediationSchema` は `optional(object({ invariant, sites: array(object({file, line: optional(number)})), approach }))` とし、
`findingSchema` / `conformanceFindingSchema` の両方に追加する。
`findingSchema` は REQUEST_REVIEW でも共有されるが、optional なので request-review の挙動は変わらない。
parse 層は `remediation === null` と `site.line === null` を **absent** として扱う
（codex strict mode が optional を nullable+required に変換するため、null 到達は正常系）。

**Rationale**: managed（`toJSONSchema`）と codex（`toOpenAIStrictSchema`、再帰変換）はいずれもネスト object / array を扱えるため、
同一 schema で 3 runtime を通せる。Stop Condition 5 は発火しない。

## Risks / Trade-offs

- [remediation 必須化により reviewer が finding 報告を避け、needs-fix が減る（Stop Condition 1）]
  → Mitigation: fail-closed の発火点は「fixable finding があるのに方針が無い」場合のみに限定し（D3）、
  自 site 補完（D4）で書式起因の reject をゼロにする。fragment には「1 site でも良い、ただし走査したことを記せ」と明記し（D8）、
  sites の件数ではなく「走査したか」を要求にする。この挙動は unit test で固定する（T-08）。

- [fail-closed が escalation を増やし、job が人手待ちで止まる]
  → Mitigation: escalation は approved 誤変換より安全側であり、既存の tool-report 失敗経路と同じ扱いに合流する（新規 halt 経路を作らない）。
  再試行 2 回の猶予は既存のまま。`missingFields: ["findings.remediation"]` により原因が state / codex 診断に残る。

- [既存 judge test fixture（remediation なしの fixable finding を strict parse に通す）が赤化する]
  → Mitigation: 影響は「live tool call を模した parse テスト」に限定される（persisted 読取テストは非 strict のため無影響）。
  T-09 で赤化する既存テストを列挙・更新し、更新件数を PR 実測値として報告する。

- [prompt が finding 1 件あたり数行伸び、fixer の context を圧迫する]
  → Mitigation: 追加は invariant 1 行 + sites N 行 + approach 1 行のみ。evidence file は path のみ（本文は入れない）。
  finding 1 件あたりの追加行数を PR 実測値として計測する。

- [regression-gate が sites 全件を検証することで turn 予算を超える]
  → Mitigation: gate の maxTurns（20）と ledger 規模は変えない。site 検証は既存 entry 検証の内訳であり、entry 数は増えない（D5）。

- [fixer が「全 site 修正」指令を過剰解釈し、finding 無関係の変更を行う]
  → Mitigation: code-fixer system prompt の「最小限」を **「finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正」**
  に改める一方、write-set の「findings に記載されていない変更は禁止」条項は維持する（sites は finding の一部であり、逸脱ではない）。

## Migration Plan

migration は不要（additive）。

- persisted state / events: `outcome.toolResult` は `event-journal.ts` で丸ごと透過保存・復元されるため、
  remediation は新規 job で自動的に永続化され、既存 job では単に不在のまま読める。schema version は上げない。
- 既存 job の resume: 過去 run の finding（remediation なし）は非 strict 経路でのみ読まれるため parse されない / 落ちない。
  fixer prompt はそれらに対し従来どおりの 6 行出力になる。
- rollback: 契約は additive なので、prompt / parse 変更を戻しても persisted な remediation は無視されるだけで壊れない。

## Open Questions

- Q1: 必須化の適用範囲を「fixer に流れる judge step のみ（D2）」とするか「request-review を含む全 judge step」とするか。
  本設計は前者を採用したが、ADR で最終確定する（設計時に確認を試みたが回答は得られていない）。
- Q2: parse 失敗時の再試行文面を `no-tool-call` から `invalid-input`（`missingFields` 込み）へ切り替えるか。
  本変更では adapter を触らない（D7）。回復率が問題になる場合は別 Issue とする。
- Q3: `sites` に「不変条件が既に成立している site（確認済み・修正不要）」を含めることを許すか。
  本設計は「成立していない site を列挙する」を既定とし、成立済み site は evidence file 側に書く前提で進める。
- Q4: inbox / `specrunner status` などの CLI 表示層に remediation を出すか（本変更では Non-goal）。
