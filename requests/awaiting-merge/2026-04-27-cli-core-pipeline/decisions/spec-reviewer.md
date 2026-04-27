# Spec Reviewer Decisions — 2026-04-27-cli-core-pipeline iteration 1

- 受け入れ基準 8 項目すべてが delta spec の Scenario と紐付いているか個別に突合する :: request.md の受け入れ基準が delta spec のシナリオに 1:1 対応しているかが completeness の核心
- specs/cli-commands と specs/propose-pipeline の境界を整合性チェックする :: cli-commands の `Scenario: 必要な config 項目が揃っている` が propose-pipeline の状態マシン詳細を要約しており、両者で詳細度が異なるが矛盾はない
- specs/cli-config-store の `Scenario: 部分的な init 後に login` を整合性問題として記録する :: scenario name が「init 後に login」だが内容は「init 後 login 未実行で run」を扱っており、記述が紛らわしい (LOW)
- request.md 受け入れ基準「ブランチ上に change folder の存在が確認できる」と specs/propose-pipeline の `Scenario: ブランチが GitHub に存在しない` の整合を確認する :: 仕様は「branch 存在を 200/404 で判定」だが change folder 自体の存在は検証していない。受け入れ基準は「change folder の存在確認」を求めているが spec は「branch 存在確認」までに留まる — completeness の gap (HIGH 候補)
- propose セッション初回メッセージの仕様詳細を確認する :: specs/propose-pipeline の Requirement「初回メッセージとして system prompt 派生のテンプレートを送る」は title/type/content/change-folder/enabled を含む XML タグ防御を SHALL で規定しており、constraints.md の prompt injection 対策と整合
- specs/agent-environment-bootstrap の Requirement「Custom Tools は registry 経由で Agent に登録される」と specs/register-branch-tool の Requirement「definition と handler は colocate」が単一 source-of-truth を二重に強制していることを確認する :: 整合的で重複ではなく相互補強
- specs/cli-commands `specrunner ps` のテーブル列幅・ソート順が未定義であることを LOW として記録する :: 列名は決まっているが「JOB_ID 8 文字短縮」「AGE 人間可読」以外のフォーマット詳細（ソート順、列幅、color）が空で、実装ばらつきリスクあり
- specs/job-state-store の `terminated` ステータスと specs/session-completion-detection の `terminated` 観測時挙動の整合を確認する :: job-state-store の status enum に `terminated` が含まれるが、session-completion-detection は `failed` にマップする。spec 間で status の扱いが微妙にずれている可能性 (MEDIUM 候補)
- request.md スコープ外項目「specrunner/ ディレクトリの対象リポジトリ内設計」が後続 request の責務として spec から除外されていることを確認する :: design.md Non-Goals および proposal.md と整合、completeness 観点で問題なし
