# Architect Decisions — spec-review iteration 1

design.md の Decision 1-6 を妥当と判断する :: SSE ループ内での requires_action ハンドリングは SDK の設計に沿っており、webhook 代替案は実現不可能。custom-tool-handler.ts への分離は session-completion-handler.ts と同じ設計原則に従う

branch_name の DB 永続化 + フォールバック戦略を妥当と判断する :: constraints.md の「決定的導出のソースは単一にする」に整合。フォールバック付き移行は既存動作を壊さない漸進的アプローチ

Decision 5 の「SSE ループは break しない」を注意点として記録する :: requires_action 後にセッションが running に復帰するため break は不適切。ただし、ツール処理中のタイムアウトや接続切断時のリカバリ仕様が delta spec に不足している

Decision 6 の Agent 作成時 tools 配列について検証必要と判断する :: design.md 自身が「SDK ドキュメントを確認し、Session 作成時に tools を指定できるか実装時に検証する」と認めており、spec が SDK の挙動を前提としているが未検証。ただし ADR-20260424 で Custom Tools の基本フローは調査済みのため、実装段階での検証で十分と判断

register_branch の冪等性を指摘する :: 同じ request_id に対して register_branch が複数回呼ばれた場合の挙動が未定義。上書き or エラーの方針を明示すべき

change-folder-viewer の slug 抽出ロジックの脆弱性を指摘する :: branch_name から slug を抽出する仕様（「prefix 以降を slug とする」）は、branch_name のフォーマットが `{prefix}/{date}-{slug}` であることを暗黙の前提としている。エージェントが異なるフォーマットで branch_name を報告した場合に破綻する
