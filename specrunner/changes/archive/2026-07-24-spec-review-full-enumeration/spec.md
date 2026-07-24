# Spec: spec-review 全量列挙規律と後出し検出

## Requirements

### Requirement: spec-review prompt は finding の全量列挙を要求する

spec-review の system prompt の `## Method` 節は、レビュー中の revision で確認できる
finding を severity を問わず全量列挙する規律を MUST 含む。具体的には (a) 見えている
finding を今回の findings にすべて含めること、(b) 1 件ずつ小出しにしないこと、
(c) 前 round から存在した記述への新規 finding は後出しとして機械記録されること、
の 3 点を規定しなければならない (MUST)。この規律は新規の h2 見出しを追加せず
`## Method` 節の内側に置かれ、既存の 5 節骨格 (Question / Contract / Method /
Evidence / Completion) を保持しなければならない (MUST)。

#### Scenario: Method 節に全量列挙規律が含まれる

**Given** spec-review の system prompt 文字列
**When** `## Method` 節を抽出する
**Then** 抽出テキストは「全量列挙」「小出し」「後出し」の各語を含み、かつ
`## Method` 見出し以外の h2 見出しを節内に導入していない

### Requirement: 後出し判定は純関数として 3 値を返す

後出し判定は副作用を持たない純関数として提供されなければならない (MUST)。入力は
finding の対象行の内容 (現 revision の当該行) と、前 round がレビューした revision に
おける当該 file の内容であり、出力は `late` / `not-late` / `indeterminate` の 3 値で
ある。判定は行番号ずれに頑健な内容一致 (前 revision の各行を trim 済みで走査し、
対象行の trim 済み内容が存在するか) で行わなければならない (MUST)。対象行の内容が
無い、前 revision の内容が解決不能、対象行が空白のみ、のいずれかの判定不能ケースは
すべて `indeterminate` に倒さなければならない (MUST)。

#### Scenario: 前 revision に存在した記述への指摘は late

**Given** 対象行の内容が前 revision の当該 file の或る行と (trim 済みで) 一致する
**When** 後出し判定純関数を呼ぶ
**Then** `late` を返す

#### Scenario: fixer が書き足した記述への指摘は not-late

**Given** 対象行の内容が前 revision の当該 file のどの行とも一致しない
**When** 後出し判定純関数を呼ぶ
**Then** `not-late` を返す

#### Scenario: 判定不能はすべて indeterminate

**Given** 対象行の内容が null (line 欠落) である、または前 revision の内容が null
(前 revision 解決不能 / file が前 revision に不在) である
**When** 後出し判定純関数を呼ぶ
**Then** `indeterminate` を返す

### Requirement: iteration 2 以上の spec-review 完了で後出し判定を journal に記録する

spec-review step の完了処理は、iteration が 2 以上のとき、当該 round が報告した各
agent finding (機械合成された scope finding を除く) に後出し判定を実行し、per-finding
の結果 (`late` / `not-late` / `indeterminate`) を event journal に記録しなければならない
(MUST)。前 round がレビューした revision は、state に記録された spec-review の直前
StepRun の `commitOid` から解決しなければならない (MUST)。当該 round に agent finding
が 1 件も無い場合は記録を行わない。

#### Scenario: iteration 2 で per-finding の後出し判定が記録される

**Given** iteration 1 の spec-review が完了済で直前 StepRun の commitOid が解決可能
**And** iteration 2 の spec-review が 2 件の finding を報告した
**When** iteration 2 の spec-review 完了処理が走る
**Then** event journal に per-finding の後出し判定を持つ finding-recency 記録が
1 件 append される

### Requirement: iteration 1 では後出し判定を実行しない

spec-review step の完了処理は、iteration が 1 のとき (前 round が存在しないとき) 後出し
判定を実行してはならない (MUST NOT)。この場合、finding-recency 記録は journal に
append されない。

#### Scenario: iteration 1 では finding-recency 記録が append されない

**Given** spec-review の StepRun がまだ 1 件も存在しない状態で iteration 1 の
spec-review が finding を報告した
**When** iteration 1 の spec-review 完了処理が走る
**Then** event journal に finding-recency 記録は append されない

### Requirement: 後出し検出は verdict を変更しない

後出し検出は観測信号であり gate ではない。後出し検出の実行は、spec-review step の
verdict 導出・escalationReason 計算・finding-ref 実在検証のいずれも変更してはならない
(MUST NOT)。後出し検出は verdict が確定・永続化された後の best-effort な後処理として
実行され、verdict / state への書き戻し経路を持ってはならない (MUST NOT)。

#### Scenario: late な finding を含む round でも verdict は不変

**Given** iteration 2 の spec-review が late に分類される finding を含む findings を報告した
**When** 完了処理が後出し検出を実行する
**Then** 当該 round の verdict は後出し検出が無い場合と同一であり、後出し検出は
finding-recency 記録の append と stderr 出力以外の state 書き込みを行わない

### Requirement: 後出しがある round では stderr に要約を出す

後出し検出の結果に `late` が 1 件以上含まれる round では、operator が run 後に確認
できるよう stderr に要約 1 行を出力しなければならない (MUST)。`late` が 0 件の round
では stderr 要約を出力しない。

#### Scenario: late が 1 件以上で stderr 要約が出る

**Given** iteration 2 の spec-review の後出し検出結果に late が 1 件以上含まれる
**When** 完了処理が後出し検出を実行する
**Then** stderr に後出しの要約 1 行 (件数内訳を含む) が出力される
