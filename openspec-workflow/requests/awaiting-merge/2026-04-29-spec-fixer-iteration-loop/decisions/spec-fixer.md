# Spec-Fixer Decisions

appendStepResult を pushStepResult にリネームし既存 merge-style appendStepResult を削除すると明記する :: 同名で merge→push の意味反転は型チェックを通過するサイレントヒューマンエラーの温床になるため、名前の非互換性で意図を明示する（module-architect decision 行 2 / finding #1 HIGH）
spec-review-session delta に Array-Compatibility Note ヘッダを追加して carry-over Requirements が配列化に対し意味的変更不要と宣言する :: 既存 spec の 4 Requirement を個別に MODIFIED するより、前提を一括宣言する方が変更面積が小さく drift しにくい（finding #2 HIGH）
spec-fixer-session に push 失敗検知の委任方針を新 Requirement として明文化する（SPEC_FIXER_PUSH_INCOMPLETE は生成しない） :: CLI から session 内部の git push 結果を観察する手段がなく、design D11 の「次 iter の spec-review に委ねる」方針を spec レベルで固定することが最小変更で整合する（finding #3 HIGH）
tasks.md 4.0 で src/core/types.ts 新設タスクを追加し pipeline-orchestrator spec に PipelineDeps 正規ロケーション Requirement を追加する :: module-architect decision 行 1 が既に決定済みだが tasks / spec のいずれにも未反映だったため、循環 import を構造的に防ぐための記録を delta に入れる（finding #4 HIGH）
pipeline-loop-primitive spec に writeJobState 責務が body 内 step 関数にある旨を追記し design D8 擬似コードにコメントを付与する :: runLoopUntil が persist を呼ぶか step が呼ぶかを spec 上で固定し、double persist（冗長性）と persist 漏れの両方を防ぐ（finding #5 MEDIUM）
design.md に Deprecation Plan for config.agent.id セクションを追加して削除条件・移行スクリプト要否・version バンプ基準を明記する :: Trade-off の「将来の clean-up request で削除する前提」を具体的な条件に落とすことで、将来の request 起票者が判断できる情報を残す（finding #6 MEDIUM）
design.md に Session Lifecycle Helper Extraction セクションを追加し tasks.md に 5.0 を新設する :: module-architect decision 行 3 で採用済みだが design / tasks への反映が漏れていたため明文化する（finding #7 MEDIUM）
spec-fixer-session に deferred メモの扱いを新 Requirement として追加し retry 上限で吸収されることを合意として固定する :: 早期 escalation は Open Questions に既存（スコープ外）のため実装しない。retry 上限（maxRetries）が無限ループを防ぐ保証として機能することを spec 上で明示する（finding #8 MEDIUM）
job-state-store spec に specrunner ps 経由での旧形式読み込みシナリオを追加し design.md Migration Plan に注記を追加する :: 読み込みのみ経路では永続化が発生しないという事実と、ps コマンドの警告出力要件を明記して ps ユーザーへの情報提供を保証する（finding #9 MEDIUM）
hint 文字列・Migration Plan の N 表記を spec-review-result-<NNN>.md に統一する :: {NNN} が 3 桁ゼロ埋めを意味すること、N が自然数の変数であることを文脈で区別可能にする（finding #10 MEDIUM）
pipeline-loop-primitive spec に stdout フォーマット正規定義の所有権を pipeline-loop-primitive に集約する旨の Requirement を追加する :: pipeline-orchestrator との二重定義を解消して drift リスクを排除する（finding #11 LOW）
tasks.md 章頭 (section 0) にテストファイル配置規約を追加する :: test/ 直下への配置規約を明示して PR レビュー時の散在を防ぐ（finding #12 LOW）
agent-environment-bootstrap spec の post-init 検証シナリオに custom_tools の null/undefined 許容を注記し tasks 3.6 に厳密比較回避の指示を追加する :: SDK retrieve が null/undefined を返す可能性があり === [] 比較で取りこぼすリスクを排除する（finding #13 LOW）
