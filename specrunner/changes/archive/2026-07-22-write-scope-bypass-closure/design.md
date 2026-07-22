# Design: write-set 検査面を step 実行の全効果へ拡張し既知の 3 突破経路を閉じる

## Context

write-scope の commit 境界強制（ADR-20260721）は sequential step の commit を
`write-scope.ts` 単一ソース経由で機械強制する。現行の検査は **「現在の worktree の未 commit
変更」** を面としている:

- **scoped mode**（design / spec-review / spec-fixer / judge 系など宣言 path が確定的な step）:
  `git add -A -- <宣言 writes + pipeline 管理 path>` で staging し、staging 後に保護正典 path の
  残余 dirty を検出したら quarantine + 復元して **続行** する。
- **guarded mode**（implementer / build-fixer / code-fixer / test-materialize / adr-gen）:
  `git status --porcelain` の変更 path を `findWriteScopeViolations` で照合し、違反があれば
  quarantine + 復元 + `WRITE_SCOPE_VIOLATION` halt（fail-closed）する。

この面は「worktree 差分」に閉じているため、面の外側を通る 3 経路で突破できることが実リポジトリで
確認された（request.md 背景欄）:

1. **事前 stage の混入**: `git commit -m <msg>`（`commit-push.ts:117`、pathspec なし）は index
   全体を commit する。step 前に許可外 path が stage 済みだと、scoped staging（宣言 path のみ add）を
   経ても commit に混入する。scoped 残余検査は保護正典 path のみ対象で、任意 source は検査対象外。
2. **agent 自己 commit の無検査 push**: agent が自分で `git commit` すると worktree が clean になり
   staged-changes 検査（`git diff --cached --quiet`）が素通りする。`commitAndPushTail` の HEAD 前進
   検出経路（`commit-push.ts:102-112`）は **commit 内容を一切検査せず** `pushOnly` する。正典弱化
   commit がそのまま remote に到達する。
3. **復元して続行**: scoped 残余違反（例: judge step が request.md を改変）は quarantine + 復元
   されるが halt しない（`commit-push.ts:260-277` は throw せず tail へ落ちる）。step は「改変後の
   正典を読んで審査した」のに、記録上は「復元後の正典に対する審査」として結果がそのまま採用される。

### 依拠する既存不変（実測で確認済み）

- **halt は結果採用より前に発生する**: `executor.ts:438-461` の `finalizeStepArtifacts`
  （= `commitAndPush`）が throw すると `makeCommitFailHalt` で halt 化して `return` する。これは
  `deriveStepCompletion`（`executor.ts:483`、verdict を計算・記録）より **前**。したがって
  commit 境界での halt は step 結果の採用を構造的に抑止する（経路 3 の要件を満たす前提）。
- **halt error code は保持される**: `makeCommitFailHalt`（`step-halt.ts:305-316`）は `err.code` を
  そのまま `ErrorInfo.code` にするため、`writeScopeViolationError`（code=`WRITE_SCOPE_VIOLATION`）を
  throw すれば新 halt 種別を FSM に足さずに halt 化できる。
- **halt 後の checkpoint は違反を運ばない**: `commitFinalState` は `git add -A` → staged が無ければ
  no-op で return（push しない）。自己 commit 違反で local commit を残しても、worktree は clean の
  ため checkpoint は staged 変更ゼロで push せず、違反 commit は remote へ到達しない。
- **HEAD 差分列挙の既存手段**: `git diff --name-only <base> <head>`（`local.ts:906`
  `diffPathsBetweenCommits` と同型）で 2 commit 間の net 変更 path を列挙できる。
- **scoped 自己 commit 規則の既存参照**: 並列 round 経路の `partitionRoundChanges`
  （`round-git-scope.ts`）は offending = 変更 − 宣言 − pipeline 管理 を halt 判定に用いる。本変更の
  scoped 自己 commit 規則はこれと同型。

## Goals / Non-Goals

**Goals**:

- 検査面を「worktree 差分」から **「step 実行の全効果（worktree + index + 自己 commit）」** へ拡張し、
  3 突破経路を同じ commit 境界で閉じる。
