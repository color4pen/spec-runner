# ADR-20260809: 中断 step の書きかけ canon を resume が provenance 判定で自動隔離する

**Date**: 2026-08-09
**Status**: accepted

Extends: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
Extends: [ADR-20260723-resume-worktree-reconciliation](2026-07-23-resume-worktree-reconciliation.md)

## Context

ADR-20260723（operator-canon-apply-on-resume）は resume 入口の dirty canon に対して二分岐を
確立した:

- `--apply-canon` 指定 → operator-apply commit として取り込む（帰属の明示）
- 未指定 → fail-closed 停止

このとき **A3 却下**（dirty canon を flag なしで自動 commit）の理由は「crash した step の agent
改変が operator 帰属として台帳に洗浄される（attribution laundering）」リスクだった。

しかし同じ fail-closed が、**pipeline が自分自身の中断によって生じた partial output** にも
適用されている。design のような canon producer step が signal / SIGKILL / hard-crash で停止すると、
書きかけの design.md / tasks.md / spec.md（untracked または tracked-modified）が worktree に残り、
次の resume が fail-closed で止まる。operator の選択肢は:

- `--apply-canon` — 書きかけ部分出力が `operator-apply: <slug>` commit として正典に入る
  （意味論的に誤り）
- 手動退避 / `git checkout HEAD -- <path>` — CLI 外の手作業

一方、同じ ADR-20260723（resume-worktree-reconciliation）は非 canon の中断残渣に対して
「evidence 退避 → 削除 → clean start」という自動復帰経路を確立した。canon path だけがこの
経路から除外されて手動対応に落ちている非対称が問題の本質。

### A3 却下との本質的差異

ADR-20260723 の A3 は「crash residue か operator 編集かを機械は区別できない」を却下根拠とした。
本変更は**その区別を state から機械的に行う判定（provenance 判定）**を導入することで、A3 を
一般的には却下したまま、「機械的裏づけが完全に揃った場合のみ」という保守的条件下での自動隔離を
安全に実現する。帰属の安全性は「agent が書いたものを operator commit として台帳に登録しない」
ことで守られる。自動隔離は削除（git checkout HEAD / git clean）であり、commit ではない。

### 中断の機械的痕跡

| 経路 | resumePoint.reason | stale-running 検出 | 完了 StepRun |
|------|--------------------|---------------------|--------------|
| signal（SIGINT/SIGTERM） | `signal` | — | 無し |
| timeout | `timeout` | — | 失敗 StepRun あり |
| SIGKILL / hard-crash | 無し（signal handler 非到達） | あり | 無し |
| escalation | `escalation` 等 | — | あり |
| operator 編集（前 step 正常完了後） | 前 halt の値 | — | 前 step 成功 StepRun あり |

signal / SIGKILL は完了 StepRun を残さない。escalation / 正常完了は残す。この非対称が
「書きかけ部分出力」を「operator の意図的編集」から機械的に切り分ける根拠になる。

## Decision

### D1: apply-canon gate を三分岐に拡張し provenance 判定を挿入する

apply-canon gate の dirty 分岐を三分岐に拡張する。順序は変えない:

1. `options.applyCanon === true` → operator-apply commit（現行、D5 優先）
2. `isInterruptedStepPartialCanon(...)` が true かつ `startStep === interruptedStep`
   → 自動隔離して続行（新規、D2/D3/D4）
3. else → fail-closed halt（現行）

**採用理由**: 「canon は排他的に apply-canon gate が扱う」という責務分担（ADR-20260723
resume-worktree-reconciliation D6 の gate ordering）を維持しつつ、三番目の経路を加える。
reconcile-worktree は隔離後の clean-canon worktree に対して現行どおり走る。

### D2: 部分出力判定（provenance 判定）を 4 条件 AND で定義する

step `S = state.step`（`begin()` で永続化される in-flight step）に対し、次を全て満たす場合のみ
「S の書きかけ部分出力」と判定する:

1. **再走対象の一致**: `startStep === S`。`--from` で別 step へ redirect した resume では発動しない。
2. **宣言一致**: dirty canon paths の全てが `S.writes() ∩ protectedCanonPaths(slug)` に含まれる。
   1 件でも宣言外の canon が混ざれば不成立。
3. **中断の裏づけ**: `staleRunningDetected === true`、または `resumePoint !== null` かつ
   `resumePoint.reason ∈ {"signal","timeout","failure","exhaustion"}`。
4. **完了 StepRun 不在**: `state.steps[S]` が空 / 不在。

条件 3 と 4 は独立した歯として二重化する（defense-in-depth）。escalation は 3・4 の双方で、
operator 編集（前 step 完了後）は 4 で、宣言外 canon 混在は 2 で fail-closed に落ちる。

