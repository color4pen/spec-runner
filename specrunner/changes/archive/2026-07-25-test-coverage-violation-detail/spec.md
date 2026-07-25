# Spec: test-coverage 契約違反で欠落 TC-ID を agent と operator に伝え、同一セッションで修復可能にする

## Requirements

### Requirement: test-coverage violation は欠落 TC-ID を missing / assertionless に区別して保持する

`test-coverage` 契約の検出が失敗を返すとき、検出結果は欠落 TC-ID（テストファイルに未出現）と
assertionless TC-ID（出現するが assertion を伴わない）を **区別して** violation に保持 SHALL する。
評価器が既に区別して算出している両集合を、後段の描画器がカテゴリ別の修復指示を出せる構造で
伝えなければならない（MUST）。区別のために coverage 判定ロジック（TC-ID 抽出・境界正規表現・assertion 判定）を
変更してはならない（MUST NOT）。

#### Scenario: missing と assertionless の双方を保持する

**Given** must TC のうち一部がテストファイルに未出現（missing）、別の一部が出現するが assertion 無し（assertionless）
**When** local runtime の `validateStepOutputs` が `test-coverage` 契約を検証する
**Then** 返す violation は missing の TC-ID 集合と assertionless の TC-ID 集合を区別して保持する

### Requirement: halt メッセージは test-coverage violation の欠落 TC-ID を列挙する

出力ゲートの halt メッセージ生成は、`test-coverage` kind の violation について、欠落 TC-ID と
assertionless TC-ID を **ID を明示して** 列挙 SHALL する。列挙は missing と assertionless を区別できる形式で
なければならない（MUST）。`tasks-complete` / `content-format` / `produced` 既存 kind の描画は不変とする。

#### Scenario: halt メッセージに欠落 TC-ID が載る

**Given** `test-coverage` violation が missing = {TC-064, TC-065}、assertionless = {TC-003} を保持する
**When** 出力ゲートが halt メッセージを生成する
**Then** メッセージは test-cases.md の path に加え TC-064・TC-065・TC-003 を含み、missing と assertionless を
区別して示す

### Requirement: follow-up prompt は test-coverage violation から ID 明示の修復指示を生成する

follow-up 修復 prompt の生成は、`test-coverage` violation について、missing TC-ID には
「該当 TC のテストを書き TC-ID をテストファイルに記載する」旨、assertionless TC-ID には
「該当テストに assertion を追加する」旨の修復指示を、対象 TC-ID を明示して出力 SHALL する。
両カテゴリの修復指示は区別されなければならない（MUST）。既存 kind（`tasks-complete` / `produced` /
`content-format`）の節は不変とする。

#### Scenario: missing と assertionless で異なる修復指示を ID 明示で出す

**Given** `test-coverage` violation が missing = {TC-064}、assertionless = {TC-003} を保持する
**When** follow-up 修復 prompt を生成する
**Then** prompt は TC-064 を「テストを書き TC-ID を記載する」指示の対象として、TC-003 を
「assertion を追加する」指示の対象として、それぞれ ID を明示して列挙する

### Requirement: test-materialize の test-coverage 契約は follow-up policy で同一 session 修復する

test-materialize step の `test-coverage` 契約は `policy: "follow-up"` を宣言 SHALL する。違反時は
同一 session 内で ID 明示の修復指示（前 Requirement）を受けて再試行し、修復試行上限
（`OUTPUT_FOLLOWUP_MAX_ATTEMPTS`）まで解消しない場合は従来どおり出力ゲートで halt しなければならない（MUST）。
本変更は既存の detect→repair→再検証ループを再利用し、新たな修復機構を追加してはならない（MUST NOT）。
修復試行上限の値を変更してはならない（MUST NOT）。

#### Scenario: 違反 → 修復 → 再検証 pass の経路が成立する

**Given** test-materialize の `test-coverage` 契約が follow-up policy で、初回検証が missing TC を持つ違反を返す
**When** 同一 session で当該 TC を覆うテストが追加され、契約が再検証される
**Then** 再検証は violation を 0 件として返し、step は commit へ前進する

#### Scenario: 修復試行上限まで解消しない違反は halt へ合流し ID を伴う

**Given** 修復を上限回数試みてもなお `test-coverage` violation が残る
**When** executor の最終出力ゲートが検証を実行する
**Then** commit より前に `STEP_OUTPUT_MISSING` で halt し、その halt メッセージは残存する欠落 TC-ID を含む
