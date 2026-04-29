# Module Architect Decisions

PipelineDeps を src/core/types.ts に切り出す :: pipeline.ts と loop.ts の循環 import を構造的に防ぐため、共通型は両者の上位に置く
appendStepResult をリネームし pushStepResult を新設する :: 既存呼び出し側（propose.ts / spec-review.ts）の意味が「merge」から「push」に静かに変わると型チェックで捕捉できないため、シグネチャ非互換を名前で明示する
runManagedAgentSession ヘルパに session 作成〜poll〜終了判定を集約する :: spec-review と spec-fixer が同じ 80 行を二重に持つと、将来の code-review loop で三重化する。今ヘルパ化することが loop プリミティブ導入の本来の意図と整合する
spec-review.ts を session-orchestration / result-fetch / verdict-parse の 3 関数に分割する :: 1 関数 310 LOC で iteration 引数を全層に通すのは可読性の損失が大きく、`spec-review-result-{NNN}.md` の組み立てを fetch 層に閉じ込めることで loop body 側の関心事を減らせる
getAgentId と checkConfigComplete を src/config/access.ts に同居させる :: config 読み取りアクセサを 1 ファイルに集めることで legacy fallback ロジックの所在が一箇所に固定される
spec-fixer-system.ts は spec-review-system.ts と同形式で配置する :: prompts/ 配下の build*SystemPrompt パターンが既に確立されており、配置の対称性が implementer の認知コストを下げる
runLoopUntil は body/evaluator/onExceeded を pure injection に保ち、step 固有のロジックを内蔵しない :: 後続の code-review loop が同じプリミティブで動くために、loop 層が「spec-review を知っている」状態を作らない
config.agent.id と config.agents.propose.id の同期書き込みは writeConfigAgents() ヘルパに集約する :: dual-write を runInit 内に散らすと片方のみ更新する経路が紛れ込む。1 関数で同期境界を閉じる
