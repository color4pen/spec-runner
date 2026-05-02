# test-case-generator decisions — finish-redesign

## カバレッジ方針

TC-101〜TC-110 は request.md G セクションで must として要件化済み。これをそのまま must で生成する :: request.md の受け入れ基準に明示されているため、設計者の intent を尊重して must を上書きしない

slug schema 化（RequestInfo.slug / getJobSlug / stripBranchPrefix）の入出力カバレッジは TC-101, TC-102 の adversarial fixture に加え、unit レベルで各 fallback branch を個別テストする TC を追加する :: getJobSlug の fallback chain は 3 分岐（slug present / branch fallback / path basename fallback）あり、全分岐を 1 ケースでカバーできないため

stripBranchPrefix の known prefix 5 種（feat/ fix/ change/ refactor/ chore/）を網羅するケースを 1 TC にまとめる :: テーブルドリブンで 1 TC 内に複数 input/output を列挙できるため分割より集約が実装コストを下げる

Phase 0 pre-flight 9 check は check ごとに個別 TC を立てる（fail path） :: check の独立性が仕様で保証されており、1 check の fail 検出が他 check の実行に影響しない設計のため観点が重複しない

mergeStateStatus=UNKNOWN retry は TC-104 (1 回 UNKNOWN → CLEAN) と TC-104b (3 回連続 UNKNOWN → escalation) を別 TC にする :: 成功/失敗の 2 分岐で期待結果が全く異なるため

--dry-run の destructive op ゼロ assertion は integration 区分にする :: subprocess spawn の count を assert する検証はプロセス境界をまたぐため unit では不十分

ps --all の archived 表示は TC-110 の must に加え、--all なし時の archived 非表示を should で追加する :: 境界条件（flag off 時の除外）は flag on 時の表示と対になる仕様のため

register_branch の slug validation（空文字列/string 型以外/strip 不可 branch）は could にする :: 後方互換に関わる境界条件だが、spec.md にシナリオが明記されており should でも良かったが handler の入力バリデーションはコア機能でなく could が妥当

Phase 2 push fail 時の escalation を should にする :: spec.md に Scenario が明記されているが中核フロー（Phase 1-4 全成功）が壊れない限り別フェーズの escalation は should 相当

markJobArchived のタイミング（Phase 4 最後）をカバーする TC を must にする :: design.md で explicit な決定（> markJobArchived のタイミング: Phase 4 の git pull --ff-only 完了後に実行することで確定）と記録されており状態乖離の根本原因に直結するため

1-PR モデルの No archive PR / No chore branch assertion を must にする :: 2-PR モデルへの意図しない回帰を検出する regression test として最優先

既存 2-PR モデル前提テストの削除（TC-001〜TC-064 の該当部分）はテストケース削除指示として記述し、カバレッジ算入しない :: implementer が削除対象を判断するための annotation として機能させる

TC 番号割り当て: TC-101〜TC-110 は request.md 指定のまま保持、新規は TC-111 から連番で採番する :: 既存番号との衝突を避けるため
