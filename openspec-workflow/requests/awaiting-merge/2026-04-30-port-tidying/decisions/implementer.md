# Implementer Decisions — 2026-04-30-port-tidying

## D-IMPL-01: Section 2 を先行し build error で未追従箇所を列挙する :: port 必須化が test mock 追従漏れを型エラーとして顕在化させる唯一の手段。先行することで Section 3 の rewrite 対象リストを機械的に確定できる

## D-IMPL-02: tests/unit/adapter/github/get-raw-file.test.ts を新規作成し TC-012/013/014/015 を GitHubApiClient.getRawFile の直接テストとして rewrite する :: design D1 で確定済み。旧 tests/spec-review-fetch.test.ts は削除する

## D-IMPL-03: pipeline.test.ts と pipeline-integration.test.ts の buildMockGithubClient に verifyPath を追加する :: port 必須化に伴う機械的な追従。getRawFile で folder-probe していた箇所は verifyPath に置き換える

## D-IMPL-04: spec-review-step.test.ts の buildMockGithubClient にも verifyPath を追加する :: spec-review step は polling style のため verifyPath は呼ばれないが、GitHubClient 型の充足のために必須

## D-IMPL-05: executor.ts の verifyChangeFolderViaPort シグネチャを GitHubClient のみに変更し fallback 分岐を除去する :: design D3 で確定済み。port 必須化後は optional chaining も fallback も不要
