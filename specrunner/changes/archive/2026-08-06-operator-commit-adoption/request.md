# operator が commit 済みの手当てを resume 時に採択する

## Meta

- **type**: spec-change
- **slug**: operator-commit-adoption
- **base-branch**: main
- **adr**: false

## 背景

pipeline は push 前に egress 検証を行い、publish range（`git rev-list HEAD --not --remotes=origin`）の全 commit が `synthesizedCommits` ledger に載っていることを要求する。載っていない OID があれば `EGRESS_UNKNOWN_COMMIT` で fail-closed し、push しない。これは agent が pipeline を経由しない commit を origin へ送り出せないようにする backstop である。

operator が escalation を手当てして resume する場合、この backstop に衝突する。手当てで作った commit は ledger に無いため、resume 後の最初の step が commit-push まで進んだ時点で halt する。step の実行コストを払ってから落ちる。

`resume --apply-canon` がこの衝突を一部解消している。protected canon path が dirty なとき、operator-apply commit を作って OID を ledger に記録する。しかし検出が `git status` ベースであるため、**operator が既に commit を作っていた場合は worktree が clean で、gate が何も検出しないまま resume が進む**。この経路では従来通り step 実行後に `EGRESS_UNKNOWN_COMMIT` へ落ちる。

回避策は「operator は手当てを commit したら手で push する」という規約だが、この規約はコードコメント（`src/core/step/commit-push.ts:389`）にしか存在せず、機械的な強制も警告も無い。

## 現状コードの前提

- `src/core/step/commit-push.ts:342-374` — `verifyEgressLedger` が `git rev-list HEAD --not --remotes=origin` を列挙し、ledger に無い OID があれば `egressUnknownCommitError` を throw する。
- `src/core/step/commit-push.ts:383-389` — publish range の設計コメント。「Pre-existing legitimate commits are excluded because they are on origin (pipeline pushes after every synthesis; operator hand-commits are hand-pushed)」と、operator が手で push する前提が書かれている。
- `src/errors.ts:474-480` — `egressUnknownCommitError` のメッセージは "A commit not created by the pipeline was found in the push range. Investigate and resolve before retrying." で、解決手段を示していない。
- `src/core/command/resume.ts:290-306` — apply-canon gate。`resolvedWorktreePath` と `resolvedSlug` が非 null のときのみ動き、`detectCanonDirtyPaths` の結果が空なら何もしない。
- `src/core/command/resume.ts:307-315` — `--apply-canon` 指定時は `commitOperatorCanon` で commit し、`appendSynthesizedCommit` で ledger に追加して `runStore.persist` する。
- `src/core/command/resume.ts:316-334` — persist 失敗時は `git reset --mixed HEAD~1` で commit を巻き戻す split-brain guard。コメントに「recoverable only via the manual-push tribal knowledge this feature removes」とある。
- `src/core/resume/apply-canon.ts:42-89` — `detectCanonDirtyPaths` は `git status --porcelain` ベース。commit 済みの変更は検出対象外。
- `src/core/resume/apply-canon.ts:11-12` — 「commitOperatorCanon commits ONLY the specified paths. Non-canon dirty files in the worktree are intentionally left untouched」。
- `src/core/step/write-scope.ts:64-74` — `protectedCanonPaths` は request.md / spec.md / design.md / tasks.md / test-cases.md / fact-check attestation の 6 つ。

## 要件

1. resume 時、step を 1 つも実行する前に publish range と ledger を突き合わせる。apply-canon gate の後、pipeline 起動の前に行う。
2. ledger に無い OID が存在し採択が指定されていない場合、step を実行せず escalation で停止する。escalation は各 OID について short SHA・subject・author・変更した path を示し、解決手段として「`--adopt-commits` を付けて resume する」「当該 commit を origin へ push する」「当該 commit を取り消す」の 3 つを提示する。
3. `resume --adopt-commits` を追加する。ledger に無い publish range の OID を `synthesizedCommits` へ追加し、persist に成功してから pipeline を起動する。persist に失敗した場合は pipeline を起動しない（fail-closed）。
4. `--apply-canon` の意味は変更しない。commit 済みの operator commit を `--apply-canon` だけで採択してはならない。`--apply-canon` は protected canon path の dirty 変更を commit する機能のままとする。
5. `egressUnknownCommitError` のメッセージに解決手段を含める。要件 2 と同じ 3 つの手段を示す。

