# canon escalation の operator 適用を resume が第一級で受け付ける — 編集の破棄と手順欠落を解消する

## Meta

- **type**: bug-fix
- **slug**: operator-canon-apply-on-resume
- **base-branch**: main
- **adr**: true

## 背景

CANON_FINDING_ESCALATION の hint は「保護正典を手動修正して job resume」と案内するが、その通りに(commit せず)編集して resume すると、再開 step の write-scope 残余検査が operator 編集を step の境界外書込と誤帰属し、**退避 + 復元(= operator 編集の破棄)+ halt** する(外部 repo mado-os で実発現)。commit のみして resume すると未 push commit が egress 照合で EGRESS_UNKNOWN_COMMIT になる。現在動作する経路は「編集 → commit → **手 push** → resume」だが、この必須手順はどこにも案内されておらず、hint は誤った手順を明示している。

つまり operator 適用フロー(canon escalation)と write-scope 機械強制・egress backstop(#883/#893)が衝突しており、案内どおりの操作が機械的に失敗する。resume を operator 適用の正規入口として設計し直す。

## 現状コードの前提

- `src/core/step/commit-orchestrator.ts:369` 付近 — CANON_FINDING_ESCALATION の hint が「手動で修正し、job resume で再開」と案内する(commit / push に言及なし)
- `src/core/step/commit-push.ts` — scoped 残余検査は worktree の保護正典変更を検出すると退避(quarantine)+ 復元 + WRITE_SCOPE_VIOLATION halt する。**step 開始前から存在した変更と step 自身の書込を区別しない**
- `src/core/step/commit-push.ts` — egress 照合は publish 範囲(`rev-list HEAD --not --remotes=origin`)の全 commit が synthesizedCommits に含まれることを要求する。operator の手 commit は「operator 自身が手 push する」運用前提(#893 design D4)で、push 済みなら照合外になる
- `src/core/command/resume.ts` — resume 入口に worktree の dirty 検査・operator 変更の取り込み機構は存在しない
- `src/state/schema/operations.ts` — `appendSynthesizedCommit(state, oid)`(pure・冪等)が存在する
- 実発現: 外部 repo mado-os(0.4.3 相当)。operator 編集は `.specrunner/local/<slug>/write-scope-violation-*.md` に退避され、内容自体は復元可能だった

## 要件

### R1: resume の明示的な operator 適用モード

`job resume <slug> --apply-canon` を追加する。指定時、resume 入口で:

1. worktree の変更のうち**保護正典パスに限って**列挙し、diff の要約を表示する
2. それらを pipeline 合成の operator 適用 commit(例: `operator-apply: <slug>`、明示 pathspec)として commit し、OID を `appendSynthesizedCommit` で台帳に記録・永続化する(egress を通る)
3. その後に step を再開する(worktree の当該パスは clean になっているため write-scope 残余検査と衝突しない)

保護正典パス**以外**の dirty 変更は取り込まず、従来の規則(scoped 残余検査等)に委ねる。

### R2: flag なし resume の fail-closed 案内

`--apply-canon` なしの resume で保護正典パスに dirty 変更が存在する場合、**step を開始せず**停止し、「--apply-canon で operator 適用として取り込むか、変更を破棄してから resume する」旨を案内する。無言の破棄(現行挙動)を廃止する。

### R3: hint / escalation 文言の訂正

CANON_FINDING_ESCALATION の hint と canon escalation reason の案内を「保護正典を修正 → `job resume <slug> --apply-canon`」に更新する(commit / push の手動手順を operator に要求しない)。

### R4: 帰属の健全性

自動取り込みは行わない(explicit flag のみ)。resume 入口の canon dirty は operator 適用とは限らず、crash した step の agent 改変が復元前に残った可能性もあるため、**operator が flag で明示的に引き受けた場合のみ**台帳に載せる。operator 適用 commit の message には由来(operator-apply)を明示する。

## スコープ外

- write-scope 機械強制・egress backstop の意味論変更(いずれも正しく機能した)
- 保護正典以外への operator 編集の取り込み(従来どおり operator の手 commit + 手 push)
- managed runtime の同フロー(reload 検証と同じ別 request 系列)

## 受け入れ基準

- [ ] 統合テスト(実 store + 実 git): canon escalation → 保護正典を手動修正 → `resume --apply-canon` → operator 適用 commit が台帳に記録され、判定 step が修正済み正典で再評価され、修正が push 系列の commit に含まれることを固定する(mado-os 実発現の封鎖)
- [ ] `--apply-canon` の取り込み対象が保護正典パスのみであることをテストで固定する(canon 外の dirty は worktree に残る)
- [ ] flag なし resume + 保護正典 dirty → step を開始せず案内付きで停止することをテストで固定する(無言破棄の廃止)
- [ ] operator 適用 commit の OID が state.synthesizedCommits に永続化され、egress 照合を通ることをテストで固定する
- [ ] hint / escalation reason の文言が新手順を案内することをテストで固定する
- [ ] 修正前の挙動(resume 後検査による復元・破棄)に戻すと封鎖テストが fail することを破壊確認として記録する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: explicit flag(--apply-canon)方式**。resume 入口の canon dirty を無条件に operator 帰属で自動 commit すると、crash 経路で残った agent 改変を台帳へ洗浄する窓になる。帰属は operator の明示宣言によってのみ成立させる(#893 の「台帳 = pipeline が構成した commit」の意味論を保つ)。
- **採用: flag なし時は fail-closed 停止**。現行の無言破棄は operator の作業を黙って失わせる最悪の形。破棄するにも取り込むにも operator の明示選択を要求する。
- **却下: hint の文言修正のみ(手動 commit + 手 push の案内)** — 動作はするが、外部利用者に git 内部運用を要求する tribal knowledge の文書化に過ぎず、誤操作(push 忘れ → egress halt)の余地が残る。
- **却下: write-scope 検査側での「step 開始前 dirty」の自動識別** — 開始前 snapshot との差分帰属は crash / kill 経路で snapshot 自体の信頼性が崩れ、agent 改変の誤免罪を生む。取り込みは resume 入口の明示操作に一本化する。
