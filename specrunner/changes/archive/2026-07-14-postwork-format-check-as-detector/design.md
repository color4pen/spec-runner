# Design: post-work の決定論的 self-check を outputContract（detect→repair）へ移す

## Context

agent step は work turn が success で完了した後、`shouldRunFollowUp` が true のとき
`AgentRunContext.policy.postWorkPrompts` を **無条件**に順次実行する（`src/adapter/claude-code/agent-runner.ts` の
post-work ループ、`src/adapter/managed-agent/agent-runner.ts` / `src/adapter/codex/agent-runner.ts` も同型）。
post-work turn では tool call は意図的に捕捉されない。

この post-work turn のうち 2 つは **決定論的に検査可能な形式** を対象にしている:

- **design** の `followUpPrompt`（`src/core/step/design.ts`）: spec.md が
  `### Requirement:` header・`#### Scenario:`・本文の `SHALL`/`MUST` を持つかを agent に確認させる。
  すべて文字列マッチで機械検査できる。
- **code-review** の `followUpPrompt`（`src/core/step/code-review.ts`）: review-feedback ファイルの
  Findings が Markdown テーブル形式か・必須 7 カラムが揃うか（item 1, 2）と、Fix カラムの値・severity の
  定義整合（item 3, 4）を確認させる。item 1, 2 は機械検査できる。

形式が正しい通常ケースでも、これらは毎回 AI ターンを 1 つ消費する。design は spec-change / new-feature で
opus を使う最も高価な step なので損失が大きい。

spec-runner には既に決定論の detect→repair seam がある。`OutputContract`（`src/core/port/output-contract.ts`）は
`kind`（現状 `"produced"` / `"tasks-complete"`）と `policy`（`"halt"` / `"follow-up"`）を持つ。
step が `outputContracts(state, deps)` で契約を宣言し、runtime の `validateStepOutputs`
（`src/core/runtime/local.ts` は worktree fs、`src/core/runtime/managed.ts` は branch git state を読む）が
**ゼロトークン**で検出し、`policy: "follow-up"` の violation は agent-runner の outputVerification ループが
**同一 session** へ repair prompt を送って修復させる（`buildOutputFollowUpPrompt`、最大
`OUTPUT_FOLLOWUP_MAX_ATTEMPTS = 2`）。session 後、executor の出力ゲート（`src/core/step/executor.ts` の
`buildAllOutputContracts` → `validateStepOutputs` → `partitionByPolicy`）が残存 violation を最終判定し、
`halt` / 残った `follow-up` のいずれかがあれば `STEP_OUTPUT_MISSING` で停止する。

`implementer` の `tasks-complete` 契約（`src/core/step/implementer.ts`）が follow-up policy の実証済み前例である。

## Goals / Non-Goals

**Goals**:

- 決定論的な形式検査を無条件 post-work turn から `OutputContract`（policy `"follow-up"`）へ移す。
  形式が正しい通常ケースでは AI ターンをゼロにし、違反時のみ従来どおり同一 session で修復させる。
- 汎用の content 形式検査 kind を 1 つ追加し、`"produced"` / `"tasks-complete"` の隣に差す。
  検出は local / managed 両 `validateStepOutputs` に実装する。並行機構は作らない。
- design の形式 self-check を spec 必須 type に限定して `outputContracts` へ移す。
- code-review の Markdown テーブル形式・必須カラム検査を `outputContracts` へ移す。
- 形式違反の修復挙動を保存する（valid → 検査による post-work / repair turn ゼロ、invalid → repair 発火）。

**Non-Goals**:

- 決定論的に検査できない意味的 self-check（adr-gen の Alternatives 自己修正、code-review の severity 定義整合など）は
  無条件 post-work のまま残す。
- rules follow-up の条件化・再配置（別 request）。
- post-work ループ全体の一般的な条件化。形式検査以外の post-work prompt の扱いは変えない。
- 完了契約の初回注入・ターン種別 metrics（別 request で対応済み）。
- `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` の変更、outputVerification / executor ゲートの制御フロー変更。

