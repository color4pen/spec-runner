# Spec Fixer Decisions — 2026-04-29-d4-d6-agent-migration

## Applied Fix Decisions

`StepName` を kebab-case literal union として agent-definition-ownership/spec.md に明示する :: 旧 AgentRole（camelCase）と新 StepName（kebab-case）の対応が migration の暗黙仕様になっており、実装者が camelCase 残置を生む可能性が高いため、spec で正規形を固定する必要がある

`AgentRole` 型の REMOVED セクションを agent-definition-ownership/spec.md に追加する :: design.md D9 で「REMOVED」と宣言済みだが delta spec に明示されていなかった。grep で消えたことを確認できるよう spec 側にも記録する

migration の camelCase→kebab-case 正規化ルールを cli-config-store/spec.md の中間 schema Scenario に明記する :: `specFixer`→`"spec-fixer"`, `specReview`→`"spec-review"` の変換が暗黙だと実装者が二重キーを生む可能性がある

`ToolSpec` の ownership と SDK 型非 re-export を agent-definition-ownership/spec.md に Requirement として追加する :: core 側で SDK 型が漏れるかどうかが曖昧なまま実装されると core/adapter の境界が崩れる。Requirement として明示することで実装段階でのレビューチェックポイントになる

`ToolSpec` を design.md D6 の placement 表に追加する :: D6 の表に ToolSpec がなく実装者が置き場所を決めきれない。placement 表に含めることで設計の意図が伝わる

AgentSyncer の core/agent/ 配置決定の根拠を design.md D3 Rationale に追記する :: module-analysis §4a が adapter 配置案を提案しており、tasks.md 3.1 が core 側を採用しているが却下経緯が未記録。port 経由で SDK 依存を分離するため core 配置が正当であることを明文化する

top-level timeout config（specReview/specFixer）は kebab-case 正規化の対象外として別軸維持を cli-config-store/spec.md に明示する :: agents マップと timeout config は責務が異なり、executor.ts の getTimeoutMs 経路への影響を切り分けるため明示が必要

spec-review Agent system prompt の最低限契約（verdict/severity 規約参照・tools=[]・出力ファイルパス）を agent-definition-ownership/spec.md に Requirement として追加する :: 実装者が任意に書ける状態だと spec-review の動作品質が保証されない

`config.agent.id` の propose 同期 Requirement を agent-environment-bootstrap/spec.md REMOVED セクションに明示追加する :: MODIFIED 全文置換による暗黙削除であり、実装者が旧形式互換を残すべきか判断できない

`agent.tools` と `Step.toolHandlers` の対応関係不変条件を agent-definition-ownership/spec.md に追加する :: propose=tools/handlers対応・spec-review=tools[]/handlers省略可 の対応が暗黙であり、Agent に宣言した tool の handler が未実装の状態が起きうる

`ConfigStore.getAgentId` 同期呼び出し前提と `load()` 完了前提を design.md D7 に追記する :: CLI lifecycle での `load()` → `StepExecutor` 生成の順序保証が暗黙であり、実装者が非同期順序を誤る可能性がある

AgentSyncer の idempotent 境界（API 呼び出しに限定、lastSyncedAt は no-op でも更新）を agent-syncer/spec.md に Requirement/Note として明記する :: 「idempotent」と「lastSyncedAt が更新される」の整合性が複数箇所の並列記述で不明瞭なため統一表現にする

Open Questions を全て decision に変換し Resolved Questions セクションへ移動する :: 実装着手前に決まっていない設計判断が残ると実装者が都度確認が必要になる。load() で migration 起動・migrate() 公開しない、4 メソッドのみ、等の決定を記録する

version フィールドを `number` 型で宣言しつつ現在値 `1` のみ有効とする旨を cli-config-store/spec.md に明示する :: design.md が `version: number` と書き、既存が `version: 1` literal のため意図が不明。将来の bump 余地を残しつつ未知値は CONFIG_INVALID とすることで互換性を担保する

`openspec validate` 出力の ADDED capability 3 行確認を tasks.md §10.1 に追記する :: 3 つの新規 spec が capability として認識されることの具体的な確認手順がなかった

Migration 複合ケース（片側欠損 + 旧 agent 併存）と 3 操作独立性原則を design.md D4 テーブルに追加する :: test-cases.md の must シナリオに「片側欠損」が含まれるが design.md の Migration テーブルに複合ケースが未定義だった
