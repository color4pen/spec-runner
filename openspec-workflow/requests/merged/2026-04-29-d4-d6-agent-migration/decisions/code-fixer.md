# code-fixer decisions — 2026-04-29-d4-d6-agent-migration

## Fix History

### #1 (HIGH) — runInit drops pipeline/specReview/specFixer on re-run

`newConfig` を `{ ...existingConfig, ... }` でスプレッドし、init が所有するフィールドのみ上書きする :: `pipeline`, `specReview`, `specFixer` はユーザーが手動チューニングした値であり、init は所有権を持たない。スクラッチ再構築はこれらを無音で破棄するバグ。

### #2 (HIGH) — getStoredAgent が empty definitionHash で undefined を返す

`record.definitionHash ?? ""` を返す (agentId があれば常に非 undefined を返す) :: AgentSyncer の「hash differs → update」分岐は空文字列を正しく処理する。undefined を返すと「no stored entry」分岐に落ちて createAgent が呼ばれ、既存の Anthropic agent ID が漏洩してしまう。

### #3 (MEDIUM) — stale src/core/agent-definition.ts を削除

`tests/agent-definition.test.ts` を `src/core/agent/hash.ts` の `hashObject` に移行し、`src/core/agent-definition.ts` を削除する :: production コードから参照がなく、`core/agent/hash.ts` と実装が重複している。2つのハッシュ実装が並存すると将来的に diverge するリスクがある。

### #6 (MEDIUM) — lastSyncedAt fallback が非決定的

migration 時の `lastSyncedAt` フォールバックを `new Date().toISOString()` から `""` sentinel に変更する :: 毎回の loadConfig でタイムスタンプが変わると、何も変更していないのに saveConfig の diff が生じ「真の冪等」を妨げる。空文字列は「未同期」を意味し、次の syncAll が実際のタイムスタンプを書く。

### #7 (MEDIUM) — updateConfig のシャローマージ foot-gun にドキュメントを追加

`updateConfig` を削除するか、シャローマージの制約をドキュメントに明記する :: src/ 内に呼び出し元がないため dead export として削除が最もシンプル。foot-gun を残すより削除した方がコードベースが小さく安全。

### #8 (MEDIUM) — TC-039/TC-041 テストを追加

`tests/init.test.ts` に TC-039 (legacy agentId + empty hash → updateAgent) と TC-041 (404 fallback → propose only re-created) のテストを追加する :: Finding #2 と直接対応するテストが欠如しており、回帰を防ぐためにも必須。

### #10 (LOW) — register-branch.ts のコメントを更新

"ONLY place" コメントを実態に合わせて更新する :: `propose.ts` と `sse-stream.ts` でも同じ文字列が参照されており、コメントが誤解を招く。

### #11 (LOW) — AgentSyncer rollback re-throw にロールコンテキストを追加

rollback 後の `throw err` をラップして role 情報を含める :: デバッグ時にどの role の create が失敗したか即座にわかる。原因エラーは `cause` プロパティで保持するので情報は失われない。

---

## Iteration 2 (PR #28 review — 2026-04-29)

### PR#28 #1 (HIGH) — buildSdkAdapter を削除し AnthropicClientAdapter を使用する

`buildSdkAdapter` を削除し `new AnthropicClientAdapter(rawSdk)` に置き換える :: PR review が architecture invariant 違反として再提起した。iter1 では「テストモックチェーンを保つため inline adapter が必要」と判断して deferred にしたが、これは誤りだった。`vi.mock("sdk/client.js")` は `createAnthropicClient` の戻り値（rawSdk）をモックオブジェクトに差し替えるため、`AnthropicClientAdapter(rawSdk)` はそのモックオブジェクトを wrap し、`sdk.beta.agents.*` 呼び出しはモック経由で解決される。インポートの有無（adapter/anthropic/anthropic-client.ts が @anthropic-ai/sdk を import する事実）はモック境界に影響しない。加えて rollback パスも `rawSdk.beta.agents.archive(id)` から `agentClient.archiveAgent(id)` に変更し、ポート経由で統一した。5 件の eslint-disable 抑制は buildSdkAdapter 削除の自然な副産物として消滅した。
