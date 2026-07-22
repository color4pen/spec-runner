# ADR-20260722: write-scope 検査面を step 実行の全効果へ拡張し 3 突破経路を閉じる

**Date**: 2026-07-22
**Status**: accepted

Extends: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md)

## Context

ADR-20260721 が導入した write-scope 境界強制は「現在の worktree の未 commit 変更」を検査面としていた。
この検査面は commit 境界を最小強制点とする ADR-20260721 の設計と整合していたが、実リポジトリでの運用で
以下の 3 経路が検査面の **外側** を通ることが確認された。

### 経路 1: 事前 stage の混入（index 汚染）

`commit-push.ts:117` の commit は pathspec なし（`git commit -m <msg>`）であるため、index 全体を commit
する。scoped mode の staging（`git add -A -- <宣言 path>`）を経ても、step 実行**前**に許可外 path が
index に stage 済みだと、その path が commit に混入する。scoped 残余検査は保護正典 path のみを対象と
するため、任意のソースファイルは素通りする。

### 経路 2: agent 自己 commit の無検査 push

agent が自分で `git commit` すると worktree が clean になるため、`git diff --cached --quiet` が「staged
変更なし」と判定してコミット経路に入らない。`commitAndPushTail` の HEAD 前進検出経路は commit 内容を
一切検査せず `pushOnly` を実行する。正典を弱体化した commit がそのまま remote に到達する。

### 経路 3: scoped 残余違反を復元して続行

scoped staging 後に保護正典 path の残余違反（`findWriteScopeViolations`）が検出された場合、旧実装は
quarantine + `git checkout HEAD` で復元した後に**処理を続行**していた。step は「改変後の正典を読んで
審査した」にもかかわらず、記録上は「復元後の正典に対する審査」として結果がそのまま採用された。

### 既存制約との整合

- ADR-20260721 D2（write-scope 単一ソース `write-scope.ts`）: 本変更が追加する `findScopedCommitViolations`
  も同ファイルに配置し、leaf module 制約（`src/util/paths.ts` のみ import）を維持する。
- ADR-20260721 D1（commit 境界が最小強制点）: 本変更は SDK 層の tool-level 遮断を追加するのではなく、
  同じ commit 境界に対する検査面の拡張として設計する。

## Decision

### D1: 検査面を「step 実行の全効果（worktree + index + 自己 commit）」へ拡張する

3 経路はいずれも検査面の外側（事前 stage された index / agent 自身が作った commit）を通る。個別の穴を
塞ぐのではなく、commit 境界で強制する対象を **step 実行の全効果全体** に広げることで、同型の抜け道を
構造的に塞ぐ。

- **採用理由**: 「面の穴を 3 つ塞ぐ」設計は 4 つ目の同型経路を見逃す。面そのものを実効果に合わせることが
  根本対策。既存の write-scope 単一ソース・quarantine 機構・halt 経路をそのまま流用でき、実装面積は
  `commit-push.ts` への局所拡張に収まる。
- **却下案 — 個別経路ごとの独立パッチ**: 検査面を統一しないため同型経路の再発リスクが残る。却下。
- **却下案 — SDK permission（tool-level 遮断）**: provider 依存で managed runtime と挙動が割れる。
  ADR-20260721 A1 と同結論。却下。

### D2: 違反自己 commit は push を止めるが local 保持する（fail-closed + 証跡保存）

HEAD が step 開始時（`headBeforeStep`）から前進している場合、`headBeforeStep..HEAD` の net 変更 path を
列挙し、その step の write-scope 規則で検査する。違反があれば **push せず**、commit 差分を quarantine
して `WRITE_SCOPE_VIOLATION` halt する。違反がなければ現行どおり push する。

検査規則は mode 別:

- **scoped**: 宣言 writes + pipeline 管理 path 以外の変更 path は全て違反
  (`findScopedCommitViolations`)。
- **guarded**: 保護正典 path への変更のみ違反（既存 `findWriteScopeViolations`）。

違反 commit は **local branch に残す**（自動 `git reset` しない）。

- **採用理由**: remote 到達の阻止が目的であり、local commit は operator の調査に供する操作証跡。
  自動巻き戻しは証跡を破壊する（ADR-20260721 A2 と同結論）。push を止めて halt するだけで
  `commitFinalState` の checkpoint も違反を運ばないため remote は保護される。