**保守的な既知の天井（条件 4 の粒度）**: `state.steps[S]` 空判定は「design が N 回完了後の
N+1 回目で中断」された場合に `N > 0` となり fail-closed になる（safe side）。本 request の
対象（design の中断初回）は満たす。より精密にするなら begin 回数と完了 StepRun 数の差分追跡
が必要だが、それは別設計問題（`# ponytail: 完了回数カウントでなく StepRun 有無の近似、loop 内 canon producer で N+1 回目中断時は fail-closed`）。

**採用理由**: 機械的裏づけが完全に揃った場合のみ発動する保守性により、誤爆（operator 編集の
意図しない削除）リスクを最小化する。`writes()` を単一の真実源とすることで、step 定義の変更が
自動的に provenance 判定に反映される。

**却下案**:
- *条件 3 を「resumePoint が存在する」だけにする*: escalation も resumePoint を持つため誤爆する。
- *条件 4 を省く*: 冗長性を捨てると interruption 由来だが operator が別途 canon を編集した
  ケースを取りこぼす。

### D3: 隔離処理は reconcile-worktree の quarantine core を流用する

`reconcile-worktree.ts` の「git status → 対象 filter → evidence 全件退避 → kind 別削除」
ロジックを内部関数（`quarantineAndRemoveMatching`）として切り出し、対象述語 / pathspecs / prefix
をパラメータ化する。

- `reconcileWorktreeArtifacts` は述語 `isReconcilableArtifact` / pathspecs 無し / prefix `reconcile`
  で core を呼ぶ薄いラッパーになる。外部シグネチャ・戻り値型・git コマンド列は不変。
- `quarantinePartialCanon(slug, worktreePath, canonPaths, spawnFn)` は述語 `canonPaths.has(p)` /
  pathspecs = `canonPaths` / prefix `canon-quarantine` で core を呼ぶ。
- evidence-first / fail-closed 不変を単一 core に集約する: 退避書き込みが 1 件でも失敗したら
  throw し削除を実行しない。退避先は `.specrunner/local/<slug>/canon-quarantine-<timestamp>/`。

**採用理由**: 「証拠を全件退避してから削除、退避失敗は削除しない」という不変を 2 箇所で重複
実装すると片方だけ壊れる退行リスクが生じる。`reconcileWorktreeArtifacts` の既存テスト群（3 ファイル）
が無改変で green のまま = リファクタ正しさの機械的歯。

**却下案**:
- *canon 用に別実装を書き下ろす*: fail-closed / evidence-first 不変の重複は退行リスク源。

### D4: 隔離後は halt せず step を最初から再走させる

部分出力と判定し隔離成功後は throw せず gate を抜ける。worktree の canon は除去済みのため
adopt-commits gate → reconcile-worktree は clean-canon 状態で走り、pipeline は `startStep`（= S）
を最初から再走する。design の buildMessage は request.md からのフル再生成のため、部分出力を
捨てても情報損失なく再走できる。

**冪等性**: 隔離後の再 resume では `detectCanonDirtyPaths` が空を返し gate は clean 通過する。

隔離成功時は `logInfo` で「隔離した step 名 / 退避した path / 退避先 quarantineDir」を明示する。
`quarantinePartialCanon` が throw した場合は `PrepareError(1)` で fail-closed halt する。

### D5: `--apply-canon` 明示は自動隔離より優先する

`options.applyCanon === true` のときは現行どおり `commitOperatorCanon`（operator-apply commit +
ledger 追記）を行い、自動隔離は発動しない。operator の明示指定の意味論を変更しない。

**採用理由**: 「operator の明示指定は現行意味論を維持し、自動隔離は未指定 + 機械的裏づけ完全一致の
場合に限る」（architect 採用事項）。

## Alternatives Considered

### A1: reconcile-worktree の rule 2（canon 除外）を無条件に撤廃する

reconcile の対象述語から `protectedCanonPaths` の除外を外し、canon を含む全 change folder
path を reconcile 対象にする案。

- **Pros**: apply-canon gate を変更せずに canon の自動削除が得られる。
- **Cons**: operator が意図的に canon を編集して resume した場合も黙って削除対象になる。
  ADR-20260723（operator-canon-apply-on-resume）が確立した「operator の明示宣言のみが
  取り込みを成立させる」原則を壊す。reconcile は commit を伴わないため，operator 作業が
  証拠保全されても git 歴史から失われる。
- **Why not**: operator 意図の保護は維持する。provenance 判定（D2）を apply-canon gate に
  置くことで「canon は排他的に apply-canon gate が処理する」責務境界を保ったまま自動復帰を実現できる。

### A2: 部分出力を再利用する（中断地点からの続き書き）

design の部分出力を入力として、中断地点から続きを書かせる案。

