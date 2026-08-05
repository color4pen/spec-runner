# Spec: adr-gen が fixer 適用後の最終実装から ADR を導出する

## Requirements

### Requirement: adr-gen message に post-fix context ブロックを機械注入する

システムは、code-fixer の StepRun（`commitOid` あり）が state に存在する場合、adr-gen の initial message に post-fix context ブロックを注入 SHALL する。ブロックは各 code-fixer round について、(a) その `commitOid` から `runtimeStrategy.listCommitChangedFiles` で機械導出した changed files と、(b) その round に対応する review-feedback 指摘の要約（severity / resolution / file / title）を併記 SHALL する。全 round 分を含め、最新 round のみに限定 MUST NOT ない。導出は `runtimeStrategy` が生きる core 層（`prepareRoundContext`）で行い、pure な `buildMessage` へは `DynamicContext` 経由で手渡 SHALL す。

#### Scenario: fixer round の changed files と指摘要約が message に含まれる

**Given** code-fixer の StepRun が 1 件以上あり、それぞれに commitOid が記録されている
**And** `listCommitChangedFiles` が各 commit の changed files を返す（mock 経由）
**When** システムが adr-gen の initial message を構築する
**Then** message には各 fixer round の changed files と、対応する review 指摘の要約（severity / resolution / file / title）が含まれる

#### Scenario: 複数 fixer round の全件が post-fix ブロックに含まれる

**Given** code-fixer の StepRun が 2 件以上あり、それぞれに commitOid が記録されている
**And** `listCommitChangedFiles` が各 commit の changed files を返す（mock 経由）
**When** システムが post-fix ブロックを構築する
**Then** ブロックには全 round 分のエントリが含まれ、最新 round のみに限定されない

#### Scenario: changed files と指摘要約は機械事実のみを真実源にする

**Given** post-fix ブロックを注入する
**When** システムが changed files と指摘要約を導出する
**Then** changed files は `listCommitChangedFiles`（commit diff）の結果のみから、指摘要約は state の findings のみから構成され、fixer agent の自己申告文は真実源にならない

### Requirement: 各 fixer round は直前の最新 findings-bearing run に対応付ける

システムは各 code-fixer round（`endedAt = t`）に対し、state 全体で `endedAt < t` を満たす findings を持つ StepRun のうち `endedAt` が最大の run の findings を、その round の指摘要約として対応付け SHALL る。該当する run が無い場合は指摘要約を空とし、changed files のみを併記 SHALL する。

#### Scenario: code-review iteration の findings が対応 round に併記される

**Given** code-review iteration N の後に code-fixer round N が走り commitOid を記録している
**When** システムが post-fix ブロックを構築する
**Then** code-fixer round N には code-review iteration N の findings（直前の最新 findings-bearing run）が対応付けられる

### Requirement: fixer が走っていない run では従来 message を維持する

システムは commitOid を持つ code-fixer round が 1 件も存在しない run では、post-fix ブロックを注入 MUST NOT せず、initial message を従来と byte 同一に維持 SHALL する。

#### Scenario: code-fixer が一度も走っていない run

**Given** state に commitOid を持つ code-fixer の StepRun が存在しない
**When** システムが adr-gen の initial message を構築する
**Then** message に post-fix ブロックは含まれず、従来の Judge materials のみの message になる

### Requirement: 導出不能時はブロックを省略し step を正常続行する

システムは post-fix context の導出に失敗した場合（`listCommitChangedFiles` port 不在、commitOid を持つ round が無い、`listCommitChangedFiles` が `unavailable` を返す、または port 呼び出しが throw する）、post-fix ブロックをブロックごと省略 SHALL し、adr-gen step を正常に続行 SHALL する。導出関数は throw MUST NOT ない。

#### Scenario: listCommitChangedFiles port が不在（managed runtime 相当）

**Given** `runtimeStrategy` 自体が undefined、または `runtimeStrategy.listCommitChangedFiles` が存在しない
**When** システムが post-fix context を導出する
**Then** 注入は省略され、message に post-fix ブロックは含まれず、step は正常続行する

#### Scenario: commitOid を持つ round が無い

**Given** code-fixer の StepRun は存在するがいずれにも commitOid が無い
**When** システムが post-fix context を導出する
**Then** 注入は省略され、message に post-fix ブロックは含まれず、step は正常続行する

#### Scenario: listCommitChangedFiles が unavailable / port が throw する

**Given** commitOid は解決できるが `listCommitChangedFiles` が `unavailable` を返す、または呼び出しが throw する
**When** システムが post-fix context を導出する
**Then** 注入はブロックごと省略され、message に post-fix ブロックは含まれず、step は正常続行し、導出関数は throw しない

### Requirement: system prompt に post-fix 優先順位規律を含める

システムは adr-gen の system prompt に、post-fix ブロックが存在する場合の優先順位規律を含め SHALL る。規律は、(1) 最終実装が正であること、(2) fixer が実装した（post-fix ブロックの changed files に現れる）機構を Alternatives Considered（却下した代替案）として記述してはならないこと、(3) ship 済み機構は Decision / Consequences 側に記述すること、(4) design.md と最終実装が乖離している箇所は post-fix ブロック側を正とすること、を明示 SHALL する。

#### Scenario: 優先順位規律が system prompt に存在する

**Given** adr-gen の system prompt を検査する
**When** post-fix ブロック存在時の規律を確認する
**Then** system prompt には「最終実装が正」「ship 済み機構を Alternatives Considered に書かない」「乖離時はブロックを正とする」旨の規律が含まれる
