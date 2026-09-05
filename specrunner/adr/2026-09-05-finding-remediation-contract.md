# Finding Remediation Contract：reviewer finding に修正方針契約を追加し fixer / regression-gate へ渡す

**Date**: 2026-09-05
**Status**: accepted

## Context

custom reviewer（例: cross-boundary-invariants）が needs-fix を出してから approved に至るまで、同一 job で 5〜6 イテレーションを要する事例が反復していた。

- `specrunner/changes/archive/2026-08-29-exclusion-aware-publish-prediction/`: cross-boundary-invariants-result-001〜005（needs-fix ×4 → approved）
- `specrunner/changes/archive/2026-08-23-push-capability-preflight/`: cross-boundary-invariants-result-001〜006（escalation 1、needs-fix ×4 → approved）

各イテレーションの finding は前回と同じ指摘の再掲ではなく、**前回の修正が同じ不変条件を共有する隣接経路を直していないために露出した同型の欠陥**だった。exclusion-aware iter 2 の evidence file は `commit-push.ts:584` と `parallel-review-round.ts:401` を同一の順序欠陥として名指しし、「exclusion filter より前に write-scope 検査を全 changed path に対して走らせよ」という不変条件レベルの修正方針を書いていた。しかし fixer に届いたのは typed finding のみで、site は 1 件・方針は rationale に圧縮されていた。

根本原因は reviewer と fixer の受け渡し契約にあった。

- **typed finding の rationale は症状に圧縮される**: `Finding` 型は修正方針や関連 site を表すフィールドを持たず、不変条件レベルの情報が evidence file にのみ存在した。
- **reviewer の修正方針は fixer に届かない**: `buildFindingsBlock` は severity / title / file:line / resolution / rationale / source の 6 行のみを出力し、evidence file の内容も path も含めなかった。`code-fixer.ts` の structured findings 経路は `findingsPath` をプロンプトに書かず、`code-fixer-system.ts` の Method 1「review-feedback-NNN.md を読み込む」は user prompt 側で path が指定されないため成立していなかった。
- **fixer は最小修正を命じられている**: `code-fixer-system.ts` は「指摘事項の最小限修正のみ」と定義しており、不変条件を共有する隣接経路まで直す指示がなかった。
- **regression-gate も site 単位の情報を持たない**: ledger は finding を `file|line|title` で識別し、隣接 site の片側だけ直った状態を検出できなかった。

## Decision

### D1: remediation は `Finding` の optional なネスト object として additive に追加する

```ts
type FindingRemediation = {
  invariant: string                          // 破れた不変条件を 1 文で
  sites: { file: string; line?: number }[]   // 同じ不変条件を共有する全経路（>= 1）
  approach: string                           // 推奨する修正の方向
}

// Finding.remediation?: FindingRemediation
```

型は `src/kernel/report-result.ts` に定義し、`src/core/port/report-result.ts` が re-export する（`Finding` / `DecisionOption` と同じ流通経路）。`src/state/schema/types.ts` の persisted 型は `Finding` を型参照しているためフィールド追加だけで追随する。

remediation を型レベルで optional にすることで、remediation を持たない既存 persisted finding がそのまま型検査を通る。必須性は「型」ではなく「live tool call の parse 規則」で表現する（D3）。

### D2: 必須化の適用範囲は「fixer に流れる judge step」に限定する

remediation の fail-closed 必須化を適用するのは **code-review / custom reviewer / spec-review / conformance / regression-gate**（`parseJudgeReportInput` 系）。**request-review は適用外**（`parseRequestReviewReportInput`）。

request-review の finding は fixer に渡らず人間に返る（needs-discussion）。sites / approach を要求しても消費者がおらず、pipeline gate で needs-discussion を誤爆させるだけの副作用になる。逆に spec-review / conformance / regression-gate の fixable finding は spec-fixer / code-fixer / implementer に流れ、regression-gate ledger にも載るため、同じ契約を課す価値がある。

### D3: 必須性は parse 層で fail-closed に強制し、既存 escalation 経路に合流させる

