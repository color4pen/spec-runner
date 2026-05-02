# Spec Fixer Decisions — finish-redesign

## 修正宣言（現在形・事前宣言）

### HIGH fixes

- request.md A1 の `slug: string` を `slug: string | null` に書き換える :: 理由: legacy state（non-canonical request.path）では populate 不可なため null が canonical。design.md D1 / spec/job-state-store が `string | null` で書かれており、request.md / proposal.md との divergence を解消するために上位文書側を正とする null 許容に統一する
- proposal.md What Changes の `slug: string` を `slug: string | null` に書き換える :: 理由: 同上。実装者が参照する全文書を canonical type に揃え型エラーの源泉を断つ
- design.md D1 の `slug: string` コードブロックを `slug: string | null` に書き換える :: 理由: 同上。design.md が `null` 許容を文章で言及しているにもかかわらずコードブロックは `string` のままで矛盾していたため
- cli-commands/spec.md の `specrunner ps` Requirement に `--all` flag semantics を追加する :: 理由: Scenario に `--all` が登場するにもかかわらず Requirement 本文に flag 定義が無く、implementer が semantics を自由解釈できる状態を解消する
- cli-finish-command/spec.md に Phase 2 `git push` 失敗時の escalation Scenario を追加する :: 理由: review-lessons の「失敗パスを Requirement + Scenario で明文化する」再発防止項目。push reject / network error 時の挙動（escalation、state 残置、再実行可能）を spec で固定する

### MEDIUM fixes

- design.md Open Questions から `markJobArchived` タイミング項目を削除し Decisions 相当の記述に統合する :: 理由: spec.md が「Phase 4 の最後」で MUST 記述しており既に決定済み。未解決として残すと implementer を迷わせる
- cli-finish-command/spec.md に「複数 state 該当時の最新 updatedAt 優先」Scenario を追加する :: 理由: Requirement 本文に MUST として記述されているにもかかわらず対応 Scenario が存在せず、テスト根拠が宙に浮く
- cli-finish-command/spec.md の Phase 0 に feature branch existence check を check 9 として追加する :: 理由: Scenario「feature branch が既に削除済み（resume）」が Phase 0 pre-flight で feature branch が存在しないことを前提にするが、check 1〜8 に対応する前提チェックが宣言されていない
- tasks.md 1.3 / 1.4 の配置先を `src/state/job-slug.ts` に固定する :: 理由: module-analysis 2.2 / 4.3 が `store.ts` ではなく独立純粋 module を推奨しており、tasks と module-analysis の二択を解消して実装者の迷いをなくす
- cli-finish-command/spec.md Phase 1 の git checkout を `git fetch origin + git checkout -B` 強制で明記する :: 理由: review-lessons「stale local branch の silent reuse」再発防止。`-B` flag で force re-point しないと古い local branch をそのまま使う経路が残る
- cli-finish-command/spec.md に `git diff --cached --quiet` exit code で staged 変更を判定することを MUST で追加し、CLI 文言マッチを SHALL NOT で禁止する :: 理由: review-lessons「git commit の stdout 文言依存判定」再発防止
- register-branch-tool/spec.md の MODIFIED ハンドラ Requirement に slug 空文字列 / 型外 validation 規則を追加する :: 理由: 既存 Requirement が branch の validation を定めているのに slug については完全に無言。実装者が空文字 slug を書き込む経路を塞ぐ
- cli-finish-command/spec.md の `--dry-run` stdout を fixed schema 形式（bullet + field: value）に変更する :: 理由: review-lessons「result-file の fixed schema 未定義」再発防止。tooling が将来 parse する想定で schema を固定する
- cli-finish-command/spec.md の 1-PR モデル Requirement に `--admin` 適用条件を MUST で追加する :: 理由: spec が `--admin` の適用条件を定めないまま tasks が「`--force` で `--admin` 付与」と書いており、branch protection bypass の条件が曖昧なまま実装に流れる

### LOW fixes

- cli-finish-command/spec.md Phase 0 check 3/4 で `gh pr view <num> --json mergeStateStatus,state,headRefName` を MUST 明記する :: 理由: review-lessons「外部 CLI 出力の `--json` 強制」preventive 適用
- cli-finish-command/spec.md の `--dry-run` flag 表記位置を全箇所 `[<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` に統一する :: 理由: flag は位置非依存だが Requirement 間で表記が揺れると読者が混乱する
- job-state-store/spec.md から `awaiting-merge/<slug>/` の言及を削除する :: 理由: `specrunner run` は active phase でのみ起動されるため awaiting-merge 配下の path は dead code
- cli-finish-command/spec.md の「通常成功フロー」Scenario 文言を「feature branch の全 commit（archive commit を含む）が単一 commit として main に landing する」に書き換える :: 理由: "archive commit が main に反映され" の表現が "squash で 1 commit に潰れる" semantics を正確に伝えない