- **列挙失敗は fail-closed**: `git diff --name-only` が git error を返した場合、内容を検査できないため
  push せず halt する（guarded の status 失敗 → fail-closed と対称）。
- **却下案 — 違反自己 commit を `git reset` で自動巻き戻す**: 証跡破壊。却下。
- **却下案 — 内容を検査せず現行どおり push**: 経路 2 そのもの。却下。

### D3: scoped mode の commit を pathspec 付きにする（index 混入の遮断）

scoped mode の commit を `git commit -m <msg> -- <宣言 writes + pipeline 管理 path>` とし、「staged
変更の有無」判定も同じ pathspec（`git diff --cached --quiet -- <同 path>`）で行う。guarded mode は
従来どおり index 全体（pathspec なし）を commit する。

`stagePaths` が空（宣言 writes も管理 path も無い）の場合、index 全体への fallback はしない。
commit 経路をスキップして HEAD 前進検出のみ行う。

- **採用理由**: `git commit -- <pathspec>` は列挙 path の worktree 内容を HEAD の上に載せる
  partial-commit であり、index に事前 stage された他エントリを記録しない。staged 判定も同 scope に
  することで、許可外 path が「staged 変更あり」を偽って commit 経路を起動することも防ぐ。
- **却下案 — commit 前に `git reset` で index を宣言 path のみへ絞る**: 事前 stage の他エントリを
  index から落とす副作用があり、agent が意図して stage した状態を破壊しうる。partial-commit の方が
  局所的。却下。
- **却下案 — staged 判定は whole-index のまま、commit だけ pathspec**: 判定と commit の scope が食い違い、
  許可外 stage が commit 経路を起動する縁が残る。却下。

### D4: scoped 残余違反を fail-closed に統一する

scoped mode の staging 後に保護正典 path の残余違反（`findWriteScopeViolations`）を検出した場合、
既存の「quarantine + 復元して**続行**」を「quarantine + 復元して **`WRITE_SCOPE_VIOLATION` halt**」に
変える（guarded と同じ fail-closed）。

残余検査の対象は現行どおり保護正典 path（`findWriteScopeViolations`）とする。scoped 自己 commit（D2）
が宣言外全 path を違反とするのとは対象が異なる: worktree 残余は scoped staging で commit から除外され
るため任意 source の残余は無害であり、問題は step が読んだ正典の改変に限られる。

halt は `deriveStepCompletion`（verdict 導出）より前に発生する構造（`makeCommitFailHalt` は
`executor.ts` の `finalizeStepArtifacts` 内で throw を捕捉）であるため、改変された正典を読んだ step
の結果は state に採用されない。

- **採用理由**: 改変された正典を読んだ可能性のある step の結果を無言で採用すると、「復元後の文書を
  レビューした」偽の証跡構造を許す。halt は結果採用より構造的に前に発生するため、復元後に halt すれば
  step 結果を採用しないことが保証される。
- **却下案 — 現行の「復元して続行」を維持**: 偽の証跡構造を許す。却下。
- **却下案 — 残余検査も宣言外全 path を違反にする**: scoped step が生成した scratch ファイル等まで halt
  させ、偽陽性で正常経路を壊す。対象を保護正典に限る現行規則を維持。却下。

### D5: scoped 自己 commit 規則を write-scope 単一ソースに追加する

`write-scope.ts`（leaf module）に純関数
`findScopedCommitViolations(slug, changedPaths, declaredWritePaths, managedPaths): string[]`
を追加する（= changedPaths − declaredWritePaths − managedPaths の集合差）。guarded 自己 commit は既存
`findWriteScopeViolations` を再利用する。

- **採用理由**: ADR-20260721 D2 の「write-scope 判定は単一ソースに集約」の原則を継承する。
  `managedPaths` を引数注入することで leaf 制約（`src/util/paths.ts` のみ import）を保つ。
  `write-scope-invariants.test.ts` / `write-scope-rules-consistency.test.ts` の機械保証対象に載る。
- **却下案 — `partitionRoundChanges` を re-export して流用**: round 意味論（member 属性不能・round halt）を
  sequential 経路へ持ち込み意図がぼやける。単一ソース明示を優先。却下。

### D6: quarantine を commit 差分レンジ対応に一般化する

`quarantineViolationEvidence` に任意の diff レンジ指定（`{ base, head }`）を受ける口を足す。指定時は
`git diff <base> <head> -- <path>`（commit された差分）を退避し、未指定時は現行どおり
`git diff HEAD -- <path>`（worktree 差分）を退避する。

