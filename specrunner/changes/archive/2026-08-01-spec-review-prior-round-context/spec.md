# Spec: spec-review の周回間 context 注入

## Requirements

### Requirement: iteration ≥ 2 の spec-review message に前周 context を注入する

システムは spec-review の iteration が 2 以上のとき、reviewer に渡す initial message に (a) 前周 spec-review の findings（severity / resolution / file / title を含む構造化データ）と (b) 前周 spec-fixer が変更した file 集合を注入 SHALL する。前周 findings は state（`getLatestJudgeFindings(state, SPEC_REVIEW)`）から取得し、fixer 変更 file 集合は前周 spec-fixer の commit OID から `runtimeStrategy.listCommitChangedFiles` で機械導出 SHALL する。導出は `runtimeStrategy` が生きる core 層（`buildStepContext`）で行い、pure な `buildMessage` へは `DynamicContext` 経由で手渡 SHALL す。

#### Scenario: 前周 findings と fixer 変更 file が message に含まれる

**Given** spec-review が 1 回以上完走しており（iteration が 2 以上）、前周 spec-fixer の StepRun に commitOid が記録されている
**And** `listCommitChangedFiles` が該当 commit の変更 file 集合を返す（mock 経由）
**When** システムが当該 round の spec-review reviewer message を構築する
**Then** message には前周 findings（severity / resolution / file / title）と、`listCommitChangedFiles` が返した変更 file 集合が含まれる

#### Scenario: fixer 変更 file は機械導出のみを真実源にする

**Given** iteration が 2 以上で fixer 変更 file 集合を注入する
**When** システムが変更 file 集合を導出する
**Then** 集合は `listCommitChangedFiles`（commit diff）の結果のみから構成され、fixer agent の報告文は真実源にならない

### Requirement: iteration 1 では前周 context を注入しない

システムは spec-review の iteration が 1 のとき、前周 context を注入 MUST NOT する（前周が存在しないため）。

#### Scenario: 初回 spec-review には注入ブロックが無い

**Given** spec-review がまだ 1 度も完走しておらず iteration が 1 である
**When** システムが spec-review reviewer message を構築する
**Then** message に前周 context の注入ブロックは含まれない

### Requirement: 導出不能時は注入を省略し step を正常続行する

システムは前周 fixer の commit OID が解決できない、または diff が unavailable（`listCommitChangedFiles` が `unavailable` を返す、あるいは seam 不在）の場合、前周 context の注入をブロックごと省略 SHALL し、spec-review step を正常に続行 SHALL する（黙って壊れない）。

#### Scenario: 前周 fixer の commit OID が解決できない

**Given** iteration が 2 以上だが前周 spec-fixer の StepRun に commitOid が無い
**When** システムが前周 context を導出する
**Then** 注入は省略され、message に注入ブロックは含まれず、step は正常続行する

#### Scenario: diff が unavailable

**Given** iteration が 2 以上で前周 fixer の commit OID は解決できるが、`listCommitChangedFiles` が `unavailable` を返す
**When** システムが前周 context を導出する
**Then** 注入は省略され、message に注入ブロックは含まれず、step は正常続行する

### Requirement: 注入ブロックは再指摘プロトコルを課し全量列挙規律を弱めない

システムは注入ブロックに、(1) 同一対象を再指摘する前に現在のファイル内容を読み直すこと、(2) 再指摘する場合は修正がなぜ不十分かを rationale に明示し、現在の内容で解消を確認できた指摘は再指摘しないこと、(3) 全量列挙規律を維持し前周 approve 済みの観点も含め全量列挙すること、の指示を含め SHALL る。システムは「前回 approve 済みの観点は省略してよい」等の全量列挙を弱める免除を注入ブロックに含め MUST NOT ない。

#### Scenario: 再指摘プロトコル文言が注入ブロックに含まれる

**Given** iteration が 2 以上で前周 context が注入される
**When** システムが注入ブロックを生成する
**Then** ブロックには現在内容の読み直し指示・不十分理由の rationale 明示指示・全量列挙維持の文言が含まれ、全量列挙を弱める免除文言は含まれない

### Requirement: 注入は one-shot でその round の message にのみ載る

システムは前周 context を当該 round の reviewer message にのみ載せ SHALL、state への永続追加や後続 step への伝播を MUST NOT 行わない。

#### Scenario: 注入は state を汚さない

**Given** ある round で前周 context が注入される
**When** その round が完了する
**Then** 前周 context は state（stepRuns / journal）に永続化されず、後続の別 step の message にも伝播しない