## スコープ外

- **publish range が空でない状態そのものの防止**。pipeline は step ごとに push するため、通常 publish range は空になる。空でないのは operator が介入した場合か push に失敗した場合であり、後者は既存の push retry / escalation が扱う。
- **採択した commit の内容検証**。`--adopt-commits` は operator が意図して作った commit であることを前提とし、diff の妥当性は検証しない。内容は PR レビューで見る。
- **非 canon path の dirty ファイルの自動 commit**。`--apply-canon` の現行挙動（canon path のみ commit、非 canon の dirty は放置）は変更しない。
- **`job archive` の Phase 1 が non-fast-forward で失敗する問題**。別 worktree から push した場合に job の local branch が remote より遅れる件は、本 request の対象外とする。本 request は「commit したが push していない」経路を扱い、archive の失敗は「push したが local が遅れている」経路であって発生条件が異なる。

## 受け入れ基準

- [ ] ledger に無い commit が publish range に存在し `--adopt-commits` を指定せずに resume したとき、step が 1 つも実行されないことを assert するテストが存在する（step 実行の副作用が無いことで判定する。`EGRESS_UNKNOWN_COMMIT` が step 実行後に出る現行挙動では fail する）
- [ ] 同条件の escalation メッセージが、該当 commit の short SHA と 3 つの解決手段を含むことを assert するテストが存在する
- [ ] `--adopt-commits` 指定時に該当 OID が `synthesizedCommits` に追加され、persist された state に反映されることを assert するテストが存在する
- [ ] `--adopt-commits` 指定かつ persist が失敗したとき、pipeline が起動しないことを assert するテストが存在する
- [ ] `--apply-canon` のみを指定して commit 済みの operator commit がある場合、それが採択されずに要件 2 の停止が起きることを assert するテストが存在する（`--apply-canon` の意味が広がっていないことの固定）
- [ ] publish range が空の通常経路で、resume の挙動が変わらないことが既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

**採用: 検出は無条件、採択は明示 flag。**

publish range と ledger の突き合わせは flag 無しで常に行い、不一致なら停止する。停止は情報を増やすだけで backstop を緩めない。一方 ledger への追加は backstop を開ける行為なので、`--adopt-commits` の明示指定を要求する。

**却下: resume 時に自動採択する。**

backstop が塞いでいる穴そのものを開ける。agent も `specrunner job resume` を実行できるため、「人間が CLI を叩いた」は境界にならない。自動採択は agent が commit を作ってから resume を呼ぶ経路を通してしまう。

**却下: `--apply-canon` に統合する。**

`--apply-canon` は protected canon path の 6 ファイルに限定して commit する機能で、`apply-canon.ts:11-12` が「非 canon path は触らない」と明示している。commit 済みの operator commit は任意の path を含みうるため、同じ flag に載せると既存の保証が偽になる。対象範囲が違うものは flag を分ける。

**却下: escalation メッセージの改善だけで済ませる。**

メッセージを直しても step を 1 つ実行してから落ちる点は変わらない。step の実行コストと、halt からの再開手順が残る。検出位置を resume 入口へ移すことが本体で、メッセージ改善はその副産物として同時に行う。

**採択が現状より provenance を改善する点について。**

現行の回避策は operator が手で push することであり、その commit は ledger に載らないまま origin へ出る。`--adopt-commits` は同じ egress を ledger 記録付きで行うため、記録は現状より増える。backstop を緩めるのではなく、既に開いている経路に記録を付ける変更である。

**split-brain guard は apply-canon と同じ方針を採る。**

`resume.ts:316-334` が persist 失敗時に commit を巻き戻すのと同様、`--adopt-commits` も ledger persist に失敗したら pipeline を起動しない。採択は既存 commit への ledger 追加のみで git 履歴を変更しないため、巻き戻し操作は不要で、起動しないことが一貫状態にあたる。
