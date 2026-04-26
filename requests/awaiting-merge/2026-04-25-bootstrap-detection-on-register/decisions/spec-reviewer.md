# Spec Reviewer Decisions — 2026-04-25-bootstrap-detection-on-register

## Spec Review (Iteration 1)

受け入れ基準と delta spec のシナリオカバレッジを突合する :: 5つの受け入れ基準すべてに対応するシナリオが delta spec に存在する。「既存テストが通る」は仕様というよりテスト要件のため、spec カバレッジからは除外

`requests/active/` の存在チェックに `getDirectoryContents` を使用する方針を適切と判断する :: ディレクトリの存在確認には `getDirectoryContents` が適切。404 → 空配列の設計により、存在しない場合は `length === 0` で判定可能

`repository-binding/spec.md` との整合性を MEDIUM 指摘とする :: delta spec が `repository-registration/spec.md` のみを更新しているが、`repository-binding/spec.md` の "Explicit registration from search UI" シナリオにも `bootstrap_status` を `uninitialized` 固定と記述がある。これを更新しないと spec 間で矛盾が残る。ただし `repository-binding` は `repository-registration` より古い spec であり、`repository-registration` が正として参照されるため MEDIUM とする

bootstrap-status-tracking spec の「直接 INSERT」パスに関する明示性不足を LOW 指摘とする :: 状態マシンは遷移を定義しており、初期 INSERT は遷移ではないため定義外で問題ない。ただし仕様の明確性のため、`ready` で直接 INSERT されるケースの存在を bootstrap-status-tracking spec に注記があるとよい

tasks.md の `detectBootstrapStatus` の引数に `defaultBranch` が含まれている点を確認する :: `getFileContent` / `getDirectoryContents` は `ref` パラメータを受け取る設計であり、default branch を渡す必要がある。仕様と実装の整合性は取れている
