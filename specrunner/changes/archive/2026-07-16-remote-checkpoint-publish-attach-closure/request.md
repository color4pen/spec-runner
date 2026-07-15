# remote checkpoint publish/attach correctness closure

## Meta

- **type**: spec-change
- **slug**: remote-checkpoint-publish-attach-closure
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260715（architecture/adr/2026-07-15-remote-checkpoint-reattachment-boundary.md）で ratify 済み。本 request はその behavior を正しく閉じる実装であり新規 architecture ADR を要さない。 -->

## 背景

`job attach`（#836）で remote checkpoint の**受信側（consumer）**は実装されたが、次の不変が実装上まだ閉じていない:

> remote checkpoint を単一の immutable commit として publish し、その同じ commit を検証・materialize して安全に再束縛する。

この 1 つの不変が閉じていないことから、4 つの症状が出ている。producer / predicate / OID / reattachment は同じ ADR・同じ Git 境界・同じ E2E で閉じるため、1 request に集約する。

- **publisher が無い**: 制御された `awaiting-resume` 出口で checkpoint を origin へ publish していない。attach は consumer だけ存在する。
- **materialize が既存 branch を破壊しうる**: 衝突時に既存 local branch を強制削除する（データ損失）。
- **同一 HEAD が固定されていない**: symbolic ref を読み直すため、検証した commit と materialize する commit が食い違いうる。
- **checkpoint 述語が ADR より弱い**: journal 欠落・切り詰め・resume 必須入力欠落を通す。

## 現状コードの前提

- **publisher 不在**: `src/core/pipeline/pipeline.ts` は正常完了(`end`)で `persist` → `commitFinalState`（commit+push、`370` 行）だが、escalation は `persist` のみ（`388` 行）、exhaustion も `persist` のみ（`648` 行）。`src/core/step/commit-orchestrator.ts` の `commitHalt`（`377` 行）は `awaiting-resume` を `transitionJob` + `appendInterruption` + `persist` + rethrow で、commit/push が無い。publish primitive は `src/core/step/commit-push.ts` の `commitFinalState`（`src/core/runtime/local.ts:662` 経由）。
- **branch 強制削除**: `src/core/worktree/manager.ts:113-114` は `git worktree add` 失敗時、`branchName` があれば無条件に `git branch -D <branchName>`。new-run は branchName が `<slug>-<jobId8>` で一意なので自己作成 branch の掃除だが、attach は既存 feature branch 名を渡すため既存 local branch を削除しうる。
- **symbolic ref の読み直し**: `src/core/attach/orchestrator.ts:58` は `origin/<branch>` を組み立て、`src/git/checkpoint-ref.ts` の複数 git コマンド（`ls-tree` / `cat-file` / `show`）でそのつど解決する。`src/cli/attach.ts:135` の materialize も `origin/<branch>` を再評価する。commit OID を固定していない。
- **弱い述語**: `src/core/attach/verify-checkpoint.ts` は events.jsonl 欠落を許容（`src/git/checkpoint-ref.ts:164-171` が非存在を空文字にする）、journal corruption は見るが counter reversal は見ない、必須成果物は `request.md` のみ検査（`118-125` 行）。
- **`reads()` 契約は実在**: 各 step は `reads(state, deps): IoRef[]` で必須入力を宣言し、`src/core/step/executor.ts:213-227` が存在検査する。

## 要件

### 1. Materialization safety（P0・データ損失）
- attach 前から存在した local branch を削除しない。`git worktree add` 失敗時の cleanup は、**この呼び出しが作成したと証明できる branch のみ**を対象にする（呼び出し前に branch が存在したかを確認し、既存なら削除しない）。
- new-run の自己作成 branch cleanup は挙動を変えない。

### 2. Immutable checkpoint identity（P1）
- fetch 直後に checkpoint の commit OID を**一度だけ**解決する。read・verify・materialize はすべてその OID を貫く（symbolic `origin/<branch>` を再評価しない）。
- `VerifiedCheckpoint` に `checkpointOid` を持たせ、materialize はその OID を checkout する。

