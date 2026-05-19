## Requirements

### Requirement: TC ID は downstream (implementer / verification) で grep 参照されるため一意かつ安定的に grep 可能であること

test-case-gen step が生成する TC ID は `TC-{NNN}` フラット型を正規形式とする。各 TC ID は test-cases.md 内で一意でなければならない。TC ID は implementer が test 関数名 / comment に記載し、verification step の test-coverage phase が `tests/` 配下を grep して存在を検証する。

TC ID に使用する文字列は、test code 内の他の文字列と偶然一致しにくい形式であること（3 桁以上のゼロ埋め数字を推奨）。

#### Scenario: TC ID がフラット型で一意

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** 全 TC ID が `TC-{NNN}` 形式で、かつ重複がない
- **THEN** downstream の grep 検証が正しく機能する

#### Scenario: TC ID が重複している

- **GIVEN** test-case-gen step が test-cases.md を生成する
- **WHEN** 2 つの test case に同一の TC ID が割り当てられている
- **THEN** downstream の grep 検証で誤判定が発生するため、TC ID の重複は prompt の規律に違反している
