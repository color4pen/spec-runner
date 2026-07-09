# pipeline 運用の小粒不具合 3 件の一括修正（fixer prompt / exit-guard / worktree cwd の view コマンド）

## Meta

- **type**: bug-fix
- **slug**: pipeline-smalls-bundle
- **base-branch**: main
- **adr**: false

## 背景

運用で観測した独立な小粒不具合 3 件を一括修正する。いずれも数行〜数十行規模で相互独立なため束ねる。

1. **build-fixer prompt の coverage gate 記述が旧仕様のまま**: verification の test-coverage phase は lcov 変更行検証に置き換わったが（2026-07-08 の変更）、build-fixer の system prompt は旧 TC-ID 照合 gate の手順（「missing TC ID を確認」「test-cases.md から GIVEN/WHEN/THEN を読む」）のまま。fixer は実際の失敗内容（未実行の変更行・実行率）と食い違う指示を受けている。また、coverage gate に対する正当な直し方（変更行を実行する実テストの追加）と不正な直し方（gate 回避）の規律が明示されておらず、実際に dead export の追加・テストの移設といった gate 回避的修正が観測された。
2. **exit-guard が resumePoint を書かない**: プロセス終了時に running job を awaiting-resume に遷移させる exit-guard は、`resumePoint` を書き込まない。`job ls` の escalation 発生元表示は `resumePoint` を一次情報源とし、無い場合は履歴全走査にフォールバックするため、exit-guard で中断された job では「解消済みの過去 escalation を現在の待機理由として誤表示する」既知の問題が再現する。
3. **worktree cwd からの view コマンドがクラッシュする**: job worktree 内の cwd から `job ls` を実行すると、repoRoot が worktree root に解決され、`<worktreeRoot>/.git/specrunner-worktrees` の readdir が ENOTDIR で throw して Fatal になる（worktree の `.git` はファイルであるため）。`job resume` には worktree cwd の拒否ガードが既に導入されており、同じ判定機構が流用できる。

## 現状コードの前提

- `src/prompts/build-fixer-system.ts:30-34` — 「Phase: test-coverage が failed の場合」の手順が missing TC ID / test-cases.md / TC ID 記載の旧 gate 前提で書かれている
- `src/core/verification/changed-line-coverage.ts:121-159` — 現行の coverage gate は lcov の変更行照合で、失敗 reason は全行未実行と閾値未達（実行率・閾値つき）の 2 種。TC ID は関与しない
- `src/prompts/code-fixer-system.ts` — coverage gate への言及なし。禁止事項に gate 回避（テスト削除・移設、カバレッジ目的の dead code 追加、coverage 設定の編集）の規律はない
- `src/core/lifecycle/exit-guard.ts:65,131,152` — 3 箇所とも `transitionJob(state, "awaiting-resume", ...)` のみで `resumePoint` を書かない。書き込み元は pipeline（escalation / exhaustion）と executor（timeout）のみ
- `src/state/schema.ts:107-113` — `ResumePoint { step, reason: string, iterationsExhausted, exhaustionPhase? }`。`src/core/step/executor.ts:412` に `{ step, reason: "timeout", iterationsExhausted: 0 }` を書く先行例がある
- `src/core/job-list/operations-view.ts:159-178` — escalation 発生元の導出は `resumePoint` が一次情報源、無ければ履歴全走査フォールバック
- `src/store/job-state-store.ts:268-296` — `JobStateStore.list` は `<repoRoot>/.git/specrunner-worktrees` を readdir し、ENOENT 以外の error を rethrow する。worktree cwd では `.git` がファイルのため ENOTDIR が throw される
- `src/cli/ps.ts:87` / `src/core/command/job-stats.ts:350` / `src/cli/job-show.ts:65` — view 系コマンドは cwd 由来の repoRoot で `JobStateStore.list` を呼ぶ
- `src/core/command/resume.ts:83-94` — `detectSpecrunnerWorktree(cwd)` による worktree cwd 拒否ガードの既存実装（main checkout への案内つき）
- `src/core/worktree/detection.ts:100-122` — `detectSpecrunnerWorktree` は cwd の実パス解析で判定し、main checkout path も返す