- 3 経路とも fail-closed（違反 → push せず `WRITE_SCOPE_VIOLATION` halt）に統一する。
- 違反証跡を既存 quarantine 機構で退避し、halt メッセージに退避先を含める（自己 commit は該当
  commit の diff を退避）。
- 境界内のみの変更（worktree / 自己 commit とも）の挙動・commit 内容を現行と同一に保つ（挙動保存）。

**Non-Goals**（request.md スコープ外を継承）:

- agent 実行時の tool-level write / git 実行の遮断（SDK 層）。commit 境界での強制が本変更の範囲。
- 並列 round 経路（coordinator scoped staging）の変更。同一欠陥が確認された場合のみ同修正。
- 過去 commit の遡及監査。
- restore 済み正典に対する既存 archive の証跡修正。
- 違反自己 commit の自動巻き戻し（`git reset`）。証跡破壊のため却下（D2）。

## Decisions

### D1: 検査面を「step 実行の全効果」へ拡張する（統一フレーム）

3 経路はいずれも「worktree 差分」という検査面の **外側**（事前 stage された index / agent 自身が
作った commit）を通る。個別の穴を塞ぐのではなく、commit 境界で強制する対象を
**worktree + index + 自己 commit の実効果全体** に広げることで、同型の抜け道を構造的に塞ぐ。

- **Rationale**: 「面の穴を 3 つ塞ぐ」設計は 4 つ目の同型経路（例: 別の index 操作）を見逃す。
  面そのものを実効果に合わせることが根本対策。既存の write-scope 単一ソース・quarantine 機構・
  halt 経路をそのまま流用でき、実装面積は小さい（commit-push.ts への局所拡張）。
- **Alternatives considered**:
  - *SDK permission（tool-level 遮断）*: provider 依存で managed runtime と挙動が割れる。commit
    境界は runtime 非依存の共通経路であり最小強制点（ADR-20260721 A1 と同結論）。却下。
  - *個別経路ごとの独立パッチ*: 検査面を統一しないため同型経路の再発リスクが残る。却下。

### D2: 違反自己 commit は push を止めるが巻き戻さない（fail-closed + 証跡保存）

HEAD が step 開始時から前進している（agent 自己 commit）場合、`headBeforeStep..HEAD` の net 変更
path を列挙し、その step の write-scope 規則で検査する。違反があれば **push せず**、該当 commit の
diff を quarantine して `WRITE_SCOPE_VIOLATION` halt する。違反が無ければ現行どおり push する。

- 検査規則は mode 別:
  - **scoped**: 宣言 writes + pipeline 管理 path 以外の変更 path は全て違反（D5 の
    `findScopedCommitViolations`）。scoped step は成果物が確定的なので、宣言外の自己 commit は
    boundary breach。
  - **guarded**: 保護正典 path への変更のみ違反（既存 `findWriteScopeViolations`）。implementer 等は
    source を広域に書くため、source 変更は違反にしない。
- 違反 commit は **local branch に残す**（自動 `git reset` しない）。
- **Rationale**: 目的は remote 到達の阻止。local commit は operator の調査に供する操作証跡であり、
  自動巻き戻しは証跡を破壊する（ADR-20260721 A2 / D2 と同結論）。push を止め halt するだけで、
  `commitFinalState` の checkpoint も違反を運ばない（Context の不変参照）ため remote は保護される。
- **列挙失敗は fail-closed**: `git diff --name-only` が git error（null）を返した場合、内容を検査
  できないため push せず halt する（guarded の status 失敗 → fail-closed と対称）。
- **Alternatives considered**:
  - *違反自己 commit を `git reset` で巻き戻す*: 証跡破壊。却下（request architect 判断）。
  - *内容を検査せず現行どおり push*: 経路 2 そのもの。却下。

### D3: scoped mode の commit を pathspec 付きにする（index 混入の遮断）

scoped mode の commit を `git commit -m <msg> -- <宣言 writes + pipeline 管理 path>` とし、
「staged 変更の有無」判定も同じ pathspec（`git diff --cached --quiet -- <同 path>`）で行う。
guarded mode は従来どおり index 全体（pathspec なし）を commit する。