`parseFindings` の signature を `parseFindings(raw, strict = false, requireRemediation = false)` に拡張する（第 3 引数は additive、既存呼び出しは無変更）。

- `strict && requireRemediation` かつ `resolution === "fixable"` で remediation 欠落 → `{ ok: false, reason: "remediation-missing" }`
- remediation が存在するが不正形（invariant / approach が空、sites が非配列 / 空 / 要素不正）→ `{ ok: false }`（resolution 問わず）
- 非 strict（persisted 再読込・legacy）→ 要求しない。整形式なら捕捉、不正形なら黙って落とす

`parseJudgeReportInput` は `parseFindings(obj.findings, true, true)` を呼び、remediation 起因の失敗のときだけ `missingFields: ["findings.remediation"]` を返す。

**fail-closed が approved を作らないことの保証**: parse 失敗 → runner が tool result を捕捉しない → 最大 2 回の再試行 → それでも失敗すれば `toolResult === null` → `step-completion.ts:293-306` により judge step は **escalation**。`findings: []`（approved）に化ける経路は存在しない。この不変条件を drift-guard テスト（`src/core/step/__tests__/fail-closed-drift-guard.test.ts`）で固定する。

### D4: 自 site の包含は「検証」ではなく「正規化」で保証する

`sites` に finding 自身の `file` が含まれない場合、parse 層が `{ file, line }` を先頭に補完する（`file|line` で dedupe）。これは reject 条件にしない。

「sites は finding の file:line を含む」は消費者側（fixer / gate）が依存する不変条件だが、その違反は情報欠落ではなく記法の抜けである。reject にすると些末な書式で job 全体が escalation する。補完なら不変条件は常に成立し、fail-closed の発火点は「方針そのものが無い」場合だけに絞れる。

### D5: identity（fingerprint / ledgerRef / findingKey）は remediation を含めない

`findingFingerprint`（`file|line|title`）、`computeLedgerRef`（その SHA-256 先頭 8 hex）、`computeFindingKey`（`step|file|line|title|rationale`）はいずれも変更しない。remediation は identity に寄与しない。

ledgerRef は wontfix provenance の解決に使われ、過去 job の persisted 値と一致し続ける必要がある。remediation を含めると、同一欠陥が方針の言い回し違いで別 entry になり、dedupe / wontfix が壊れる。sites を ledger に載せるのに identity 変更は不要である（ledger entry は `Finding` そのものを保持しているため、remediation はすでに entry に同伴して運ばれる）。

### D6: fixer への受け渡しは「1 finding = invariant + 全 sites + approach + evidence path」に統一する

`buildFindingsBlock` は remediation を持つ finding に対して `**Invariant**` / `**Sites (fix all in this iteration)**`（全 site を 1 行ずつ）/ `**Approach**` を追加出力する。remediation を持たない finding の出力は変えない（legacy 互換）。ブロック内に 1 件でも remediation があれば末尾に全 site 同時修正指令を付す。

evidence file path は structured findings がある経路でも必ず prompt に含める。対象は code-fixer の 3 経路（conformance / coordinator / 通常）、spec-fixer の 2 経路（conformance / 通常）、および `buildContinuationMessage` の structured 分岐。coordinator 経路では needs-fix member 全員の result path を列挙する。path は「参照用。機械 parse はしない」と明示する。

`code-fixer-system.ts` の「最小限の機械的修正」を「finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正」に改める。finding に無関係な変更を禁じる意味は維持する。

### D7: adapter の retry / 診断経路は本変更で触らない

parse 失敗時の再試行文面（local runtime は `no-tool-call` 固定）や tool result のエラー返却は変更しない。fail-closed の安全性（escalation）は adapter を触らずに成立する（D3）。`missingFields: ["findings.remediation"]` を返す準備だけ整えておき、文面改善は別 Issue とする。

### D8: reviewer 側の記述は共有 fragment 1 本で供給する

`src/prompts/judge-rules.ts` に `FINDING_REMEDIATION_DEFINITION` を追加し、`custom-reviewer-system.ts` / `code-review-system.ts` / `spec-review-system.ts` / `conformance-system.ts` / `regression-gate-system.ts` の Completion（finding 形式）へ注入する。各 prompt の JSON 例にも remediation を追記する。`request-review-system.ts` には注入しない（D2）。

