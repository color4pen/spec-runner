# Architect Decisions — 2026-04-27-cli-core-pipeline iteration 1

- module-analysis.md の構造判断（custom-tool registry の colocate / atomic write 抽出 / SDK ラッパ境界）を妥当と評価する :: design.md D2 と specs/register-branch-tool が同じ単一 source-of-truth 設計を強制しており、Bug 1 再発防止の構造的健全性が確認できる
- design.md D1（polling primary, SSE secondary）を承認する :: ADR-20260427-cli-first-architecture と整合し、SSE 切断時の再接続を回避する trade-off が明示されている
- D5（config 0600 + 緩いモード時 warning 継続）を MEDIUM 観点で指摘候補にする :: 緩い permission を warning のみで継続する選択は learned-patterns「機微情報の不適切な保存」と緊張関係。design.md は「読み込み時にチェックし書き込み時に 0600 に修正」と書くがテスト/CI で fail させる選択肢が議論されていない
- session.ts と pipeline.ts の責務境界を確認する :: module-analysis.md S3-2 の指摘どおり、session.ts が state.store に直接書くか pipeline.ts が orchestrate するかが design.md/tasks.md で明示されておらず、実装時の判断が implementer に委ねられている
- OQ4 のタイムアウト既定 30 分を妥当と判定する :: SSE Custom Tool 応答時間 + propose の典型実行時間（数分〜10 分）の余裕として現実的、`--timeout` 上書き可で逃げ道もある
- OQ5 SSE retry なしを Phase 1 の trade-off として承認する :: D1 の polling primary 方針と整合、ポーリングで完了検知できる以上 SSE 再接続実装は YAGNI
- specs/propose-pipeline と specs/session-completion-detection の境界を整合性観点で再確認する :: 「完了検知」が両 spec にまたがるため、実装で `isProposeComplete` predicate を共有する module-analysis.md S3-1 の推奨は spec レベルで明示されておらず implementer 任意になっている
- design.md Risks R2（requires_action timeout fail）を Phase 1 の trade-off として承認する :: events.list での recovery を Phase 2 に送る判断は spec が「best-effort、Phase 1 では不要」と明示しており妥当
