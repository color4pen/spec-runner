# write-set 検査を開始 HEAD・index・agent commit まで拡張し、既知の 3 突破経路を閉じる

## Meta

- **type**: spec-change
- **slug**: write-scope-bypass-closure
- **base-branch**: main
- **adr**: true

## 背景

write-set の commit 境界強制は導入済みだが、検査が「現在の worktree の未 commit 変更」を中心に構成されているため、次の 3 経路で突破できることが実リポジトリで確認された。

1. **事前 stage の混入**: `git commit -m` は index 全体を commit する。step 実行前に許可外ファイルが stage されていると、scoped staging（宣言パスのみ add）を経ても commit に混入する。scoped mode の残余検査は保護正典パス集合のみを対象とするため、任意のソースファイルは検査対象外。
2. **agent 自己 commit の無検査 push**: agent が自分で `git commit` した場合、worktree が clean になるため staged-changes 検査が素通りし、HEAD 前進検出経路が**内容を一切検査せず push する**。正典弱化 commit がそのまま remote に到達する。
3. **復元して続行**: scoped mode の残余違反（例: judge step が request.md を改変）は退避・復元されるが halt しない。step は「改変後の正典を読んで審査した」のに、記録上は「復元後の正典に対する審査」として残り、結果がそのまま採用される。

## 現状コードの前提

- `src/core/step/commit-push.ts:117` — commit は `["commit", "-m", message]`（pathspec なし = index 全体）
- `src/core/step/commit-push.ts` commitAndPushTail — staged 変更なし + HEAD 前進の場合「Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is」で push のみ実行。commit 内容の write-scope 検査は存在しない
- scoped mode の残余検査は `findWriteScopeViolations`（保護正典パス − 宣言 writes）のみを対象とし、検出時は quarantine + `git clean -f` / `git checkout HEAD` で復元して**処理を続行**する（halt しない）
- guarded mode は `git status --porcelain` の変更パス（staged 含む）を検査し、違反時は quarantine + 復元 + WRITE_SCOPE_VIOLATION halt（fail-closed）
- 違反証跡の退避機構（`.specrunner/local/<slug>/write-scope-violation-*.md`）は導入済み
- `headBeforeStep`（step 開始時 HEAD）は commitAndPush に渡されている

## 要件

1. **agent 自己 commit の検査**: HEAD が step 開始時から前進している場合、`headBeforeStep..HEAD` の変更パスを列挙し、その step の write-scope 規則（scoped: 宣言 writes + pipeline 管理パス以外は全て違反 / guarded: 保護正典パスへの変更は違反）で検査する。違反があれば **push せず**、違反 commit の内容を退避して WRITE_SCOPE_VIOLATION で halt する。違反がない自己 commit は現行どおり push する。
2. **index 混入の遮断（scoped）**: scoped mode の commit を pathspec 付き（宣言 writes + pipeline 管理パスのみ）にし、事前に stage されていた許可外エントリが commit に混入しない構造にする。「staged 変更の有無」判定も同じ pathspec スコープで行う。
3. **scoped 残余違反の halt 化**: scoped mode で保護正典パスの残余違反を検出した場合、退避・復元の後に**処理を続行せず** WRITE_SCOPE_VIOLATION で halt する（guarded と同じ fail-closed）。改変された正典を読んだ可能性のある step の結果を無言で採用しない。
4. **証跡**: 3 経路とも既存の quarantine 機構で違反内容（自己 commit の場合は該当 commit の diff）を退避し、halt メッセージに退避先を含める。
5. **正常経路の保存**: 境界内のみの変更（worktree / 自己 commit とも）の挙動・commit 内容は現行と同一に保つ。

## スコープ外

- agent 実行時の tool-level write / git 実行の遮断（SDK 層。commit 境界での強制が本 request の範囲）
- 並列 round 経路の変更（coordinator scoped staging は対象外。同一欠陥が確認された場合のみ同修正）
- 過去 commit の遡及監査
- restore 済み正典に対する既存 archive の証跡修正

## 受け入れ基準

- [ ] scoped step: 許可外ファイルを事前 stage した状態で commit 処理 → そのファイルが commit に**含まれない**ことをテストで固定する
- [ ] scoped / guarded: agent 自己 commit に違反パス（request.md 等）が含まれる場合、push が実行されず WRITE_SCOPE_VIOLATION halt になることをテストで固定する
- [ ] 違反のない agent 自己 commit は現行どおり push されることをテストで固定する（挙動保存）
- [ ] scoped 残余違反（judge step による request.md 改変）が halt になることをテストで固定する（続行しない）
- [ ] 3 経路の違反で quarantine ファイルが生成され、halt メッセージに退避先が含まれることをテストで固定する
- [ ] 修正前の挙動（無検査 push / index 混入 / 復元続行）に戻すと該当テストが fail することを破壊確認として記録する
- [ ] 既存の write-scope テスト・pipeline テストは意図された挙動変更（残余 halt 化）の期待更新を除き無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 検査対象を「worktree 差分」から「step 実行の全効果（worktree + index + 自己 commit）」へ拡張**。突破 3 経路はいずれも「検査面の外側」を通るものであり、面を実効果全体に広げることで同型の抜け道を塞ぐ。
- **採用: 違反自己 commit は push しない**（local branch には残る）。remote への到達を止めることが目的であり、local の commit は操作証跡として保持して operator の調査に供する。
- **却下: 自己 commit を `git reset` で自動巻き戻す** — 証跡破壊。push 停止 + halt で十分。
- **却下: scoped 残余の現行「復元して続行」の維持** — 改変された正典を読んだ step の結果を採用することになり、「復元後の文書をレビューした」偽の証跡構造を許す。