fragment には形式定義に加えて**走査義務**を記す：「finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路・同じ検査を行う別レイヤを走査し、成立していない箇所をすべて sites に列挙する。1 site しかない場合は、走査したうえで 1 件であることを rationale か evidence file に記す。」

reviewer 定義（user 提供）ではなく CLI が所有する judge contract 側に置くことで、reviewer ごとの重複記述と drift を防ぐ。既存の `DECISION_NEEDED_DEFINITION` / `SEVERITY_DEFINITION` と同じ供給形式に揃える。

### D9: regression-gate は ledger entry の全 site を検証単位にする

`buildLedgerEntry` は remediation を持つ entry に `**Invariant**` と `**Sites**`（全列挙）を追加出力する。`REGRESSION_GATE_SYSTEM_PROMPT` の Method に「ledger entry に Sites がある場合、列挙された全 site で不変条件が成立しているか確認し、いずれかで破れていれば退行として報告する」を追加する。退行 finding 自身も remediation を持ち（D2 適用対象）、gate は ledger entry の invariant / sites を自分の finding.remediation に引き継ぐよう指示される。`ledgerRef` は従来どおり verbatim echo。verdict 導出（`deriveRegressionGateVerdict`）は変更しない。

### D10: schema は optional、null は absent として正規化する

`report-tool.ts` の `remediationSchema` は `optional(object({ invariant, sites: array(object({file, line: optional(number)})), approach }))` とし、`findingSchema` / `conformanceFindingSchema` の両方に追加する。parse 層は `remediation === null` と `site.line === null` を absent として扱う（codex strict mode が optional を nullable+required に変換するため、null 到達は正常系）。managed（`toJSONSchema`）と codex（`toOpenAIStrictSchema`、再帰変換）はいずれもネスト object / array を扱えるため、同一 schema で 3 runtime を通せる。

## Alternatives Considered

### Alternative 1: `Finding` を flat に拡張する（D1 に対して）

`invariant` / `sites` / `approach` を `Finding` のトップレベルに直接追加する。

- **Pros**: ネスト object を導入しないため schema がシンプル。既存 `Finding` の拡張コストが最小。
- **Cons**: 3 フィールドが常に同伴すべき単位であることが型に現れない。「invariant だけある finding」や「approach だけある finding」が型検査を通ってしまう。
- **Why not**: 3 フィールドをひとつのネスト object にまとめることで、remediation を持つ / 持たないの境界が型レベルで明確になる。flat 拡張では消費者が個別フィールドの存在を毎回チェックする必要が生じ、契約の強度が下がる。

### Alternative 2: side-car 配列（`remediations: []` を findings と並置し index で対応付け）（D1 に対して）

`reportResult` の直下に `remediations: FindingRemediation[]` を置き、`findings[i]` と `remediations[i]` を index で対応付ける。

- **Pros**: `Finding` 型を変更しないため既存コードへの影響が最小。
- **Cons**: index 対応は persisted state 上で壊れやすい。findings の順序変更・フィルタリング・部分 parse のたびに index がずれるリスクがある。
- **Why not**: finding と remediation が同一オブジェクトに収まる D1 の方が、persisted state の透過保存（event-journal が `toolResult` を丸ごと保存する方式）と整合する。index 管理のための追加ロジックも不要になる。

### Alternative 3: `sites` を `string[]`（"file:line" 形式）にする（D1 に対して）

`sites` フィールドを `{ file: string; line?: number }[]` ではなく `"commit-push.ts:584"` 形式の文字列配列にする。

- **Pros**: JSON schema が単純になり、agent が出力しやすい。
- **Cons**: 消費者（buildFindingsBlock・ledger）が毎回文字列分解（`split(":")`）する必要が生じる。既存 `Finding.file` / `Finding.line?` の意味と乖離し、path helper（`util/paths`）との接続が複雑になる。
- **Why not**: 既存の `file: string; line?: number` 対を sites にも使うことで、worktree-relative path の意味が統一され、型変換なしに ledger・gate が直接利用できる。

