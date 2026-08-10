# resume の operator 案内整備: 採用系 halt の preflight 統合と詳細ヘルプ

## Meta

- **type**: spec-change
- **slug**: resume-operator-guidance
- **base-branch**: main
- **adr**: false

## 背景

`job resume` は operator の介入結果（worktree の未 commit canon 編集・operator 自身の commit）を取り込むために `--apply-canon` / `--adopt-commits` を要求する fail-closed 設計だが、案内が不揃いで初見の利用者（特に agent session）が迷う:

1. dirty canon と未知 commit の検出 gate が直列で、両方ある場合は halt → flag 追加 → また halt と最大 3 回の往復になる
2. dirty canon 側の halt は flag 名を言うだけで、実 slug 入りのコピペ可能なコマンドを提示しない（未知 commit 側は提示する）
3. `job resume --help` が「No detailed help available.」を返し、11 個ある flag のうちグローバル usage に載るのは 3 形態のみ。運用上重要な `--from` / `--prompt` はどのヘルプにも出ない
4. slug を渡して見つからない場合のエラーが「no job ID starts with '...'」と Job ID の語彙で返り、usage の `<slug>` と繋がらない

fail-closed の意味論（自動採用しない）は正しい前提とし、案内を完全にして往復を 1 回に減らす。

## 現状コードの前提

- apply-canon gate が adopt gate より先に評価され、dirty canon で halt した場合は adopt 検出（`detectUnadoptedCommits`）が実行されない: src/core/command/resume.ts:296-393（gate 1）→ 398-440（gate 2）
- dirty canon halt の Hint は「Use --apply-canon to commit these changes ...」で、実 slug 入り完全コマンドを含まない: src/core/command/resume.ts:382, 389
- 未知 commit halt は `egressResolutionOptions(slugLabel)` で `specrunner job resume <slug> --adopt-commits` を含む 3 択を提示する: src/errors.ts:404-413
- resume subcommand エントリに `usage` フィールドが無く、`job resume --help` は `NO_DETAILED_HELP_USAGE` を表示する: src/cli/command-registry.ts:632-646（resume エントリ）, 197（定数）
- resume の flag は from / force / verbose / quiet / prompt / prompt-file / json / no-worktree / apply-canon / adopt-commits / detach の 11 個: src/cli/command-registry.ts:633-645
- `--detach` と `--json`、`--prompt` と `--prompt-file` はそれぞれ相互排他: src/cli/command-registry.ts:649, 674
- slug 解決に失敗すると Job ID prefix へ fallback し、`JobStateStore.resolveId` のエラー「Job not found: no job ID starts with '...'」をそのまま表示する: src/core/command/resume.ts:131-143, src/store/job-catalog.ts:288
- `--from` の有効値は flag-parser の values 検証で列挙エラーになる（この挙動は既に良好）: src/cli/command-registry.ts:634, src/kernel/step-names.ts:13
- 既存テストの halt メッセージ pin は `toContain("--adopt-commits")` 等の緩い含有検証: src/core/command/__tests__/resume-adopt-commits.test.ts:486, 775

## 要件

