# archive --with-merge が merge 直後に main の整合性検証を実行する

## Meta

- **type**: new-feature
- **slug**: post-merge-integrity-check
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

squash merge の結果、main の lockfile 等が壊れることがある。PR 単体の verification は green でも、base との合流結果（merge 後の main の内容）はどのゲートも検証していない。壊れた main は以後の全 job の workspace setup（frozen install）を止め、原因の merge を特定するまで運用全体が停滞する。

実害の本質は「検知が遅く、原因の merge への帰属が難しい」ことにある。そこで merge を実行した直後・同じ archive 実行の中で main の整合性を機械検証し、失敗を escalation として即時に帰属・可視化する。

## 現状コードの前提

- `src/core/archive/merge-then-archive.ts:478` で squash merge を実行する（`mergePullRequest`）。merge 成功後は `runPostMergeCleanup`（`src/core/archive/post-merge-cleanup.ts`、呼び出しは `merge-then-archive.ts:189` / `:317` 等）が main の後片付け（pull 等）を行う。
- `src/config/schema.ts:115` `ShellCommand`（repo 供給 shell command の共通形。`verification.commands` / `workspace.setup` で既用）。
- archive 経路には escalation（recommendedAction / resumeCommand 付きの人間ハンドオフ報告)の既存パターンがある（例: `src/core/finish/archive-change-folder.ts:58-59`）。

## 要件

1. **config**: repo config に post-merge 整合性検証コマンド（`ShellCommand` 形、例: `bun install --frozen-lockfile`）を宣言可能にする。
2. **実行**: `job archive --with-merge` は merge 成功後、merge 結果を反映した main 上で当該コマンドを実行する。exit 0 なら従来どおり完了する。
3. **失敗時は escalation**: 非 0 なら escalation として報告する。内容には (a) この merge により main の整合性検証が失敗した事実（PR 番号 / merge SHA での帰属）、(b) 失敗コマンドの出力、(c) 対処の提示（例: lockfile を再生成して main へ修正を push する）を含める。**merge 済みのため rollback は行わない**。merge が完了した事実は偽らずに報告する（merged は merged）。
4. **未宣言なら不変**: config 未宣言の場合、挙動は一切変わらない。
5. **停止機構は設けない**: 後続 job / inbox 発火を自動停止する機構は追加しない（escalation による可視化のみ）。

## スコープ外

- merge の自動 rollback / revert（不可逆操作の自動化はしない）。
- squash merge 自体の lockfile 再生成・修復。
- pre-merge の prospective merge tree 検証（merge 結果 tree の事前 materialize + install はコスト・複雑度が高い。実害は検知の遅さにあるため、まず post-merge 即時検証で消す。必要になれば別 request）。
- main の恒常監視・定期ヘルスチェック。
- `--with-merge` を使わない手動 merge 経路。

## 受け入れ基準

- [ ] コマンド宣言済み + 検証失敗のとき、escalation が出力され、帰属（PR / merge）・失敗出力・対処が含まれることをテストで固定する。
- [ ] コマンド宣言済み + 検証成功のとき、従来どおり archive / cleanup が完走することをテストで固定する。
- [ ] config 未宣言のとき挙動が不変であること（既存テスト無変更 green）。
- [ ] 検証失敗時も merge 完了の事実が正しく報告される（merged を merged でないと偽らない）ことをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- 検知点を merge 直後（同一 archive 実行内）に置き、壊した merge への帰属を機械化する。下流 job の失敗による事後検知（帰属が難しく全 job が停まる）を置き換える。
- 既存の `ShellCommand` config + escalation パターンの踏襲のみで実現し、製品面に新しい概念を増やさない。
- rollback しない。merge は不可逆であり、自動 revert はより大きい事故の種になる。人間の判断（escalation → 修正 push）に渡す。

**却下**

- pre-merge の prospective merge tree 検証: `git merge-tree` の materialize + install 実行はコスト・複雑度が高く、得られる差分は「壊れた main の存在時間の短縮」のみ。実害（検知の遅さ・帰属不能）は post-merge 即時検証で消える。
- 後続 job / inbox の自動停止: 機構が大掛かりで、escalation 対応までの時間窓に見合わない。
- 恒常的な main 監視: 検知点を merge 時に置けば十分で、常駐的な仕組みは設計思想（短命プロセス）に反する。