### Alternative 4: remediation 必須化を全 judge step に一律適用（D2 に対して）

request-review を含む全 judge step で remediation を必須化し、contract を単一化する。

- **Pros**: 適用範囲の例外なしで規約が単純。どの judge step の finding も同じ形式になる。
- **Cons**: request-review の finding は fixer に渡らず人間に返る（needs-discussion）。sites / approach の消費者がおらず、remediation 欠落による escalation だけが増える。
- **Why not**: request-review step で escalation リスクを負うことで得られるものがない。fixer に流れる step のみに限定することで、契約のコストが価値と釣り合う（D2）。

### Alternative 5: 必須化を code-review + custom reviewer のみに限定（D2 に対して）

痛点の中心である code-review と custom reviewer の fixable finding だけを対象にし、spec-review / conformance / regression-gate は除外する。

- **Pros**: 変更範囲が小さく、既存テストへの影響が少ない。
- **Cons**: ledger は spec-review 由来 finding も含む（`collectSpecReviewLedger`）。regression-gate が sites を持つ entry と持たない entry の混在に常時晒され、gate の全 site 検証（D9）が一部の entry にしか機能しない。
- **Why not**: ledger の混在を避けるために、fixer に流れる全 judge step（spec-review / conformance / regression-gate を含む）に同じ契約を課す必要がある。

### Alternative 6: remediation 欠落の finding だけを drop する（D3 に対して）

remediation が欠落している fixable finding を report から除外し、残りの finding だけで処理を継続する。

- **Pros**: 1 件の欠落が job 全体を止めず、他の finding は正常に処理される。
- **Cons**: 除外した finding の resolution が "fixable" であれば、findings が空になったときに verdict が `approved` に化ける経路を作る。request.md が「fail-closed によって finding 自体が消える（needs-fix が approved に化ける）経路を作らない」と明示的に禁止している。
- **Why not**: 欠落を drop するのは fail-open であり、契約の enforcement 目的と真逆。parse 全体の失敗として扱い、既存 escalation 経路に合流させる（D3）。

### Alternative 7: remediation 欠落の finding を `decision-needed` に強制変換する（D3 に対して）

remediation がない fixable finding の resolution を自動的に `decision-needed` に書き換え、finding 自体は保持する。

- **Pros**: finding が消えず、人間のレビュー対象として表面化する。
- **Cons**: `resolution: "fixable"` を `decision-needed` に変換すると、verdict 導出（`judge-verdict.ts`）が escalation を出すことになり、verdict 導出規則を実質的に変更する。
- **Why not**: 「verdict 導出（`judge-verdict.ts`）の意味を変更しない」という制約に抵触する。parse 失敗 → escalation の経路が同じ結果を、verdict 導出を変えずに達成できる（D3）。

### Alternative 8: 欠落時に CLI 側で remediation を自動合成する（D3 に対して）

`invariant = title`、`sites = [{ file, line }]`、`approach = rationale` として、CLI が remediation を合成して補完する。

- **Pros**: escalation を出さず、fixer が常に remediation 付き finding を受け取れる。backward compatibility が高い。
- **Cons**: fail-open となり、reviewer が隣接経路を走査して sites を列挙する動機がなくなる。「隣接経路を直す」という本変更の目的が空洞化する。
- **Why not**: 合成 remediation は「走査したか」を検証できない偽の契約になる。ただし D4 の「自 site の先頭補完」は、sites を reviewer が提供しているうえで自 site を含め忘れた場合の記法補完として例外的に採用する。

### Alternative 9: 自 site 不包含を strict 検証して reject する（D4 に対して）

`sites` に finding 自身の `file` が含まれない場合、parse エラーとして `{ ok: false }` を返す。