- **採用理由**: 自己 commit の違反内容は既に commit 済みで worktree に無いため、`git diff HEAD --` では
  空になる。commit レンジ diff が必要。既存呼び出しは未指定で無改変。
- **却下案 — 自己 commit 用に別 quarantine 関数を新設**: 退避先パス・untracked fallback・ディレクトリ
  生成の重複が生じる。既存関数のパラメタ拡張で足りる。却下。

## Alternatives Considered

### A1: 個別経路ごとの独立パッチ（面の統一なし）

各経路（index 混入 / 自己 commit / 残余続行）を独立したパッチとして修正する案。

- **Pros**: 修正範囲が明確で、各修正が独立してロールバック可能。
- **Cons**: 検査面を統一しないため、同型の 4 つ目の経路が発生した場合に再度個別修正が必要。3 経路の
  間の整合（fail-closed の統一など）も保証されない。
- **Why not**: 面そのものを実効果に合わせることで、個別パッチより根本的に抜け道の再発を防げる。

### A2: 違反自己 commit の自動巻き戻し（`git reset`）

push を止めた後に `git reset` で local commit も巻き戻す案。

- **Pros**: pipeline が commit 汚染なしに再 resume しやすくなる。
- **Cons**: agent が何をしたかの証跡（local commit）を消す。operator の調査・デバッグが困難になる。
  ADR-20260721 A2 と同結論。
- **Why not**: remote 到達阻止が目的であり、local 証跡は保持すべき。halt メッセージで退避先を明示し
  operator に調査を促す設計を優先。

### A3: scoped 残余の「復元して続行」を維持する

scoped staging 後の残余違反を halt せず、復元して後続処理を続行する現行挙動を維持する案。

- **Pros**: step を halt させないため pipeline の完走率が上がる。
- **Cons**: 改変された正典を読んだ可能性のある step の verdict を採用することになり、「復元後の文書を
  レビューした」偽の証跡構造を許す。特に judge step（spec-review 等）が request.md の弱化版を読んで
  判定した場合、その判定結果が採用される。
- **Why not**: 偽の証跡構造は監査不能。fail-closed への統一を選択。

## Consequences

### Positive

- write-scope 検査が「step 実行の全効果」を面とするようになり、worktree 差分の外側を通る同型経路の
  再発リスクが構造的に低減する。
- guarded / scoped の残余違反が fail-closed に統一され、違反経路の挙動が予測しやすくなる。
- scoped 自己 commit 規則が `write-scope.ts` 単一ソースに追加され、機械保証対象になる。
- 自己 commit 違反は push を止めて local に残すため、operator がブランチを調査して問題の範囲を
  確認できる。

### Negative

- scoped mode の staged 判定と commit に pathspec が付き、自己 commit 時に range diff の extra spawn が
  増える。境界強制のためのコストとして許容する。
- 違反自己 commit を local に残すため、halt 後に operator が手当てせず `resume` すると、次の
  `headBeforeStep` が違反 commit の SHA になる。operator は halt メッセージの退避先を確認して
  手動 reset してから resume することが期待される。resume 経路の遡及是正は本変更のスコープ外。

### Known Debt

- halt 後に operator が resume した場合の「headBeforeStep が違反 commit を指す」問題は、本変更の
  スコープ外（過去 commit の遡及監査）として残る。将来は resume 経路で違反 commit 検出を行う機構が
  必要になりうる。
- `git commit -- <pathspec>` の partial-commit は列挙 path の worktree 内容を記録するため、scoped の
  staged 判定・add・commit を全て同一 pathspec に固定する制約が生まれる。将来的に両者を乖離させる
  変更を入れる際は注意が必要。

## References

- Request: `specrunner/changes/write-scope-bypass-closure/request.md`
- Design: `specrunner/changes/write-scope-bypass-closure/design.md`
- Spec: `specrunner/changes/write-scope-bypass-closure/spec.md`
- Implementation: `src/core/step/commit-push.ts`・`src/core/step/write-scope.ts`
- Extends: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md) — write-scope 境界強制の初期導入（本 ADR が拡張する基盤）
- Related: [ADR-20260604-step-io-contracts](2026-06-04-step-io-contracts.md) — Step の reads()/writes() 宣言基盤
- Related: `src/core/pipeline/round-git-scope.ts` — 並列 round 経路の scoped staging（本 ADR の D5 と同型）