1. **採用系 preflight の統合案内**: resume 実行時点で apply-canon gate が halt する場合、halt 前に adopt gate の検出（`detectUnadoptedCommits`）も実行し、両方の検出結果を 1 つの halt メッセージに統合する。operator は 1 回の halt で必要 flag を全部知れる。
2. **halt メッセージ形式の統一**: 統合 halt は次を含む — (a) 検出内訳: dirty canon paths の列挙、未知 commit の shortSha + subject の列挙 (b) 実 slug 入りのコピペ可能な完全コマンド 1 行。flag は検出結果に応じて必要なもののみ（dirty canon のみ → `--apply-canon`、未知 commit のみ → `--adopt-commits`、両方 → 両 flag） (c) 取り込まない場合の代替案（discard / push / revert）。形式は既存 `egressResolutionOptions` の丁寧さに揃える。
3. **fail-closed 意味論は不変**: preflight は検出のみで、commit / ledger 追記等の副作用を持たない。auto-quarantine の成立条件（interruption-backed 判定）、検出失敗時の fail-closed、`--apply-canon` 指定時の既存動作はすべて変更しない。preflight での adopt 検出が失敗した場合（git exit 128 以外）は検出失敗を halt メッセージに併記し fail-closed を維持する。
4. **`job resume` の詳細ヘルプ追加**: `JOB_RESUME_USAGE` 定数を追加し、resume エントリに `usage` として配線する（`job ls` / `archive` 等と同機構）。内容: `<slug>` 引数の説明（slug で解決し、見つからなければ Job ID prefix として fallback 解決すること）、11 flag すべての説明、相互排他 2 組の明記、`--from` の有効値の説明（複合 step が対象外である旨の注記を含む）。
5. **not-found エラーの slug 文言**: resume 経路で slug でも Job ID prefix でも見つからない場合、slug で探した事実が分かる文言で報告する（例: 「no active job with slug or job ID prefix '...'」）。`JobStateStore.resolveId` 自体のメッセージは他コマンド（job show / cancel）と共用のため変更しない。

## スコープ外

- dirty canon / 未知 commit の自動採用（auto-apply / auto-adopt）。fail-closed のまま。
- TTY での対話的確認（y/N プロンプト）
- escalation 状態か否かによる gate 挙動の分岐
- auto-quarantine（interrupted-step partial canon）の条件・挙動の変更
- `job start` 等、resume 以外のコマンドのヘルプ整備

## 受け入れ基準

- [ ] dirty canon と未知 commit が併存する worktree で resume すると、1 回の halt 出力に「dirty canon paths の列挙」「未知 commit の列挙」「実 slug 入りの `specrunner job resume <slug> --apply-canon --adopt-commits`」がすべて含まれることをテストで固定する
- [ ] dirty canon のみの場合は `--apply-canon` のみ、未知 commit のみの場合は `--adopt-commits` のみを含む完全コマンドが提示されることをテストで固定する
- [ ] preflight halt の前後で git 履歴（HEAD・commit 数）と state.json の synthesizedCommits が不変であること（検出のみで副作用なし）をテストで固定する
- [ ] auto-quarantine 成立条件の既存テスト（src/core/command/__tests__/resume-partial-canon.test.ts, src/core/resume/__tests__/apply-canon-provenance.test.ts)が無改変で green
- [ ] `job resume --help` の出力が NO_DETAILED_HELP_USAGE ではなく、`--from` / `--prompt` / `--prompt-file` / `--apply-canon` / `--adopt-commits` / `--detach` を含むことをテストで固定する（tests/unit/cli/doctor-help.test.ts と同型）
- [ ] resume に存在しない slug を渡した場合の出力に slug で探した事実が分かる文言が含まれることをテストで固定する
- [ ] tests/resolve-job-id.test.ts が無改変で green（resolveId のメッセージ不変）
- [ ] halt メッセージ・halt 回数を pin している既存テストの期待更新は次のファイルに限り許容する: src/core/command/__tests__/resume-apply-canon.test.ts, src/core/command/__tests__/resume-adopt-commits.test.ts, src/core/command/__tests__/resume-partial-canon.test.ts, tests/operator-canon-apply-on-resume-e2e.test.ts, tests/resume-partial-canon-quarantine-e2e.test.ts
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **fail-closed 維持 + 案内完全化を採用**。dirty canon の自動採用（operator-apply の自動実行)は却下: staging-containment が commit 前に escalation halt する経路（src/core/step/staging-containment.ts:32）では agent の書きかけが dirty のまま残るため、無条件自動採用は agent 残骸を operator 名義で正典化するリスクがある。
- **TTY での y/N 確認は却下**: resume の主経路は agent session（非 TTY）であり摩擦が解消されない。
- **preflight は検出の統合のみで、gate の実行順・採用処理の実体は変更しない**。`--apply-canon` 指定時に apply → adopt gate と進む既存フローはそのまま。
- **resolveId の文言は共用のため触らず、resume 側で slug 文言に包む**。