- **Pros**: 「sites は finding の file:line を含む」不変条件を型レベルで厳密に強制できる。
- **Cons**: 書式の抜け（主 site を sites に書かなかっただけ）で job 全体が escalation する。reviewer が些末な書式エラーを恐れて finding 報告を避ける誘因になる（request.md の Stop Condition 1 に接近）。
- **Why not**: 情報欠落ではなく記法の抜けである。parse 層が先頭に補完することで不変条件を常に成立させ、fail-closed の発火点を「方針そのものが無い」ケースだけに絞れる（D4）。

### Alternative 10: 自 site 補完を消費者側（buildFindingsBlock / ledger）で行う（D4 に対して）

parse 層は補完せず、buildFindingsBlock や ledger の各消費者が自 site の存在を確認して補完する。

- **Pros**: parse 層の責務が「整形式かどうか」のみに限定される。
- **Cons**: 補完ロジックが複数箇所に散り、drift のリスクが生じる。parse の出力が「自 site を含む保証がない `sites`」になるため、消費者は全員防御的コードが必要になる。
- **Why not**: parse を単一の正規化点とすることで、消費者は「自 site が先頭に存在する sites」を前提に実装できる（D4）。

### Alternative 11: site 単位に ledger entry を分割する（D5 に対して）

1 finding × N sites を N 個の ledger entry に分解し、site ごとに独立した fingerprint を付与する。

- **Pros**: ledger が site 単位の identity を持ち、regression-gate が site 単位で wontfix / resolved を追跡できる。
- **Cons**: site ごとに新しい fingerprint が必要になり、既存 `ledgerRef`（`file|line|title` の SHA-256 先頭 8 hex）との互換が壊れる。過去 job の persisted wontfix provenance が無効化される。regression-gate の verdict 集計単位も finding 単位から site 単位へ変わり、影響が広い。
- **Why not**: `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` の identity を変えないことが設計制約（D5）。ledger entry は `Finding` そのものを保持しているため、remediation（sites を含む）は entry に同伴して運ばれる。identity 変更なしに sites を ledger に載せられる。

### Alternative 12: evidence file の内容を prompt に埋め込む（D6 に対して）

path を渡すだけでなく、evidence file（`cross-boundary-invariants-result-NNN.md`）の全文を fixer の prompt に inline で展開する。

- **Pros**: fixer が evidence file を読む手間が省け、不変条件の詳細な記述にアクセスできる。
- **Cons**: evidence file の機械解釈を行わないという原則（request.md Non-goals）に反する。evidence file のサイズが予測不能なため prompt 長が制御できなくなり、fixer の context 圧迫リスクが高い。
- **Why not**: typed finding + remediation が構造化された正典。evidence file は証拠であり、path を渡して参照可能にするだけで十分（D6）。

### Alternative 13: 全 site 同時修正指令を各 step の user message に個別記述する（D6 に対して）

`buildFindingsBlock` ではなく、code-fixer / spec-fixer / implementer の各 `buildMessage` に個別に「全 site を同一イテレーションで修正せよ」と記述する。

- **Pros**: step ごとに文言を微調整できる。
- **Cons**: 3 step × 複数経路（code-fixer 3 経路 + spec-fixer 2 経路）で同じ指令を重複記述することになり、drift が生じやすい。
- **Why not**: `buildFindingsBlock` は code-fixer / spec-fixer / implementer の共有点であり、ここに一度書けば全経路に届く。単一定義で drift を防げる（D6）。

### Alternative 14: claude-code runner だけ `invalid-input` 再試行に切り替える（D7 に対して）

parse 失敗時の再試行文面を local claude-code runtime のみ `no-tool-call` から `invalid-input`（`missingFields` 込みの詳細文面）へ切り替える。

- **Pros**: remediation 欠落の原因が再試行プロンプトに明示され、reviewer の recovery 率が上がる可能性がある。
- **Cons**: claude-code / managed / codex の 3 runtime 間で再試行挙動が非対称になる。adapter 3 実装の verification 範囲が広く、本変更の目的（契約の追加）と独立に評価すべき変更になる。
- **Why not**: fail-closed の安全性（escalation）は adapter を触らずに成立する。`missingFields: ["findings.remediation"]` を返す準備だけ整えておき、文面改善は別 Issue とする（D7）。

### Alternative 15: regression-gate が sites を再走査して新規 site を発見する（D9 に対して）