## Decisions

### D1: 汎用 content 形式検査 kind `"content-format"` を追加する

`OutputContractKind` に `"content-format"` を追加する。用途別 kind（`"spec-format"` / `"review-table-format"`）を
複数足すのではなく、**宣言的な検査リストを持つ 1 つの汎用 kind** にする。

`OutputContract` に任意フィールド `checks?: ContentFormatCheck[]` を追加する:

```ts
export interface ContentFormatCheck {
  /** 違反時に repair prompt / halt メッセージへ出す人間可読ラベル（= 検査ルールの説明）。 */
  label: string;
  /** content がこの正規表現に match する SHALL。match しなければこの check は失敗。 */
  pattern: string;
  /** RegExp flags（例: "m"）。省略時は flag なし。 */
  flags?: string;
}
```

検査の意味論: content から HTML コメント（`<!-- ... -->`）を除去したうえで、各 check の
`new RegExp(pattern, flags)` が **match すれば合格、match しなければ失敗**。失敗した check の `label` を
`OutputViolation.detail` に集約する。detail が空でなければ（＝ 1 件以上失敗、または file 欠落）violation を 1 件 emit する。

**Rationale**: なぜ用途別 kind でなく汎用 kind + 宣言リストか。用途別 kind は spec.md / テーブルの
ドメイン知識（どの正規表現か）を runtime（`validateStepOutputs`）へ持ち込み、runtime のドメイン中立性
（port DTO の設計原則）を壊す。汎用 kind は runtime を「宣言された正規表現を総当たりするだけ」に保ち、
ドメイン知識（どのルールか）を step 宣言側（design.ts / code-review.ts）に閉じる。`tasks-complete` が
`parseIncompleteTaskLabels` という純関数を runtime へ import する前例に倣い、正規表現評価も純関数
（D2）へ切り出して両 runtime で共有する。

**Alternatives considered**:
- 用途別 kind を 2 つ追加（`"spec-format"` / `"review-table-format"`）。runtime にドメイン別の
  ハードコード検査を置くことになり、中立性を損なう。→ 却下。
- checks に predicate 関数（クロージャ）を持たせる。contract が plain DTO でなくなり、
  detail 生成のためのラベル対応も曖昧になる。宣言的な regex + label の方が検査と repair 文言が対応する。→ 却下。

### D2: 検査ロジックは純関数に切り出し両 runtime で共有する

`src/core/step/output-verify.ts` に純関数を 2 つ追加する:

- `stripHtmlComments(md: string): string` — `<!-- ... -->`（複数行・非貪欲）を除去する。
- `evaluateContentFormatChecks(content: string | null, checks: ContentFormatCheck[]): string[]` —
  失敗した check の label 配列を返す。`content === null` は全 label 失敗として返す。それ以外は
  `stripHtmlComments` 後に各 pattern を test し、match しない check の label を集める。

`local.ts` / `managed.ts` の `validateStepOutputs` は `kind === "content-format"` の分岐で
content を読み（local: `fs.readFile`、managed: `githubClient.getRawFile`）、`evaluateContentFormatChecks` を
呼び、失敗 label が非空なら violation（`detail = 失敗 label`）を push する。runtime 側には正規表現も
ドメイン知識も置かない。

**Rationale**: local / managed で検査ロジックを二重実装すると drift の温床になる。純関数 1 箇所に集約し、
runtime は I/O（fs / GitHub API）だけを担う。これは `tasks-complete` の
`parseIncompleteTaskLabels` 共有と同じ構造で、既存 seam の対称性を保つ。

**Alternatives considered**: 各 runtime に検査を直書き。DRY 違反かつ両 runtime の一致をテストで
担保し続ける負債になる。→ 却下。

### D3: HTML コメントを除去してから検査する

`SPEC_TEMPLATE`（`src/templates/step-output-templates.ts`）の HTML コメント内 EXAMPLE には
`### Requirement:` / `#### Scenario:` / `SHALL` が含まれ、`REVIEW_FEEDBACK_TEMPLATE` の
HTML コメントにも列名例が含まれる。生 content をそのまま grep すると、agent が本文を書かず
コメントを残しただけでも presence 検査が誤って合格しうる。`stripHtmlComments` で agent が
実際に書いた本文だけを検査対象にする。