- **Pros**: 長い処理が途中まで済んでいれば省力化できる。
- **Cons**: canon producer step（design）は request.md からのフル再生成が契約であり、
  `buildMessage` は部分出力を入力として読まない経路が存在しない。途中成果の引き継ぎを
  安全に実現するには別の設計問題として扱う必要がある。
- **Why not**: 本変更のスコープ外。再利用のための設計を新設せず、最小の変更（全破棄 + 再走）で
  要件を満たす。

### A3: `--apply-canon` の既定動作を「flag なし時に provenance 判定 → 自動 commit」に変更する

flag なし resume で中断裏づきの dirty canon を検出した場合に operator-apply commit を自動生成する案。

- **Pros**: operator に flag を要求しない。
- **Cons**: 自動 commit は agent の partial output を `operator-apply: <slug>` という operator
  署名で台帳に登録する。ADR-20260723（operator-canon-apply-on-resume）D1 が「帰属 laundering」
  として明示的に却下した構造と等価。
- **Why not**: 自動隔離は commit ではなく削除（evidence 保全 + worktree からの除去）である。
  台帳に登録しないため attribution laundering は発生しない。commit 不要の削除と commit を混同しない。

### A4: timeout 経路も自動隔離の対象にする

条件 3 で `reason="timeout"` を含めることで timeout による中断も自動隔離する案。

- **Pros**: 対象範囲が広がる。
- **Cons**: timeout 中断は失敗 StepRun を残すことがある（step が timeout エラーを正常 commit した
  場合）。条件 4（完了 StepRun 不在）が安全装置として機能するが、timeout 経路の保守的 fail-closed
  は受け入れ基準の要件（signal / stale）に含まれず、テスト設計も薄い。
- **Why not**: `reason="timeout"` を INTERRUPTION_REASONS に含めることで条件 3 は成立し得る。
  ただし受け入れ基準の主対象は signal と stale であり、timeout の保守的 fail-closed は許容する。

## Consequences

### Positive

- pipeline の signal / SIGKILL / crash 経路での中断後、operator が手動介入なしに resume → 自動隔離
  → step 再走という自律回復が機能する。
- 誤爆（operator 編集を意図せず削除）は 4 条件 AND 完全一致のみで発動するため、機械的裏づけが
  部分的にしか揃わないケース（operator 編集・escalation・前 step 完了後・`--from` redirect）は
  従来どおり fail-closed で保護される。
- evidence が `.specrunner/local/<slug>/canon-quarantine-<timestamp>/` に保全されるため、
  削除後も内容が復元可能（失われない）。
- ADR-20260723 が確立した gate 責務境界（「canon は apply-canon gate が排他的に処理する」）と
  attribution laundering 防止が維持される。
- `reconcileWorktreeArtifacts` の外部シグネチャが不変のため、既存の reconcile テスト群は
  無改変で green のまま（リファクタ正しさの機械的歯）。

### Negative

- 条件 4 の粒度（StepRun 有無の近似）により、loop 内 canon producer が N 回完了後の N+1 回目で
  中断された場合は fail-closed になる（safe side）。
- timeout 中断は受け入れ基準の主対象外で、timeout 経路の自動隔離は条件 4 で制限されることがある。

### Known Debt

- 条件 4 の粒度（begin 回数 vs 完了 StepRun 数の差分追跡）は loop 内 canon producer で中断が
  繰り返された場合に fail-closed の過剰適用が生じる。より精密な実装は別 request。
- `minimalDeps` の `as StepDeps` キャストは `writes()` が `deps.slug` / `deps.request.type` のみを
  参照する間は無害だが、将来 `writes()` が追加フィールドを参照するようになった場合は
  `minimalDeps` の構築を同期する必要がある（`canon-provenance.ts` の note に明記済み）。

## References

- Request: `specrunner/changes/resume-partial-canon-quarantine/request.md`
- Design: `specrunner/changes/resume-partial-canon-quarantine/design.md`
- Spec: `specrunner/changes/resume-partial-canon-quarantine/spec.md`
- Implementation: `src/core/resume/canon-provenance.ts` / `src/core/resume/apply-canon.ts` /
  `src/core/resume/reconcile-worktree.ts` / `src/core/command/resume.ts`
- Related: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
  — apply-canon gate の二分岐（本 ADR が三分岐に拡張）・attribution laundering 却下の根拠
- Related: [ADR-20260723-resume-worktree-reconciliation](2026-07-23-resume-worktree-reconciliation.md)
  — reconcile の quarantine core（本 ADR が canon 隔離で流用）・gate 後の配置順序
- Related: [ADR-20260722-pipeline-sole-committer](2026-07-22-pipeline-sole-committer.md)
  — `synthesizedCommits` 台帳の意味論（本 ADR の自動隔離が commit を生成しないことで維持）