gate が ledger entry の sites に留まらず、コードベースを自律的に走査して不変条件を共有する新規 site を発見・報告する。

- **Pros**: 元の finding で sites を見落としていた場合も gate が補完できる。
- **Cons**: gate は「ledger に存在する finding の退行を検証する」役割であり、「ledger 外の新規 finding を報告しない」規律に反する。gate が finder として振る舞うと、verdict 集計単位が変わり regression-gate の責務が曖昧になる。
- **Why not**: 新規 site の発見は reviewer の走査義務（D8 fragment）が担う。gate の責務は ledger 上の不変条件が維持されているかの検証に限定し、責務の分離を保つ（D9）。

## Consequences

### Positive

- reviewer が finding を報告する時点で「破れた不変条件」「その不変条件を共有する全 site」「推奨する修正の方向」が typed contract として流通する。fixer と regression-gate がこれを機械的に受け取れる。
- fixer は「列挙された全 site を同一イテレーションで修正する」ことが指示され、隣接経路の露出によるイテレーション増が構造的に抑制される。
- fail-closed の発火点（fixable finding で方針が無い）は approved への誤変換を既存の escalation 経路で阻止し、新規 halt 経路を追加しない。
- regression-gate は片側だけ直った状態を ledger entry の sites 検証で検出できる。
- persisted state への影響はゼロ（additive）。既存 job の resume・rollback が壊れない。
- `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` の identity は不変であり、wontfix provenance・dedupe が既存どおり機能する。

### Negative

- fixable finding に remediation を要求する judge step で、reviewer が remediation を省略した場合は escalation になる。運用初期は reviewer の tool call 品質が低い場合にジョブ停止が増える可能性がある。
- fixer の prompt が finding 1 件あたり invariant 1 行 + sites N 行 + approach 1 行分伸びる（evidence file path は追加される）。
- 既存の live tool call を模した parse テスト（remediation なしの fixable finding を strict parse に通す）が赤化し、更新が必要になる（persisted 読取テストは非 strict のため無影響）。
- `FINDING_REMEDIATION_DEFINITION` を shared fragment として 5 system prompt に注入するため、fragment の変更が広く波及する。

### Known Debt / Deferred

- parse 失敗時の再試行文面（`no-tool-call` 固定）を `invalid-input`（`missingFields` 込み）へ切り替えることは本変更のスコープ外（D7 Open Questions Q2）。
- inbox / `specrunner status` などの CLI 表示層に remediation を出すことは Non-goal（Open Questions Q4）。
- `sites` に「不変条件が既に成立している site（確認済み・修正不要）」を含めることを許すかの規律は evidence file 側に委ね、型レベルの区別は設けない（Open Questions Q3）。
- 必須化の適用範囲を「request-review を含む全 judge step」へ拡大するかの判断は、運用実績を見て別 Issue で検討する（Open Questions Q1）。

## References

- Request: `specrunner/changes/finding-remediation-contract/request.md`
- Design: `specrunner/changes/finding-remediation-contract/design.md`
- Spec: `specrunner/changes/finding-remediation-contract/spec.md`
- Evidence: `specrunner/changes/archive/2026-08-29-exclusion-aware-publish-prediction/cross-boundary-invariants-result-001〜005`
- Evidence: `specrunner/changes/archive/2026-08-23-push-capability-preflight/cross-boundary-invariants-result-001〜006`
- Implementation: `src/kernel/report-result.ts`・`src/core/port/report-result.ts`・`src/core/step/report-tool.ts`・`src/core/step/fixer-helpers.ts`・`src/core/step/code-fixer.ts`・`src/core/step/spec-fixer.ts`・`src/core/pipeline/findings-ledger.ts`・`src/core/step/regression-gate.ts`・`src/prompts/judge-rules.ts`・`src/prompts/code-fixer-system.ts`・`src/prompts/custom-reviewer-system.ts`
- Drift-guard test: `src/core/step/__tests__/fail-closed-drift-guard.test.ts`
- Parse test: `src/core/port/__tests__/remediation-parse.test.ts`
