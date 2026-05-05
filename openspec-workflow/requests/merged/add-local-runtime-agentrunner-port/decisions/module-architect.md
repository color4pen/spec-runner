# module-architect decisions

AgentRunner.run() を adapter 内部で 4-stage helper（prepareSession / exchange / verifyArtifacts / fetchResult）に分割推奨する :: 単一メソッド設計（D1）の cohesion trade-off を adapter 内部分割で吸収するため。両 adapter で構造的相同性を保てば将来の sub-port 抽出も容易
register_branch の単体テストを adapter 配下にコロケートし input_schema snapshot test を追加推奨する :: core から adapter へ tool 移動した瞬間に既存テストが module-boundary 違反になるため。input_schema 不変性 Scenario を mechanical に検証する必要がある
AgentRunContext で `ctx.branch` を canonical とし `ctx.state.branch` は adapter 内で読み取らない規律を明文化推奨する :: CLI 主導 branch（D4）の優先順位が adapter 実装で揺れるリスクを抑えるため
PipelineDeps から `client: SessionClient` を optional 化または削除推奨する :: Phase 1.6 の executor 依存撤去だけでは PipelineDeps 経由で残存する coupling を断ち切れないため。grep invariant に追加すべき
requiresCommit guard を executor.ts:677-701 から両 AgentRunner adapter 内に移動推奨する :: design.md D5（branch / path verification を adapter に吸収）の趣旨に沿わせるため。core と adapter の 2 層に同責務が分裂すると SRP 違反になる
propose-style と polling-style の executor.ts 内 2 関数並列展開は ManagedAgentRunner 内で単一フロー + exchange 戦略差し替えに統合推奨する :: 現状 ~600 LOC の cohesion 問題が adapter に単純移動するリスクがあるため
appendHistory ヘルパー化を Phase 1 で先行推奨する :: executor.ts 20+ 箇所の重複を adapter 移植時に持ち越すと、移植後の adapter が同じ readability 問題を引き継ぐため
