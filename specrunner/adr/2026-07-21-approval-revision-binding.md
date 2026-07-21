# ADR-20260721: 記録済み承認を revision に束縛し、stale 承認による reviewer 群 skip を封鎖する

## ステータス

採択

## コンテキスト

pipeline の routing は、state に記録された過去の承認 verdict を再利用して分岐する。代表が
`conformanceApprovedLatest`（`reverification.ts`）で、`verification passed → adr-gen / pr-create`
の transition guard として使われていた。判定は **最新 conformance run の `outcome.verdict === "approved"`
のみ** であり、その承認が「どの revision を評価したか」は照合されなかった。

このため、承認後に revision が動く経路（途中 step からの再走、resume、operator の手動 commit、
verification 失敗後の build-fixer）では、**古い承認が新しい実装に対して有効なまま routing を素通しし、
code-review・custom reviewer・regression-gate・conformance の再実行がスキップされる（fail-open）**。
実際の run でこの経路により reviewer 群が bypass された前例がある。

state には束縛に必要な部品が既に存在していた:

- `StepRun.commitOid?: string`（`state/schema/types.ts`）— sequential agent step が commit 後に打刻する
- reviewer status の `approvedAtCommit` — 宣言済みだが値の消費（revision 照合）が未実装

`src/core/archive/achieved-assurance.ts` は archive floor gate で同型の束縛を既に実装している
（spec-review 承認を `specReviewOid` に束縛し content hash で検証）。本変更はこの archive-time gate の
**routing-time 版**である。

## 決定

### D1 — 承認の有効性判定: state 記録済み commitOid の等値比較

承認の有効性は「承認 run の commitOid」と「直近 verification run の commitOid」の等値比較で判定する。
routing guard は `state.steps` を読むだけの純関数とし、git I/O を持たない（決定的・テスト容易）。

再走・resume・operator commit・build-fixer のいずれで revision が動いても、動いた revision で
verification が再走すればその commitOid が変わり、古い承認 commitOid と食い違うため検出できる。

**却下した代替案**:
- *guard 内で git diff / readFileAtCommit して照合*: routing guard が I/O を持つと決定性・テスト容易性が壊れる。却下。
- *endedAt 時刻比較の拡張のみ*: resume 跨ぎの operator commit・clock skew に盲目。却下。

### D2 — verification（CLI step）の commitOid は step.run() の **前**（entry HEAD）で打刻する

`runCliStep`（`executor.ts`）で `step.run()` を呼ぶ**前**に `captureHeadSha(cwd)` で HEAD を capture し、
success result に `commitOid` として載せる。`runtimeStrategy` 不在時は未設定（fail-safe）。

**entry HEAD を選ぶ根拠（load-bearing)**:
verification が certify する revision は step 開始時点の worktree tree（= entry HEAD）である。
`propagateVerificationResult` が step.run() 内で verification-result commit を作り HEAD を +1 進めるため、
**exit HEAD で打刻すると verification-result commit を掴んでしまい、conformance の打刻 HEAD と常に食い違う**。
再検証経路では `conformance approved → verification` の間に他 step は commit しないため、
**verification の entry HEAD == conformance が記録した commitOid** が成立し、変更が無ければ両者が一致する。

agent step の commitOid（exit HEAD）とは意味が異なるが、CLI step は finalizeStepArtifacts を通らず
commit が step.run() 内に閉じるため、「この step が評価した revision」を表すには entry HEAD が正しい。
この非対称は `schema/types.ts` の field doc に明記した。

**却下した代替案**:
- *exit HEAD で打刻*: verification-result commit を掴み正常経路が恒常的に壊れる。却下。
- *全 CLI step で entry HEAD を打刻する一般化*: 現状 verification の commitOid のみが消費される。一般化は blast radius が不明確なため verification に限定。却下。

### D3 — `conformanceApprovedLatest` を revision 照合込みの guard `conformanceApprovedForVerifiedRevision` に置換

guard は以下をすべて満たすとき true（いずれかを満たさなければ false、reviewer chain へ再入）:

1. 最新 conformance run が存在し `outcome.verdict === "approved"`
2. 最新 conformance run の `commitOid` が非空
3. 最新 verification run が存在し `commitOid` が非空
4. conformance.commitOid === verification.commitOid

STANDARD / FAST 両プロファイルの guard 参照（`types.ts`）が同じ関数を参照するため、両方に効く。
旧関数は `@deprecated` 付きで保持（既存テストの参照のため）。

### D4 — build-fixer が conformance 承認の後に走った場合は reviewer chain へ再入する（D3 の意図した帰結）

`conformance(approved) → verification(fail) → build-fixer → verification(pass)` の経路では、
build-fixer が commit で HEAD を動かすため、final verification の entry HEAD ≠ conformance.commitOid となり、
guard が false → code-review 再入となる。再承認後は `codeChangedSinceLastVerification` が false となり
conformance → adr-gen へ収束し、ループしない。

