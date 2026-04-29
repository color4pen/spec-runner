# Architect Decisions

design.md D7 と既存 `appendStepResult` の名前衝突を HIGH として findings に上げる :: 同一シンボル名で意味が「merge」から「push」へ反転する設計はサイレントなヒューマンエラーを誘発し、module-analysis.md 4.3 の懸念と一致する
spec-review-session の delta が legacy `spec-review-result.md` パスを `spec-review-result-{NNN}.md` に変えると明示する :: 既存 spec の Scenario が新形式を反映しない場合、既存 spec との consistency regression が発生する
loop プリミティブが state.history の append と writeJobState を直接行うかを spec で固定する :: design D8 と pipeline-loop-primitive spec で history append は loop の責務とされるが、persist 責務（writeJobState）が loop か step か曖昧なまま残る
spec-fixer の commit + push 失敗時のセマンティクスを spec で確定する :: design D11 と spec-fixer-session 仕様で push 失敗が `state.status = failed` か「次 iter の spec-review が再評価する」か明文化されていない
config.agent.id の deprecation 期限を ADR/出口戦略の形で残す :: D6 / cli-config-store delta は dual-write を保つが、削除条件と移行完了の判定基準を別 request の入口に置かないと永続化する
PipelineDeps の独立モジュール化を tasks に上げる :: module-architect が決定済みだが、spec / tasks に該当作業が見えず実装段階で循環 import が再発するリスクがある
runManagedAgentSession ヘルパの責務範囲を design に明示する :: module-analysis 2.1 の推奨が design に取り込まれていない場合、spec-fixer 実装で session ライフサイクル 80 行が三重化する