**Rationale**: 決定論検査が信頼できる（テンプレートの例文に騙されない）ことを保証する。除去は
ドメイン中立な markdown 正規化なので content-format kind の既定挙動として常に適用する。
なお「scaffold のまま未上書き」ケースは `produced`（halt）契約が別途捕捉するため、
content-format はドメイン中立の presence 検査に専念できる。

**Alternatives considered**: 生 content を検査。テンプレート例文で誤合格し、検査が骨抜きになる。→ 却下。

### D4: design の形式 self-check を spec 必須 type 限定の follow-up 契約へ移す

`DesignStep`（`src/core/step/design.ts`）から `followUpPrompt`（全文が
Requirement / Scenario / SHALL の presence self-fix）を**削除**する。代わりに
`outputContracts(state, deps)` を追加し、`isSpecRequired(deps.request.type)` が true のときだけ
`spec.md` に対する content-format 契約（policy `"follow-up"`）を 1 件返す。false（spec-exempt、
例: chore）のときは `[]` を返す。checks は document-level presence:

| label | pattern（代表） | flags |
|-------|----------------|-------|
| spec.md に `### Requirement:` header が存在する | `^###\s+Requirement:` | `m` |
| spec.md に `#### Scenario:` が存在する | `^####\s+Scenario:` | `m` |
| spec.md 本文に normative keyword (SHALL / MUST) が存在する | `\b(SHALL|MUST)\b` | （なし） |

検査は **document-level presence**（各マーカーが 1 件以上あるか）とする。「各 Requirement が
それぞれ Scenario を持つ」という per-requirement 粒度は決定論 grep では信頼できず、その意味的完全性は
下流 spec-review の判断に委ねる。これは要件の「の有無」表現と受け入れ基準（Scenario 欠落 = Scenario ゼロ）に一致する。

限定条件に `isSpecRequired` を用いるのは、既存の produced 契約（`writes()` の
`{ path: spec.md, verify: isSpecRequired(...) }`）と**同一の述語**で spec.md の扱いを揃えるため。
これにより new-feature / spec-change / refactoring / bug-fix（spec 必須）が対象、chore（exempt）が対象外となる。

**Rationale**: design の followUpPrompt は全文が決定論検査なので、丸ごと契約へ移せば無条件 post-work turn を
ゼロにできる（design rules が無い限り post-work は発火しない）。検出は CLI 側でゼロトークン。

**Alternatives considered**: followUpPrompt に残し「違反時のみ実行」する。実行有無の判定自体に 1 ターン要り、
無条件実行の削減にならない。→ 却下。

### D5: code-review のテーブル形式・必須カラム検査を follow-up 契約へ移す

`CodeReviewStep`（`src/core/step/code-review.ts`）に `outputContracts(state, deps)` を追加し、
その iteration の review-feedback ファイルに対する content-format 契約（policy `"follow-up"`）を返す。checks:

| label | 意味 |
|-------|------|
| Findings がヘッダー行と区切り行を持つ Markdown テーブル形式である | テーブル区切り行（`|---|...`）が存在する |
| Findings テーブルに必須 7 カラム（# / Severity / Category / File / Description / How to Fix / Fix）が順に揃う | 7 カラムを含むヘッダー行が存在する |

`followUpPrompt` からは item 1（テーブル形式）と item 2（必須カラム）を**削除**し、決定論だが
per-row 値レベルの item 3（Fix カラムが全 finding で yes/no）と、意味的な item 4（severity 定義整合）を
**残す**（2 項目に採番し直す）。intro（review-feedback を Read）と action（review-feedback を修正）は保持する。

**空 findings（approved）ケースの保存**: review-feedback テンプレートはヘッダー行 + 区切り行を
あらかじめ配置し、指摘ゼロでも本体行なしの空テーブルとして残す運用になっている。ヘッダー・区切り行が
残る限り 2 つの check は合格し、健全な approved レビューで repair は発火しない。

