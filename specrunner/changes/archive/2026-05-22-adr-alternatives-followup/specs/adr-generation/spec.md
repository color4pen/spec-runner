## Requirements

### Requirement: AdrGenStep は adr: true のとき Alternatives Considered の self-fix followUpPrompt を発火する

`AdrGenStep` SHALL `getFollowUpPrompt(state, deps)` を実装し、`deps.request.adr === true` のとき Alternatives Considered セクションの self-fix を促す follow-prompt 文字列を返す。

follow-prompt は「修正」を指示し「判定」を指示しない（確認バイアス回避）。具体的には:
- ADR を読み直す指示
- Alternatives Considered の具体的な代替案名・Pros/Cons/Why not の存在を確認する指示
- 不足があれば change folder artifacts を根拠に追記する指示
- 十分であれば変更せず end_turn する指示

#### Scenario: adr: true のとき followUpPrompt が返される

- **GIVEN** `deps.request.adr` が `true` である
- **WHEN** `AdrGenStep.getFollowUpPrompt(state, deps)` を呼び出す
- **THEN** 非 undefined の string が返される
- **AND** 文字列に「Alternatives Considered」への言及が含まれる

#### Scenario: followUpPrompt は修正を指示し判定を指示しない

- **GIVEN** `AdrGenStep.getFollowUpPrompt` が返す文字列
- **WHEN** 文面を inspect する
- **THEN** 「追記」「修正」等の action 指示が含まれる
- **AND** 「判定せよ」「存在するか判定」等の検出ゲート的表現は含まれない

### Requirement: AdrGenStep は adr: false のとき followUpPrompt を発火しない

`AdrGenStep.getFollowUpPrompt` SHALL `deps.request.adr === false` のとき `undefined` を返す。これにより `shouldRunFollowUp` が false を返し、follow turn は実行されない。

`adr: false` の request では adr-gen step が従来通り no-op で終わり、ADR は生成されない。follow-prompt が no-op パスで発火して ADR を誤生成することを防止する。

#### Scenario: adr: false のとき followUpPrompt は undefined

- **GIVEN** `deps.request.adr` が `false` である
- **WHEN** `AdrGenStep.getFollowUpPrompt(state, deps)` を呼び出す
- **THEN** `undefined` が返される

#### Scenario: adr: false の request で ADR が生成されない

- **GIVEN** `request.adr === false` の request
- **WHEN** adr-gen step を実行する
- **THEN** ADR ファイルは生成されない
- **AND** follow turn は実行されない
- **AND** step は success で完了する