### 3. Checkpoint predicate closure（P1）
- attach 対象は `awaiting-resume` のみ（既存の quiescent 表現を「現在は `awaiting-resume` のみ」に統一）。
- version 2 の remote checkpoint では `events.jsonl` を必須化する。
- journal の corruption に加え `_journal` counter reversal（`detectCounterReversal` 相当）を検査する。
- 解決した resume step の `reads()` が返す必須入力（tree 内に在るべき成果物）が checkpoint tree に存在することを検査する。いずれの不成立も typed error で拒否し、ローカル状態を一切作らない。

### 4. Quiescent checkpoint publisher（P0・当初目的の完成）
- 制御された `awaiting-resume` 出口（escalation / exhaustion / guard halt）で、local persist の後に checkpoint を単一 commit として origin へ commit+push する。state・events・resume に要る成果物が同一 commit（同一 HEAD）に揃った self-consistent な checkpoint にする。
- publish は既存の single-writer 所有権（B-13 / B-14）を尊重し、**単一の seam が所有する**（複数箇所へ commit/push を散らさない）。`commitFinalState` の publish 経路を再利用する。
- commit/push 失敗でも local resume 可能性を壊さない（local persist は先に完了しており、remote-resumable 未成立として扱う。ADR-20260715 D1 の「push 前は locally resumable、ref 更新後のみ remotely resumable」）。
- ADR-20260715 の Positive 文言 divergence（「cross-env resume が閉じる」を publisher 完成まで未了と是正）を同時に直す。
- コードコメントの `ADR-20260715 D7`（存在しない）を behavior 設計側の D7 参照へ修正する。

## スコープ外

- `running` job の別マシン takeover / lease / epoch（ADR-20260715 D4 で別 ADR に分離済み）。
- `origin/*` の暗黙走査による job 発見（branch は明示指定）。
- attach 後の自動 resume（別動詞のまま）。
- managed runtime の attach（local runtime のみ）。

## 受け入れ基準

- [ ] **【主役 E2E】** 実際の pipeline がマシンA相当で `awaiting-resume` へ遷移し、自己整合な checkpoint を origin へ publish し、マシンB相当が**同じ commit OID** を検証・materialize して既存 resume（`job resume`）を開始できることを統合テストで固定する。
- [ ] attach 前から存在した local branch（未 push commit を持つ）が attach 失敗後も削除されずに残ることをテストで固定する。new-run の自己作成 branch cleanup のテストは無変更で green。
- [ ] fetch 後に解決した commit OID が read・verify・materialize を貫くことをテストで固定する（`origin/<branch>` が途中で別 commit へ動いても、検証した OID を materialize する）。
- [ ] version 2 checkpoint で `events.jsonl` 欠落 → 拒否、counter reversal → 拒否、resume step の `reads()` 必須入力欠落 → 拒否を、それぞれローカル状態を作らずに typed error で固定する。
- [ ] 制御された `awaiting-resume` 出口で checkpoint が commit+push され、push 失敗時も local resume 可能であることをテストで固定する。
- [ ] 既存の attach / commit / worktree の挙動保存テストが無変更で green。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

正典は ADR-20260715（本 request はその behavior を閉じる実装）。

- **remote checkpoint は単一 immutable commit（D1）**: publish はこの単一 commit を作り、attach はその同一 OID を検証・materialize する。commit の原子性（tree 全体が 1 commit に揃う）と ref 更新の原子性（origin の ref が進むか否か）は別物として言い分ける。
- **publisher は single-writer 所有（B-13 / B-14 / execution-ownership ADR）**: awaiting-resume 出口の commit/push を単一 seam に集約し、複数箇所に散らさない。→ 却下: 各 awaiting-resume 経路で個別に commit/push する案（所有権が分散し二重書き込みを招く）。
- **materialize は既存 branch を破壊しない**: → 却下: 衝突時に無条件 `branch -D` する現行案（既存 local branch のデータ損失）。作成を証明できる branch のみ cleanup する。
- **予測不能な ref を握らない**: → 却下: symbolic `origin/<branch>` を read/verify/materialize で読み直す現行案（TOCTOU で別 commit を掴む）。fetch 直後に OID を固定する。
- **述語は D2 を満たす**: v2 は events.jsonl 必須・counter reversal 検査・resume step の `reads()` 由来の必須入力を検査。→ 却下: request.md のみ検査する現行案（journal 欠落・resume 必須入力欠落を通す）。