## 要件

1. build-fixer prompt の test-coverage failed 時の手順を現行の lcov 変更行 gate に合わせて書き直す: verification-result.md に記録された未実行の変更行（file:line）と実行率を確認し、**その行を実際に実行する実テストを追加する**ことを正当な修正として指示する
2. build-fixer と code-fixer の両 prompt に、gate 回避の禁止規律を追加する: 既存テストの削除・移設による回避、カバレッジ目的の dead code / dead export の追加、coverage 設定（include / exclude / threshold）の編集を禁止し、正当な修正で解消できない場合は修正せず失敗のまま終える（escalation は pipeline の iteration 上限が担う）ことを明示する
3. exit-guard の awaiting-resume 遷移 3 箇所（no-worktree / per-job / global scan）で、`state.step` が有効な step 名である場合に `resumePoint`（reason: "signal"、iterationsExhausted: 0）を書き込む。`state.step` が無い場合は従来どおり resumePoint なしで遷移する
4. `job ls`・`job stats`・`job show` を specrunner job worktree 内の cwd から実行した場合、state scan の前に明示エラー（exit 非 0、main checkout からの再実行案内を含む）で拒否する。判定・エラー文言は `job resume` の既存ガードと同一機構を流用する

## スコープ外

- prompt 全体の再構成（変更は test-coverage 手順と禁止規律の追加のみ）
- coverage gate 本体・verification-result.md の書式の変更
- `ResumePoint` schema の変更（reason の enum 化を含む）
- `JobStateStore.list` の scan 挙動の変更（ENOTDIR の握り潰しはしない。worktree cwd はコマンド入口で拒否する）
- view 系以外のコマンド（job start / archive / cancel 等）への cwd 検証の追加
- codex adapter の prompt・挙動の変更

## 受け入れ基準

- [ ] build-fixer prompt に lcov 変更行 gate 前提の手順（未実行行の確認と実テスト追加）が含まれ、旧 TC-ID 手順が残っていないことをテストで固定する
- [ ] build-fixer / code-fixer 両 prompt に gate 回避禁止（テスト削除・移設 / dead code 追加 / coverage 設定編集）の規律が含まれることをテストで固定する
- [ ] exit-guard の 3 経路それぞれで、遷移後 state に `resumePoint`（step = 中断時の step、reason = "signal"）が書かれることをテストで固定する
- [ ] `state.step` を持たない state では従来どおり resumePoint なしで awaiting-resume に遷移することをテストで固定する
- [ ] worktree cwd からの `job ls` / `job stats` / `job show` が state scan 前に明示エラー（main checkout への案内を含む）になることをテストで固定する
- [ ] main checkout cwd からの各 view コマンドは従来どおり動作する（既存テスト無変更で green）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 3 件を 1 request に束ねる。各修正は小規模・相互独立（prompts / lifecycle / cli 入口）で、1 レビュー収束ループに収まる
- **採用**: worktree cwd の view コマンドは「拒否」する。worktree root 基準の scan は不完全な一覧（他 job が見えない・cost 解決が worktree 相対になる）を黙って表示するため、部分表示より明示エラーが誠実。resume の既存ガードとも整合する
- **採用**: fixer が正当に解消できない coverage 失敗は「失敗のまま終える」。fixer に escalation 判断をさせず、既存の iteration 上限 → escalation 経路に委ねる（fixer の判断場面を増やさない）
- **却下**: `JobStateStore.list` で ENOTDIR を ENOENT 同様に握り潰す案 — クラッシュは消えるが worktree 基準の誤った一覧を黙って返す。呼び出し側の入口拒否が正しい層
- **却下**: exit-guard の reason を新設 enum にする案 — persisted schema の変更を伴いスコープが膨らむ。interruption event と同じ "signal" の実値を使う
- **却下**: code-fixer の Fix カラム運用の見直し — gate 回避規律の追加のみで足り、review 運用の変更は別件