これは「承認後に revision が動けば承認は無効」という不変条件の直接の帰結であり、意図した挙動。
対照的に、code-fixer が conformance の**前**に走り conformance が最終 revision を承認済みの経路では
guard が true のまま adr-gen へ進む（現行維持）。

### D5 — custom reviewer: `selectPendingMembers` に基準 commitOid 照合を追加し、source-scoped 最適化を保存するため保留 member を re-anchor する

- `selectPendingMembers(statuses, members, baselineCommit?)` に 3 引数目を追加。
  approved member を pending から除外する条件を「`approvedAtCommit != null かつ approvedAtCommit === baselineCommit`」に強める。
  不一致・null は pending へ戻す（fail-closed）。`baselineCommit == null` のとき照合を無効化し現行挙動に退避する。
- **source-scoped invalidation の保存**: `computeInvalidations`（path-scoped、`2026-07-15-round-invalidation-source-scoped`）が
  member を invalidate しなかったとき、coordinator は `listChangedFiles` が success であることを positive evidence として
  その member の `approvedAtCommit` を `baselineCommit` へ **re-anchor** する。
  evidence が無い（managed / `listChangedFiles` unavailable）ときは re-anchor せず fail-closed に倒れる。
- `baselineCommit` は `captureHeadSha(cwd)` の raw 結果（null は照合無効）とする。managed runtime では null を返すため既存 fail-safe を保存。

**却下した代替案**:
- *re-anchor しない*: 無関係な source 変更で保留 member が全員再走し `2026-07-15` の source-scoped 最適化を実質無効化。却下。
- *null のみ pending、非 null は `computeInvalidations` に委任*: 「基準 commitOid **不一致**時に pending へ戻す」受け入れ基準を満たせない。却下。

### D6 — レガシー record（commitOid 欠落）は stale として再実行に倒す（fail-closed）

D3 の guard は conformance/verification の `commitOid` が欠落していれば false。
D5 の `selectPendingMembers` は `approvedAtCommit == null` を pending 扱いにする。
record は削除・書換しない（証跡は不変）。`achieved-assurance.ts` の missing-commitOid → absent と同じ方針。

## 検討した代替案

### A1: guard 内で git diff / readFileAtCommit して照合する

`achieved-assurance.ts` が archive-time に行っている blob content hash 比較と同型のアプローチを、routing guard 内で実行する案（`readFileAtCommit(conformanceOid, ...)` vs `readFileAtCommit(verificationOid, ...)`）。

- **Pros**: 「ファイル内容が同じか」を直接確認できる。commitOid が一致していなくても内容同一なら承認を再利用でき、偽陰性を減らせる可能性がある。`achieved-assurance.ts` の実装パターンを直接流用できる
- **Cons**: routing guard が git I/O（非同期・副作用）を持つと決定性が失われ、同一 state から異なる判定が生じうる。テストに git stub が必要になり、guard の単体テスト容易性が大きく低下する。guard は transition engine のホットパスで呼ばれるため I/O がボトルネックになりうる
- **Why not**: routing guard は state 純粋（git I/O 不可）でなければならない（architect 評価済み却下）。git の事実は StepRun 打刻時に取り込み、guard は state のみを見る構造を維持する。content hash 比較が必要な細粒度照合は将来の Non-Goal として明示されている

### A2: endedAt 時刻比較の拡張のみで対応する

既存の `codeChangedSinceLastVerification`（`reverification.ts:37-53`）が行う endedAt 時刻比較を拡張し、対象 step の種類や比較範囲を広げることで stale 承認を検出する案。

- **Pros**: 既存関数の拡張に留まり、commitOid 打刻の変更が不要。変更規模が小さい
- **Cons**: endedAt は同一プロセス内の step 順序しか信頼できない。resume 跨ぎの operator commit・clock skew・外部 commit には盲目。spec 系変更（spec/design が動く経路）も検出できない
- **Why not**: commitOid は revision の同一性を直接表す。時刻比較は「resume 跨ぎでの operator commit」という本 request が封鎖しようとする主要経路をカバーできない（architect 評価済み却下）。時刻比較は再検証発火の補助として現行のまま残す

### A3: stale 承認 record を削除して再承認を強制する

承認後に revision が動いた場合、該当の承認 record を state から削除または上書きし、次回 routing で承認なし状態から再スタートさせる案。

- **Pros**: guard ロジックが単純になる。過去の承認 record が routing に誤影響を与えることがなくなる
- **Cons**: 承認の証跡・監査ログが失われる。record の不変性は spec-runner の state モデルの前提（`achieved-assurance.ts` も missing-commitOid → absent 扱いで record を削除しない）
- **Why not**: 証跡は不変に保つ（architect 評価済み却下）。有効性判定は判定関数が担い、record 自体は履歴として残す。これは `achieved-assurance.ts` のパターンと一致する