- **Rationale**: `git commit -- <pathspec>` は列挙 path の **worktree 内容** を HEAD の上に載せて
  commit する partial-commit で、index に事前 stage された他エントリを記録しない。これにより事前
  stage された許可外 path が commit に混入しない。staged 判定も同 scope にすることで、許可外 path が
  「staged 変更あり」を偽って commit 経路を起動することも防ぐ。guarded は出力を事前列挙できないため
  index 全体 commit を維持する（挙動保存）。
- **空 pathspec の縁**: scoped で stagePaths が空（宣言も既存管理 path も無い）場合、index 全体へ
  fallback してはならない（それ自体が経路 1）。空 pathspec 時は「commit すべき宣言 path 無し」と
  みなし commit 経路をスキップして HEAD 前進検出のみ行う。
- **Alternatives considered**:
  - *commit 前に `git reset` で index を宣言 path のみへ絞る*: 事前 stage の他エントリを index から
    落とす副作用があり、agent が意図して stage した状態を破壊しうる。partial-commit の方が局所的。
    却下。
  - *staged 判定は現行の whole-index のまま、commit だけ pathspec*: 判定と commit の scope が食い違い、
    許可外 stage が commit 経路を起動する縁が残る。却下。

### D4: scoped 残余違反を halt にする（fail-closed 統一）

scoped mode の staging 後に保護正典 path の残余違反（`findWriteScopeViolations`）を検出した場合、
現行の「quarantine + 復元して **続行**」を「quarantine + 復元して **`WRITE_SCOPE_VIOLATION` halt**」に
変える（guarded と同じ fail-closed）。

- **Rationale**: 改変された正典を読んだ可能性のある step の結果を無言で採用すると、「復元後の文書を
  レビューした」偽の証跡構造を許す（request architect 判断）。halt は `deriveStepCompletion` より
  前に発生する（Context の不変参照）ため、結果採用を構造的に抑止する。復元は checkpoint への混入
  防止として機構的に必要なので維持し、その後に throw する。
- 残余検査規則は現行どおり保護正典 path（`findWriteScopeViolations`）を対象とする。scoped 自己
  commit（D2）が宣言外全 path を違反とするのとは対象が異なる: worktree 残余は scoped staging で
  commit から除外されるため任意 source の残余は無害で、問題は step が読んだ正典の改変に限られる。
- **Alternatives considered**:
  - *現行の「復元して続行」を維持*: 偽の証跡構造を許す。却下（request architect 判断）。
  - *残余検査も宣言外全 path を違反にする*: scoped step が生成した scratch ファイル等まで halt させ、
    偽陽性で正常経路を壊す。対象を保護正典に限る現行規則を維持。却下。

### D5: scoped 自己 commit 規則を write-scope 単一ソースに追加する

`write-scope.ts`（leaf module）に純関数
`findScopedCommitViolations(slug, changedPaths, declaredWritePaths, managedPaths): string[]`
を追加する（= changedPaths − declaredWritePaths − managedPaths）。guarded 自己 commit は既存
`findWriteScopeViolations` を再利用する。

- **Rationale**: write-scope 判定は単一ソースに集約する（ADR-20260721 D2 の原則）。`managedPaths` を
  引数注入することで `write-scope.ts` の leaf 制約（`src/util/paths.ts` のみ import）を保つ。
  `partitionRoundChanges` の offending と同型だが、round 用関数（toStage も計算）を sequential
  経路へ流用するより、write-scope 単一ソースに scoped commit 規則を明示する方が意図が明快で、
  `write-scope-invariants.test.ts` / `write-scope-rules-consistency.test.ts` の機械保証対象に載る。
- **Alternatives considered**:
  - *`partitionRoundChanges` を re-export して流用*: round 意味論（member 属性不能・round halt）を
    sequential へ持ち込み意図がぼやける。offending 計算は同型だが単一ソース明示を優先。却下。

### D6: quarantine を commit 差分レンジ対応に一般化する

`quarantineViolationEvidence` に任意の diff レンジ指定（`{ base, head }`）を受ける口を足す。指定時は
`git diff <base> <head> -- <path>`（commit された差分）を退避し、未指定時は現行どおり
`git diff HEAD -- <path>`（worktree 差分）を退避する。自己 commit 経路（D2）は
`{ base: headBeforeStep, head: HEAD }` を渡し、guarded/scoped の worktree 違反（D4 / 既存）は未指定で
現行挙動を保つ。