**Rationale**: 要件が名指しする移設対象は「テーブル形式・必須カラムの有無」であり、これらは
presence 検査で決定論表現できる。item 3（Fix 値）は決定論だが per-row 値レベルで、D1 の
presence-regex モデルでは表現しない。item 4 は真に意味的。両者はこの request の名指しスコープ外
（構造的形式のみ）であり、意味的 / 値レベル self-check を無条件 post-work に残すという Non-Goals に沿う。
value-level 検査へのモデル拡張は将来 request に委ねる。

**Alternatives considered**: content-format モデルを per-row 値検査（Fix セル ∈ {yes,no}）まで拡張して
item 3 も移す。scope と実装・テスト面が広がり blast radius が増す。名指しスコープ（構造的形式）に絞る。→ 却下。

### D6: follow-up 契約の last-resort halt を継承する（挙動保存の範囲）

content-format を `policy: "follow-up"` の契約として差すことで、seam 固有の last-resort halt を継承する:
in-session repair を `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` 回試みてもなお形式違反が残る場合、
executor の出力ゲート（`partitionByPolicy` の follow-up 残存）が `STEP_OUTPUT_MISSING` で halt → escalation する。
これは `tasks-complete` と同一の性質であり、`makeOutputGateHalt`（`src/core/step/step-halt.ts`）が
content-format violation の失敗 label を halt メッセージへ描画するよう合わせる。

観測挙動の保存範囲を明示する:
- **通常ケース（valid、または違反 → 修復）**: 従来と同一。valid は検査由来の post-work / repair turn ゼロ、
  違反は同一 session で修復されて step は commit へ進む。
- **病的ケース（agent が予算内に形式を満たせない）**: 従来 advisory な followUpPrompt は halt できなかったが、
  移設後は escalation する。これは選んだ seam に内在する強化であり、恒常的に壊れた spec.md / 
  review-feedback が下流へ黙って流れる代わりに escalation する。新たな安全制約を足したのではなく、
  実証済み seam を再利用した帰結である。

verdict 導出・pipeline 遷移の観測挙動（通常経路）は不変。

**Rationale**: request は「produced / tasks-complete の隣に新 kind を差し、並行機構は作らない」ことを求める。
halt しない advisory な follow-up 変種を新設すると seam の並行分岐になる。seam をそのまま再利用し、
その last-resort halt を受け入れて明示する。

## Risks / Trade-offs

- [Risk] design の per-requirement 粒度検査が document-level presence に弱まる（複数 Requirement のうち
  一部だけ Scenario を持つケースを見逃す） → Mitigation: 意味的完全性は下流 spec-review が判断する。
  request の「の有無」表現と受け入れ基準に一致。決定論 grep で per-requirement 対応は元来不可能。
- [Risk] 病的ケースで従来 advisory だった design 形式検査が escalation に縮退し、
  spec-review → spec-fixer の自動回復経路を短絡する → Mitigation: 縮退は予算内（work 1 + repair 2 回）で
  `#### Scenario:` 行すら足せない機械的異常時のみ。`tasks-complete` と同じ扱いで、escalation が妥当な最終手段。
- [Risk] managed runtime の in-session detect() は `getRawFile` で branch git state を読むため、
  agent が artifact を push 済みであることに依存する → Mitigation: 既存の produced / tasks-complete 契約と
  同一のタイミング依存であり、新たな push 順序は導入しない。
- [Risk] content-format の生 content 検査がテンプレート例文で誤合格する → Mitigation: D3 の
  `stripHtmlComments` で本文だけを検査。
- [Trade-off] code-review は意味的 / 値レベル self-check（item 3, 4）のため無条件 post-work turn を 1 つ残す。
  design ほど turn 削減は徹底しないが、Non-Goals（意味的 self-check は無条件のまま）に沿う意図的判断。

## Open Questions

なし。設計判断は D1–D6 で確定。