### A4: verification の commitOid を exit HEAD（result commit 後）で打刻する

agent step と同じく step.run() の**後**に `captureHeadSha` を呼び、exit HEAD を commitOid として記録する案。agent step との非対称をなくし、commitOid の意味を「step 完了後の HEAD」に統一する。

- **Pros**: agent step（exit HEAD 打刻）との意味的な対称性が生まれる
- **Cons**: `propagateVerificationResult` は step.run() 内で verification-result を commit し HEAD を +1 進める。exit HEAD は常に conformance の打刻 HEAD（conformance が評価した revision）より +1 ずれ、変更がなくても conformance.commitOid ≠ verification.commitOid となる。正常な再検証経路（criterion 2）が恒常的に false になり、毎回 code-review を余分に 1 周させてしまう
- **Why not**: verification が「評価した revision」を表すには step.run() 前の entry HEAD が正しい（D2）。この非対称は `schema/types.ts` の field doc に明記して固定する

### A5: build-fixer を revision 照合の対象外にする

`conformance approved → verification(fail) → build-fixer → verification(pass)` の経路で、build-fixer が commit しても conformance 承認を有効のまま adr-gen へ直行させる案。

- **Pros**: build-fixer 回復後の余分な code-review + conformance 1 周を省ける。従来の挙動を維持する
- **Cons**: build-fixer は `src/` を編集できる（`IMPL_CODE_MUTATOR_STEPS` に含まれる code mutator）。「build fix のみで source logic は不変」の暗黙前提は保証できない。stale conformance 承認が build-fixer の変更を素通しして adr-gen へ直行する — これが封鎖対象の穴そのものである
- **Why not**: req 1（承認後に revision が動けば承認は無効）に直接反する。build-fixer 後の code-review + conformance は失敗回復経路（例外的）に限られ、maxIterations で有界なため再入コストは受け入れ可能（D4 採用）

### A6: re-anchor なしで source path 不一致 member を常に pending に戻す

custom reviewer の revision 照合（D5）を単純化し、`approvedAtCommit !== baselineCommit` の場合は常に pending に戻す。re-anchor ロジックを coordinator に追加しない案。

- **Pros**: re-anchor 条件（`listChangedFiles` success + `computeInvalidations` non-invalidate）の判定コードが不要でシンプル
- **Cons**: 無関係な source 変更（自分の activation path を触っていない fixer の commit）でも approved custom reviewer が全員再走する。`2026-07-15-round-invalidation-source-scoped` の source-scoped invalidation 最適化（path-scoped で影響なし member を skip）を実質無効化する
- **Why not**: req 7（承認後に revision が動いていない場合の skip 挙動を現行どおり維持）の精神に反し、既存最適化を暗黙に退行させる。re-anchor は coordinator ループの小さな追加で閉じ、`computeInvalidations` のロジック自体は変えない（責務分担を保つ）ため採用コストは限定的（D5 採用）

## 帰結

- **新しいパイプライン不変条件（機械化済み）**: 承認（conformance / code-review / custom reviewer / regression-gate の approved）は、それが評価した revision と現在の判定基準点 revision が一致する場合に限り routing の分岐（skip / 短絡）に再利用できる。不一致・判定不能は「承認なし」として再実行する。
- **routing guard の純粋性**: `conformanceApprovedForVerifiedRevision` は state only の純関数。将来の guard も git I/O を持ってはならない。
- **commitOid の非対称**: agent step の commitOid = exit HEAD（per-node commit 後）、CLI step（verification）の commitOid = entry HEAD（step.run() 前）。この非対称は `schema/types.ts` の field doc に明記され、将来の変更者はこの区別を保つ必要がある。
- **re-anchor 不変条件**: coordinator は path 未接触の approved member のみを re-anchor する。`computeInvalidations` のロジック自体は変えない。

## 影響を受けるモジュール

- `src/core/pipeline/reverification.ts` — guard 置換・旧関数 @deprecated
- `src/core/pipeline/types.ts` — STANDARD / FAST の when 参照更新
- `src/core/step/executor.ts` — `runCliStep` に entry-HEAD 打刻追加
- `src/core/pipeline/reviewer-status.ts` — `selectPendingMembers` 3 引数化
- `src/core/pipeline/parallel-review-round.ts` — coordinator ループに re-anchor 追加
- `src/state/schema/types.ts` — `commitOid` field doc 更新（CLI/agent 非対称の明記）

## 参考

- Change: `specrunner/changes/approval-revision-binding/`
- 関連 ADR: `2026-07-15-round-invalidation-source-scoped`（source-scoped invalidation の基盤）
- 先行実装: `src/core/archive/achieved-assurance.ts`（archive-time 版の同型パターン）
