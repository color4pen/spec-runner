# 記録済み承認を revision に束縛し、stale 承認による reviewer 群 skip を封鎖する

## Meta

- **type**: spec-change
- **slug**: approval-revision-binding
- **base-branch**: main
- **adr**: true

## 背景

pipeline の routing は、state に記録された過去の承認 verdict を再利用して分岐する。代表例が `conformanceApprovedLatest`（verification passed → adr-gen / pr-create の when guard）で、**最新 conformance run の verdict が approved か**だけを見る。承認が「どの revision を評価したか」は照合されない。

このため、承認後に code / spec / design が変わる経路（途中 step からの再走、resume、operator の手動 commit）では、**古い承認が新しい実装に対して有効なまま routing を素通しし、code-review・custom reviewer・regression-gate・conformance の再実行がスキップされる**。実際の run でこの経路により reviewer 群が bypass された前例がある（再走後、verification passed から直接 adr-gen / pr-create へ進んだ）。

state には束縛に必要な部品が既に存在する: StepRun は `commitOid`（step の commit 後 HEAD）を持ち、reviewer status には `approvedAtCommit` フィールドが**宣言だけされて常に null** で放置されている。本変更はこれらを実用化し、「承認はそれが評価した revision に対してのみ有効」という不変条件を機械化する。

## 現状コードの前提

- `src/core/pipeline/reverification.ts:67-72` — `conformanceApprovedLatest(state)` は最新 conformance run の `outcome.verdict === "approved"` のみを判定する。revision の照合はない
- `src/core/pipeline/types.ts:250` および `:307` — `{ step: VERIFICATION, on: "passed", to: ADR_GEN / PR_CREATE, when: conformanceApprovedLatest }` の transition guard として使用されている
- `src/core/pipeline/reverification.ts:37-53` — `codeChangedSinceLastVerification` は endedAt の時刻比較のみ（IMPL_CODE_MUTATOR_STEPS = implementer / build-fixer / code-fixer）。resume を跨いだ operator commit や spec 系変更は検出できない
- `src/state/schema/types.ts:199` — StepRun に `commitOid?: string` が存在する
- `src/core/step/executor.ts:464-468` — commitOid の capture は **sequential な agent step のみ**（`!deps.roundOwnsGitEffects && deps.runtimeStrategy` の条件で captureHeadSha）。CLI step（verification / pr-create）の StepRun には commitOid が打刻されない
- `src/core/pipeline/reviewer-status.ts:57` — reviewer status 初期化で `approvedAtCommit: null` が宣言されているが、値を設定する箇所が存在しない（休眠フィールド）
- `src/core/pipeline/reviewer-status.ts:70-77` — `selectPendingMembers` は approved / skipped の member を resume 時に除外する（revision 照合なし）

## 要件

1. **不変条件**: 記録済み承認（conformance / code-review / custom reviewer / regression-gate の approved）は、**その承認が評価した revision と現在評価対象の revision が一致する場合に限り** routing の分岐（skip / 短絡）に再利用してよい。不一致・判定不能は「承認なし」として扱い、該当 step を再実行する（fail-closed）。
2. **判定の state 純粋性**: 承認の有効性判定は routing guard から呼ばれるため、state のみから決定できること（git 実行を guard 内で行わない）。照合は StepRun / reviewer status に記録済みの commitOid 同士の比較で行う。
3. **commitOid 打刻の完全化**: CLI step（少なくとも verification）の StepRun にも commitOid を打刻する。承認の有効性は「承認 run の commitOid」と「現在の判定基準点（直近 verification run の commitOid）」の比較で判定できるようにする。
4. **conformance guard の置換**: `conformanceApprovedLatest` を revision 照合込みの判定に置換する。最新 conformance が approved でも、その commitOid が直近 verification の commitOid と一致しない場合は guard を false にし、reviewer chain（code-review 以降）へ再入する。
5. **custom reviewer の束縛**: 承認時に `approvedAtCommit` へ実値を設定し、`selectPendingMembers` の resume skip 判定に revision 照合を加える。approvedAtCommit が現在の基準 commitOid と一致しない approved member は pending に戻す。
6. **レガシー record は stale 扱い**: commitOid を持たない過去の承認 record は「判定不能 = 承認なし」として再実行に倒す（fail-open にしない）。
7. **正常経路の保存**: 承認後に revision が動いていない場合（真の re-verification 文脈・変更なし resume）の skip 挙動は現行どおり維持する。

## スコープ外

- reopen コマンド・awaiting-archive からの復帰（後続 request。本変更は「再走が起きたときの承認再利用」の封鎖のみ）
- lineage の input hash を用いた成果物単位の細粒度照合（commitOid 一致で十分。細粒度化は将来）
- 承認 record 自体の削除・書き換え（record は不変。有効性判定のみ追加）
- verification 内部の検証内容の変更

## 受け入れ基準

- [ ] **再走事故の再現封鎖テスト**: conformance approved（commitOid = C1）を持つ state に対し、その後 implementer 相当の run（commitOid = C2 ≠ C1）と verification passed（commitOid = C2）を積んだとき、transition が adr-gen / pr-create へ**行かず** code-review へ入ることをテストで固定する
- [ ] 承認後に revision が動いていない場合（conformance approved と直近 verification の commitOid が一致）は現行どおり adr-gen / pr-create へ進むことをテストで固定する
- [ ] commitOid 欠落（レガシー承認）は stale 扱いで reviewer chain へ再入することをテストで固定する
- [ ] verification の StepRun に commitOid が打刻されることをテストで固定する
- [ ] custom reviewer: approved member の approvedAtCommit が実値を持ち、基準 commitOid 不一致時に selectPendingMembers が pending に戻すことをテストで固定する
- [ ] 現行の「最新 verdict のみで skip する」挙動を期待値として固定している既存テストは、本変更の意図（revision 照合）に追随して期待を更新する（対象テストを design で列挙すること）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: state 記録済み commitOid 同士の比較**。routing guard の純粋性（git 非依存・決定的）を保ちながら、再走・resume・operator commit のいずれで revision が動いても検出できる。時刻比較（endedAt）は resume 跨ぎ・手動 commit を検出できないため補助に留める。
- **採用: 基準点は直近 verification run の commitOid**。verification は「この revision のコードが green」という事実の打刻点であり、承認と実装の同期を判定する自然な比較対象。
- **却下: guard 内で git diff を実行して照合** — routing guard が I/O を持つと決定性・テスト容易性が壊れる。git の事実は StepRun 打刻時に取り込み、guard は state のみを見る。
- **却下: 時刻（endedAt）比較の拡張のみで対応** — 同一プロセス内の順序しか信頼できず、resume 跨ぎの operator commit・clock skew に盲目。commitOid は revision の同一性を直接表す。
- **却下: stale 承認の record 削除** — 証跡は不変に保つ。有効性は判定関数が担い、record は履歴として残す。