- **Rationale**: 自己 commit の違反内容は既に commit 済みで worktree に無いため、`git diff HEAD --`
  では空になる。request 要件 4「自己 commit の場合は該当 commit の diff」を満たすにはレンジ diff が
  必要。既存呼び出しは未指定で無改変。
- **Alternatives considered**:
  - *自己 commit 用に別 quarantine 関数を新設*: 退避先パス・untracked fallback・ディレクトリ生成の
    重複が生じる。既存関数のパラメタ拡張で足りる。却下。

### D7: 共有 tail への scope 文脈受け渡し

`commitAndPushTail` は scoped/guarded 共有だが、D2/D3 は mode 依存の情報（commit pathspec・宣言
path・管理 path・mode）を必要とする。`commitAndPush` で解決したこれらを scope 文脈として tail に渡し、
tail 内で (a) staged 判定と commit の pathspec 化（D3）、(b) 自己 commit 検査（D2）を行う。

- **Rationale**: mode 分岐は既に `commitAndPush` にあり、pathspec / 宣言 path はそこで解決済み。
  tail に文脈を渡すのが最小の構造変更で、staged 判定と commit を同 scope に保てる。
- **Alternatives considered**:
  - *HEAD 前進検出を `commitAndPush` 側へ引き上げる*: staged 判定（tail）と密結合しており分離すると
    重複が増える。文脈受け渡しの方が局所的。却下。

## Risks / Trade-offs

- [Risk] `git commit -- <pathspec>` の partial-commit は列挙 path の **worktree 内容** を記録する。
  scoped は commit 前に同 path を `git add -A -- <pathspec>` 済みなので index と worktree が一致し
  等価だが、両者が乖離する将来変更があると挙動が変わりうる。→ **Mitigation**: staged 判定・add・
  commit を全て同一 pathspec に固定し、real-git 統合テストで commit tree（`git show --name-only`）を
  直接検証する。
- [Risk] 違反自己 commit を local に残すため、halt 後に operator が手当てせず `resume` すると、次回の
  `headBeforeStep` が違反 commit の SHA になり再検出されず、以降の正常 commit に相乗りして remote へ
  到達しうる。→ **Mitigation**: 本変更のスコープは remote 到達の初回阻止。halt メッセージに退避先を
  明示し operator の調査・手動 reset を促す。自動巻き戻しは証跡破壊のため意図的に行わない（D2）。
  resume 経路の遡及是正はスコープ外（過去 commit の遡及監査に該当）。
- [Risk] mock spawn テストは `git diff --cached --quiet` と `git diff --name-only <base> <head>` が
  同じ subcommand `diff` を返すため、レスポンスが共有される。→ **Mitigation**: 自己 commit 経路は
  staged 無し（`--cached --quiet` は exit code のみ参照し 0）かつ range diff は stdout を参照するため、
  単一 `diff` レスポンス（exit 0 + stdout=変更 path 列）で両立する。staged あり（exit 1）と range diff
  の同時要求は発生しない（staged あり → commit 経路で自己 commit 検査へ到達しない）。統合テストで
  実 git により最終確証を取る。
- [Trade-off] scoped mode の commit・staged 判定に pathspec が付き、自己 commit 時に range diff の
  extra spawn が増える。境界強制のためのコストとして許容する。

## Open Questions

- なし（設計判断は request の architect 評価済み判断と本 design D1–D7 で確定）。

## Migration Plan

- コード変更は `src/core/step/write-scope.ts`（D5）と `src/core/step/commit-push.ts`（D2/D3/D4/D6/D7）
  に限定。`src/errors.ts` の `writeScopeViolationError` は既存のまま再利用（新規 error code なし）。
- 既存テストのうち **意図された挙動変更** に該当するもの（scoped 残余の続行 → halt）だけ期待を更新する:
  `commit-push-write-scope.test.ts` の TC-023 群と quarantine-03。その他の write-scope / pipeline
  テストは無改変で green を保つ。
- Rollback: D2/D3/D4 の各修正を個別に revert すると、対応する破壊確認テスト（無検査 push / index 混入 /
  復元続行）が fail することを記録する（受け入れ基準の破壊確認）。
