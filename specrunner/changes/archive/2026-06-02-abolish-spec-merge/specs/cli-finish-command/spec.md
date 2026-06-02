# Delta Spec: cli-finish-command

## Requirements

### Requirement: Phase 1 は staging された変更を archive commit として確定する

`specrunner finish` の Phase 1 は、`archiveChangeFolder` が staging した変更を MUST 末尾で `git commit -m "chore: archive <slug>"` として確定する。

staging 検出は MUST `git diff --cached --quiet` の exit code で行う:

- exit 0 (staging なし) → commit を skip する (= idempotent。resume 経路での二重 commit を防止する)
- exit 1 (staging あり) → `git commit -m "chore: archive <slug>"` を実行する

commit 失敗時は MUST escalation を返し、Phase 2 push に進まない SHALL。

この commit は Phase 2 の `git push` で feature branch に反映され、Phase 3 の squash merge で main に到達する。commit がない場合、archive の変更が main に反映されない。

#### Scenario: Phase 1 で staging あり → archive commit が作成される

- **WHEN** `specrunner finish my-feature` を実行し、Phase 1 の `archiveChangeFolder` が staging を生成した
- **THEN** `git diff --cached --quiet` が exit 1 を返し、`git commit -m "chore: archive my-feature"` が実行される

#### Scenario: Phase 1 で staging なし → commit skip (idempotent)

- **WHEN** `specrunner finish my-feature` を実行し、Phase 1 で staging が空である（例: resume 経路で既に commit 済み）
- **THEN** `git diff --cached --quiet` が exit 0 を返し、commit は実行されない

#### Scenario: commit 失敗 → escalation

- **WHEN** Phase 1 の `git commit` が exit code 非 0 で失敗した
- **THEN** escalation を返し、Phase 2 push には進まない
