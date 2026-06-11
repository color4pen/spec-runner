# Spec: step 完了時に宣言された出力契約を機械検証する

## Requirements

### Requirement: step 完了時に宣言された出力契約を決定論で検証する

agent step の session が success で完了した後、commit（local の `finalizeStepArtifacts`）より前に、CLI は当該 step が宣言する出力契約を**決定論（ゼロトークン・観測可能な事実のみ）**で検証 SHALL する。検証に LLM を用いてはならない（MUST NOT）。契約は 2 クラスからなる:

- **produced 契約**: `writes()` で宣言された file 出力が、実体を伴って存在する（欠落でも空でも、配置済み scaffold テンプレートと同一でもない）こと。
- **tasks-complete 契約**: implementer の `tasks.md` に未完了チェックボックス `- [ ]` が残っていないこと。

#### Scenario: 全契約が満たされれば挙動は不変

**Given** 標準 pipeline の正常経路で、ある agent step が宣言出力をすべて実体付きで産出した state
**When** executor が出力検証を実行する
**Then** 検証は violation を 0 件として通過し、step の実行順序・画面出力・commit は本変更前と一致する

#### Scenario: 検証は両 runtime で同じ宣言契約を対象にする

**Given** ある step の produced 契約 file `p`
**When** local runtime と managed runtime でそれぞれ出力検証が走る
**Then** local は worktree 上の `p` を、managed は branch git state 上の `p` を検証し、対象 path は同一である

### Requirement: produced 契約の欠落は commit 前に halt する

`writes()` で宣言された file 出力が、欠落・空・配置済み scaffold と同一のいずれかで「実体が産出されていない」と判定された場合、CLI は当該 step を commit する前に、欠落した path を含む明示エラー（code `STEP_OUTPUT_MISSING`）で停止 SHALL する。この契約の既定ポリシーは halt であり、follow-up を行ってはならない（MUST NOT）。

#### Scenario: design が成果物を産出しないまま完了すると即 halt する

**Given** design step が宣言出力 `design.md` を、配置済み scaffold テンプレートのまま（実体未産出）残して session を完了した
**When** executor が出力検証を実行する
**Then** commit より前に `STEP_OUTPUT_MISSING` で停止し、エラーは `design.md` を含み、空テンプレートは commit されない

#### Scenario: 宣言出力が実体付きで存在すれば通過する

**Given** design step が `design.md` / `tasks.md` / `spec.md` を実体付き（scaffold と相違）で産出した
**When** executor が出力検証を実行する
**Then** produced 契約は violation 0 件で通過し、step は commit に進む

### Requirement: implementer の未完了タスクは同一セッションの follow-up で修復させる

implementer の完了時に `tasks.md` へ未完了チェックボックス `- [ ]` が残っている場合、CLI は残タスク名を列挙した条件付き prompt を**同一 agent session**へ追撃 SHALL する。prompt は静的文ではなく、検証結果（worktree / branch の観測）から計算されなければならない（MUST）。試行回数は follow-up 予算（`maxAttempts`）に従う。

#### Scenario: 未完了タスクが残ると follow-up が送られる

**Given** implementer が `tasks.md` に未完了の `- [ ]` を 2 件残して work turn を終えた
**When** 出力検証で tasks-complete 契約の violation が検出される
**Then** その 2 件のタスク名を列挙した follow-up prompt が同一 session に送られ、agent が修復を試みる

#### Scenario: follow-up prompt は検証結果から計算される

**Given** 未完了タスクの集合が `{A, B}`
**When** follow-up prompt を組み立てる
**Then** prompt 本文に `A` と `B` が含まれ、未完了が無い場合に prompt は送られない

### Requirement: follow-up 予算枯渇後も残る未完了は halt する

follow-up 予算（`maxAttempts`）を使い切ってもなお implementer の `tasks.md` に未完了 `- [ ]` が残る場合、CLI は当該 step を commit する前に `STEP_OUTPUT_MISSING` で停止 SHALL する。

#### Scenario: 予算枯渇後の未完了は halt に縮退する

**Given** follow-up を `maxAttempts` 回実行してもなお `tasks.md` に未完了 `- [ ]` が残る
**When** executor が最終の出力検証を実行する
**Then** commit より前に `STEP_OUTPUT_MISSING` で停止し、エラーは残った未完了タスクを示す

### Requirement: 出力検証は入力検証と対称の RuntimeStrategy seam に置く

決定論の出力検出は、入力側 `validateStepInputs` と対称の `RuntimeStrategy.validateStepOutputs` seam に置き SHALL する。本メソッドは throw せず、検出された violation を構造化して返さなければならない（MUST）。runtime 差（local worktree fs / managed branch git state）は本 seam 内に閉じ、両 runtime で同一の宣言契約を対象とする。

#### Scenario: 検出 seam は throw せず violation を返す

**Given** ある step の出力契約の一部が満たされない
**When** `validateStepOutputs(contracts, cwd, branch)` を呼ぶ
**Then** メソッドは throw せず、満たされない契約を violation として含む結果を返し、halt するか否かの判断は呼び出し側（executor）が行う

#### Scenario: runtimeStrategy 未注入時は検証をスキップする

**Given** `runtimeStrategy` が注入されていない実行構成
**When** executor が出力検証段に到達する
**Then** 検証はスキップされ、step は本変更前と同じく commit に進む（後方互換）
