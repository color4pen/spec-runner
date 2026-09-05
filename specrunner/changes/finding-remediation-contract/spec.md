# Spec: reviewer finding remediation contract

## Requirements

### Requirement: fixable finding は remediation 契約を伴わなければならない

fixer に findings が流れる judge step（code-review / custom reviewer / spec-review / conformance / regression-gate）の
完了報告を parse するとき、システムは `resolution: "fixable"` の各 finding が
`remediation`（`invariant: string` / `sites: {file, line?}[]` / `approach: string`）を持つことを SHALL 要求する。
欠落した場合、システムは findings 配列全体の parse を失敗させ、`missingFields` に `findings.remediation` を含めて返さなければならない（MUST）。
`resolution: "decision-needed"` の finding では remediation は任意とする。

#### Scenario: fixable finding に remediation があると parse が成功する

**Given** custom reviewer が `ok: true`、`evidence` あり、`resolution: "fixable"` の finding 1 件を報告し、
その finding が `remediation.invariant`（非空）、`remediation.sites`（1 件以上）、`remediation.approach`（非空）を持つ
**When** CLI が judge の完了報告を parse する
**Then** parse は成功し、返された finding の `remediation.invariant` / `sites` / `approach` が入力どおり保持されている

#### Scenario: fixable finding に remediation が無いと parse が失敗する

**Given** custom reviewer が `ok: true`、`evidence` あり、`resolution: "fixable"` の finding 1 件を報告し、
その finding が `remediation` を持たない
**When** CLI が judge の完了報告を parse する
**Then** parse は失敗し、`missingFields` に `findings.remediation` が含まれる

#### Scenario: decision-needed finding は remediation なしでも parse が成功する

**Given** judge step が `ok: true`、`evidence` あり、`resolution: "decision-needed"` で `options` を 2 件持つ finding を報告し、
その finding が `remediation` を持たない
**When** CLI が judge の完了報告を parse する
**Then** parse は成功し、その finding の `remediation` は未設定である

#### Scenario: sites が空配列の remediation は拒否される

**Given** judge step が `resolution: "fixable"` の finding を報告し、その `remediation.sites` が空配列である
**When** CLI が judge の完了報告を parse する
**Then** parse は失敗し、その完了報告から findings は採用されない

#### Scenario: request-review は remediation を要求しない

**Given** request-review が `ok: true`、`evidence` あり、`resolution: "fixable"` で `remediation` を持たない finding を報告する
**When** CLI が request-review の完了報告を parse する
**Then** parse は成功し、finding は従来どおり保持される

### Requirement: remediation の欠落は approved を生成してはならない

remediation 欠落による parse 失敗は、needs-fix 相当の finding を消して approved に転じてはならない（MUST NOT）。
再試行後も有効な完了報告が得られない judge step の verdict は escalation とし（SHALL）、
verdict 導出規則そのものは変更しない。

#### Scenario: remediation 欠落で完了報告が採用されなかった judge step は escalation になる

**Given** judge step が最後まで有効な完了報告を返さず、記録された toolResult が null である
**When** CLI が step の verdict を導出する
**Then** verdict は `escalation` であり、`approved` にはならない

#### Scenario: findings が空の完了報告は従来どおり approved になる

**Given** custom reviewer が `ok: true`、`evidence.checked >= 1`、`findings: []` で完了報告する
**When** CLI が verdict を導出する
**Then** verdict は `approved` であり、remediation の要求は発火しない

### Requirement: sites は finding 自身の site を必ず含む

remediation を採用するとき、システムは `sites` に finding 自身の `file` を含む要素が存在することを SHALL 保証する。
存在しない場合、システムは finding の `{file, line}` を `sites` の先頭に補完しなければならない（MUST）。補完は parse 失敗にしない。

#### Scenario: 自 site が欠けている sites は先頭に補完される

**Given** `file: "src/a.ts"`, `line: 10` の fixable finding が、`sites: [{file: "src/b.ts", line: 20}]` のみを持つ
**When** CLI が完了報告を parse する
**Then** parse は成功し、その finding の `sites` は `src/a.ts:10` を先頭に含み、`src/b.ts:20` も保持している

#### Scenario: 自 site が既にある場合は重複追加されない

**Given** `file: "src/a.ts"`, `line: 10` の fixable finding が `sites: [{file: "src/a.ts", line: 10}, {file: "src/b.ts"}]` を持つ
**When** CLI が完了報告を parse する
**Then** その finding の `sites` は 2 件のままである

### Requirement: remediation を持たない既存 finding は additive に読み込める

persisted state / events に保存された remediation を持たない finding を読むとき、
システムは migration や schema version 更新を要求せず、従来どおり ledger 生成・dedupe・wontfix provenance を成立させなければならない（MUST）。
また remediation を持つ finding を保存し再読込したとき、remediation は欠落せずに復元されなければならない（MUST）。

#### Scenario: 旧 persisted finding から ledger が生成される

**Given** state に remediation を持たない fixable finding のみを含む reviewer run が存在する
**When** regression-gate の ledger を計算する
**Then** その finding は ledger に含まれ、`computeLedgerRef` は remediation 導入前と同じ値を返す

#### Scenario: remediation は永続化と復元を往復する

**Given** remediation を持つ finding を含む toolResult が step の完了として記録される
**When** イベント journal から state を復元する
**Then** 復元された finding の `remediation.invariant` / `sites` / `approach` は記録時と同一である

### Requirement: finding の identity は remediation に依存しない

`findingFingerprint` / `computeLedgerRef` / `computeFindingKey` は remediation を入力に含めてはならない（MUST NOT）。

