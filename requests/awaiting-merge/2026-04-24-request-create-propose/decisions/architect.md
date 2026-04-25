# Architect Decisions — spec-review iteration 1

design.md の 7 decisions を評価し、既存 codebase パターンとの整合性を検証する :: propose フローが bootstrap フローと同構造であることの確認と差分の特定が必要

startBootstrap() パターン流用は妥当と判断する :: 実績パターンの再利用、ロールバック処理の一貫性、createBoundSession + sendMessage の汎用性が根拠

slug 格納方針の曖昧さを指摘する :: task 4.6 は「DB に保存 or 決定的導出」の二択を残しているが、session-completion-handler が branch name を再構築するには slug の確定的な取得手段が必要。仕様段階で一方に確定すべき

database/spec.md の delta 欠落を指摘する :: enabled カラム追加と role enum 拡張は database/spec.md が正の定義。delta spec が存在しないと実装者が conflicting sources を参照するリスク

propose 完了後の request status 遷移先を確認する :: in-progress 維持は 4-session モデルとして正しいが、次の遷移トリガー（spec-review セッション開始）が本 request の scope 外であることを Non-Goals に明記すべき
