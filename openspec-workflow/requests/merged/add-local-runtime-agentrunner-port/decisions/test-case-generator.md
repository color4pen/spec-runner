# test-case-generator 判断ログ

## 判断一覧

AgentRunResult.completionReason を "success" / "error" / "timeout" の 3 ケースに分割する :: 各値で StepExecutor の分岐が変わり、missing だとルーティングバグになる

timeout を error と別ケースとして立てる :: 将来の timeout リトライ拡張で分離が必要になるため、spec に明示的に列挙された値は個別に検証する

ManagedAgentRunner の動作等価性を integration category にする :: SessionClient と GitHubClient の外部 HTTP 依存を含むため unit のみでは不十分

register_branch の input_schema 不変性を unit 扱いにする :: schema 自体は JSON オブジェクトの静的比較で検証可能。runtime での動的テストは不要

requiresCommit guard を ClaudeCodeRunner と ManagedAgentRunner の verifyBranch で別々のケースとして立てる :: 失敗時の error message 内容とアサート対象（git vs GitHub API）が adapter ごとに異なるため観点が異なる

prompts/ runtime-neutral 性を unit 扱い（grep ベース）にする :: コード実行不要の静的アサーション。CI で自動検証可能

module-boundary 違反検出テストを unit（static grep）にする :: ファイルシステムと grep のみで完結し、外部依存がない

AgentSyncer の gating を integration にする :: CLI composition root のワイヤリングをテストするため ConfigStore の実際の load が必要

ConfigStore migration を unit にする :: I/O が ConfigStore.load() のみで完結し、外部 HTTP 依存がない

e2e を「--runtime local init が API 呼び出しゼロ」と「local mode pipeline 完走」の 2 件のみにする :: 環境依存が高く手動でも代替可能だが、仕様上の中核要件（API 呼び出しゼロ保証）を automated e2e として残す価値がある

timeout ケース（TC-005）を must にする :: completionReason の全値が must 領域（AgentRunner port interface contract）に明示されている

register_branch の managed adapter での注入（TC-018）を must にする :: tool が登録されないと propose step が managed mode で動かない

register_branch の input_schema 不変性（TC-019）を must にする :: must-areas に「input_schema 不変性」が明示されている

branch mismatch 時の warning と ctx.branch 保持（TC-021）を must にする :: must-areas に「CLI canonical branch と agent-reported branch の不一致時挙動」が明示されている

core SDK import なし検証（TC-039）を must にする :: must-areas の「ManagedAgentRunner と既存 executor の動作等価性」の前提条件（module-boundary invariant）であり、破れると全 runtime 分離が崩壊する

managed-agent / claude-code 相互 import なし（TC-040）を must にする :: must-areas の「register_branch tool の adapter 配置」に直結する独立性の保証

TC-044（buildMessage 両 runtime 同一性）を should にする :: prompts/ runtime-neutral は TC-043 の grep で検証できるため、buildMessage の動的比較は補完的

managed mode 完全 dogfood regression なし（TC-062）を manual + could にする :: 自動化が困難な dogfood 実行を必要とするが、Phase 1 の受け入れ基準として重要。could は「自動化が困難」による下位評価

TC-057（local mode pipeline 完走）を e2e + should にする :: must-areas には含まれないが Phase 4 の受け入れ基準として重要な should
