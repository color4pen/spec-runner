## Requirements

### Requirement: build-fixer は test-coverage phase 失敗時に test-cases.md から missing TC の test を追加する

build-fixer system prompt は MUST test-coverage phase 失敗時の対処規律を含む。verification-result.md の `## Phase: test-coverage` セクションに記載された missing TC ID を確認し、change folder の `test-cases.md` から該当 TC の GIVEN/WHEN/THEN を読み取り、対応する test を `tests/` 配下に追加する。追加する test の関数名または comment には TC ID を必ず記載する。

#### Scenario: build-fixer prompt に test-coverage 対処規律が含まれる

- **WHEN** `BUILD_FIXER_SYSTEM_PROMPT` を inspect する
- **THEN** test-coverage phase 失敗時に test-cases.md を読んで test を追加する旨の指示が含まれる
- **AND** TC ID を test 関数名 / comment に記載する旨の指示が含まれる