#### Scenario: remediation の有無で ledgerRef が変わらない

**Given** `file` / `line` / `title` / `rationale` が同一で、一方だけが remediation を持つ 2 つの finding
**When** それぞれの `findingFingerprint` と `computeLedgerRef` を計算する
**Then** 2 つの値はそれぞれ一致する

### Requirement: fixer プロンプトは invariant / 全 sites / approach / evidence path を含む

structured findings を fixer に渡すとき、システムは remediation を持つ finding について
invariant、`sites` の全要素、approach をプロンプトへ展開しなければならない（MUST）。
さらに「列挙された全 site を同一イテレーションで修正し、approach より狭い修正を選ぶ場合は理由を出力に残す」指示を
SHALL 含める。加えて code-fixer / spec-fixer は structured findings がある場合も evidence file の path を
参照として SHALL 含める（内容は機械解釈しない）。

#### Scenario: 2 site を持つ finding の両方が fixer プロンプトに現れる

**Given** `src/core/step/commit-push.ts:584` と `src/core/pipeline/parallel-review-round.ts:401` を sites に持つ
fixable finding が custom reviewer から報告されている
**When** code-fixer の初回メッセージを構築する
**Then** メッセージには両方の site（`src/core/step/commit-push.ts` と `src/core/pipeline/parallel-review-round.ts`）と
invariant、approach、および全 site 同時修正の指示が含まれる

#### Scenario: code-fixer は structured findings があっても evidence file path を含める

**Given** custom reviewer の needs-fix によって code-fixer が起動し、structured findings が 1 件以上ある
**When** code-fixer の初回メッセージを構築する
**Then** メッセージには当該 reviewer の result file path が参照として含まれる

#### Scenario: spec-fixer は structured findings があっても evidence file path を含める

**Given** spec-review の needs-fix によって spec-fixer が起動し、structured findings が 1 件以上ある
**When** spec-fixer の初回メッセージを構築する
**Then** メッセージには spec-review の result file path が参照として含まれる

#### Scenario: 継続セッションの fixer プロンプトも remediation と evidence path を含む

**Given** code-fixer に前回 session があり、新しい structured findings（remediation 付き）が渡される
**When** 継続用メッセージを構築する
**Then** メッセージには invariant / 全 sites / approach と evidence file path が含まれる

#### Scenario: remediation を持たない finding の出力は従来どおり

**Given** remediation を持たない fixable finding のみが fixer に渡される
**When** findings ブロックを構築する
**Then** 各 finding の出力は severity / title / file:line / resolution / rationale / source のみで構成される

### Requirement: reviewer 向けプロンプトは remediation の記述と隣接経路の走査を要求する

judge contract を供給する共有 fragment は、finding の remediation 形式と、
「finding を 1 つ構成したら同じ不変条件を共有する隣接関数・並列経路を走査し sites に列挙する」義務を SHALL 記述する。
この記述は code-review / custom reviewer / spec-review / conformance / regression-gate の system prompt に含まれ、
reviewer 定義ファイル（`specrunner/reviewers/*.md`）側の記述を要求してはならない（MUST NOT）。

#### Scenario: custom reviewer の system prompt が remediation を要求する

**Given** 任意の reviewer 定義から custom reviewer の system prompt を構築する
**When** 生成された prompt を検査する
**Then** prompt は remediation の 3 要素（invariant / sites / approach）と隣接経路の走査義務を含む

#### Scenario: request-review の system prompt は remediation を要求しない

**Given** request-review の system prompt
**When** prompt を検査する
**Then** remediation の必須要求は含まれない

### Requirement: code-fixer の「最小限」は全 site での不変条件成立を意味する

code-fixer の system prompt は「最小限の修正」を
**「finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正」** と定義しなければならない（MUST）。
finding に無関係な変更（新機能追加・指摘外の大規模リファクタ）の禁止は維持する（SHALL）。
また入力の記述は、初期メッセージに埋め込まれた findings を正典とし evidence file を参照とする実際の受け渡しと一致させなければならない（MUST）。

#### Scenario: code-fixer system prompt が全 site 成立を最小限の定義とする

**Given** code-fixer の system prompt
**When** prompt を検査する
**Then** 「最小限の機械的修正」という単独の定義は存在せず、列挙された全 site で不変条件を成立させる旨の定義が含まれ、
かつ finding 外の変更禁止条項は残っている

#### Scenario: code-fixer system prompt の入力記述が実際の受け渡しと一致する

**Given** code-fixer の system prompt
**When** Method の第 1 手順を検査する
**Then** 「初期メッセージの findings を正典とし、示された evidence file path は参照として読む」旨が書かれており、
prompt に存在しないファイルの読み込みを前提としていない

### Requirement: regression-gate の ledger entry は sites を保持し全 site を検証対象にする

regression-gate に渡す ledger entry は、remediation を持つ finding について invariant と全 sites を SHALL 提示し、
gate は「列挙された全 site で不変条件が成立しているか」を検証対象としなければならない（MUST）。
ledger entry の provenance ref（`ledgerRef`）の値と echo 手順は変更しない。

#### Scenario: ledger block に sites が展開される

**Given** remediation を持つ fixable finding が ledger に載っている
**When** regression-gate の初期メッセージを構築する
**Then** ledger entry には invariant と全 site が表示され、Provenance Ref は remediation 導入前と同じ値である

#### Scenario: remediation を持たない ledger entry の表示は従来どおり

**Given** remediation を持たない fixable finding のみが ledger に載っている
**When** regression-gate の初期メッセージを構築する
**Then** ledger entry は severity / title / file / resolution / rationale / Provenance Ref のみで構成される
