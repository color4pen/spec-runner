# Decision Log — test-case-generator (pr-create-step)

## Coverage Policy

runner の 4 シナリオ（新規作成 / 既存 OPEN / 既存 MERGED / gh 失敗）をすべて must にする :: request.md の受け入れ基準に明示されており、仕様 spec.md の 4 シナリオと 1:1 対応しているため

parseResult の 2 分岐（success / failed）を unit must にする :: pipeline の verdict routing の根幹であり、これが壊れると pr-create → end / escalate 遷移が完全に機能不全になるため

JobState.pullRequest の持続化テストを must にする :: state 記録は本 request の主要機能の 1 つ（request.md 受け入れ基準に明示）

STANDARD_TRANSITIONS の 3 行追加・1 行削除を unit must にする :: pipeline 遷移テーブルの正確性は全ワークフローの正しさを担保するため

PrCreateStep の CliStep 適合性テストを unit must にする :: kind=cli の interface 契約違反はランタイムで検出できず、静的保証が唯一の手段のため

レガシー state ファイルの後方互換性テストを integration should にする :: pullRequest field は optional で後方互換リスクは中程度。機能破壊には直結しないが、実環境で再現する可能性がある

renderPrBody の各セクション生成を unit should にする :: PR body の内容品質は機能成立に間接的に影響するが、body が多少不完全でも pr-create step 自体は動作するため

CLI snapshot テストを manual にする :: 自動テスト環境で pipeline 図の snapshot を事前に確定させることは困難であり、`--update-snapshot` 不要の PASS は実行環境依存のため

E2E（実機 gh CLI 呼び出し）は could にする :: design.md の Non-Goals に「E2E 実機検証は本 request スコープ外」と明記されているため。スタブ/モックの integration テストで代替可能

AgentRegistry から pr-create が除外されていることを unit must にする :: kind=cli step が AgentRegistry に混入すると agent syncer が存在しない agent を待機して deadlock する可能性があるため
