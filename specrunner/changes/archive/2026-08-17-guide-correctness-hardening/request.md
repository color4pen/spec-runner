# guide 正本の正確性硬化: 誤案内 3 件の修正・正典モデル記述の是正・コマンド例検証の invocation contract 化

## Meta

- **type**: bug-fix
- **slug**: guide-correctness-hardening
- **base-branch**: main
- **adr**: false

## 背景

`specrunner guide`(#1008)は運用知識の正本だが、本文に「guide を信じてそのまま操作した人・agent が実際に間違える」誤案内が含まれる: (a) 実行するとエラーになるコマンド例(`job cancel <slug>`)、(b) 存在しないパス(`<slug>-<jobId>` の worktree path)、(c) #959 で確定した正典モデルと逆の記述(review / audit topic が起点 issue を canon に再昇格させている)。これらが既存テストを素通りしたのは、guide 本文コマンド例の機械検証が「command path が registry に存在するか」しか見ておらず、引数・flag の契約まで照合していないため。正本化した直後にこれらを潰し、検証の歯を「存在するコマンド」から「実行可能なコマンド例」の保証に強化する。

あわせて #1008 レビューで検出済みの軽微な不整合(judge escalation halt 出力の guide 導線欠落、jobs topic の陳腐化手順、skill description の削除済み skill への言及、ADR 記述と実状態のずれ、setup topic の init 動作記述のずれ)を同時に修正する。

## 現状コードの前提

- `src/core/command/guide.ts:377-378`(review topic)および `guide.ts:184`(audit topic)に「request.md でなく起点 issue の正典を canon とする」旨の記述がある
- #959(merged)は issue 起点 run の忠実性ゲートを pipeline 開始前に完結させ、request.md を正典として確定してから pipeline を開始する設計。issue 本文は agent へ非伝播
- `src/core/command/guide.ts:313` は `specrunner job cancel <slug> --restore-draft` を案内するが、CLI 契約は `job cancel <jobId>`(`src/cli/command-registry.ts:920,934`)で、handler が `VALID_JOB_ID_CHARS = /^[a-f0-9-]+$/`(`command-registry.ts:52,938`)で jobId 形式を検証する。通常の slug(a-f 以外の文字を含む)はその場で invalid jobId format になる
- `src/core/command/guide.ts:112` は `cd .git/specrunner-worktrees/<slug>-<jobId>` を案内するが、実際の worktree dir は `<slug>-<jobId 先頭 8 文字>`(`src/core/worktree/manager.ts:65` の `jobId.slice(0, 8)`)
- `src/core/command/guide.ts:199` の見出しは「init — 2 層 config scaffold」だが、`runInit`(`src/cli/init.ts`)が作るのは user-global config(`~/.config/specrunner/config.json`)と per-repo scaffold(`specrunner/drafts/`・`specrunner/changes/`・`.gitignore` 追記)であり、project-local `.specrunner/config.json` は作らない(overlay としての読み込みは存在するが scaffold 対象ではない)
- guide 本文コマンド例の機械検証(`src/core/command/__tests__/guide.test.ts` の TC-013 系)は、inline backtick からの抽出 + 直接 `resolveCommand` assert で command path の存在のみ確認する。triple-backtick コードブロック内の例は抽出対象外で、引数形式の誤り(`job cancel <slug>`)は path が解決されるため green になる
- judge escalation の halt 出力 `src/core/command/runner.ts:450-451`(`Pipeline halted at step ... Run 'specrunner resume' to continue`)には `specrunner guide escalation` への導線が無い。導線があるのは `formatEscalation`(`src/core/finish/escalation.ts:29`)と `buildCanonEscalationReason`(`src/core/step/canon-escalation.ts:151`)のみ
- `src/core/command/guide.ts:42` は「起動直後は state 登録に数秒ラグあり。`job ls` で running を確認してから」と案内するが、#981(merged)以降 detach 親プロセスの exit 0 が「登録完了 + プロセス生存」を保証するため、この事前確認は不要になった旧手順
- `.claude/skills/acceptance-and-issue-audit/SKILL.md` の description に削除済み skill `parallel-request-workflow` への言及が残っている
- `specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md` は「`parallel-request-workflow` は廃止済みコマンド前提のため tombstone を置いて実質削除する」と記すが、実状態は directory ごと削除済み

## 要件

1. **review / audit topic の正典モデル記述を #959 に整合させる** — 「起点 issue の正典を canon とする」記述を撤去し、次のモデルに置き換える: issue 起点の run では issue との忠実性は開始前 fidelity gate で確定済み。pipeline 開始後の規範は request.md / spec。issue と request.md を比較するのは「issue→request 転記そのものを監査する」場合のみ(audit topic の 1 観点として位置づける)
2. **escalation topic の cancel 案内を実行可能な形に修正** — `job cancel <slug>` を、`job show <slug>` で Job ID を確認してから `job cancel <jobId> --restore-draft` を実行する 2 段の案内に置き換える
3. **merge topic の worktree path を実際の命名に修正** — `<slug>-<jobId>` を `<slug>-<jobId 先頭 8 文字>` 表記に修正する
4. **guide 本文コマンド例の機械検証を invocation contract 化** — 検証対象を inline backtick に加えて triple-backtick コードブロック内の `specrunner ...` 行にも広げ、各例について (a) command path の解決、(b) 使用 flag が CommandSpec に実在すること、(c) positional placeholder(`<...>`)が CommandSpec の args 宣言(名前・個数)と整合することを照合する。`job cancel <slug>` のような placeholder 名と args 名の不一致が fail になる歯を持つ。機械照合できない例を検証から除外する場合は、除外を明示するリスト(テストコード内の定数等)で管理し silent skip しない
5. **judge escalation halt 出力への導線追加** — `runner.ts` の `Pipeline halted at step ...` 出力に `詳細: specrunner guide escalation` の一行を加える
6. **jobs topic の陳腐化手順を撤去** — 「`job ls` で running を確認してから」の事前確認手順を削除し、detach の ack(親 exit 0 = 登録完了 + プロセス生存)を前提とした案内にする
7. **setup topic の init 記述を実態に整合** — 見出し・本文を「global config + repository scaffold」の実態(project-local `.specrunner/config.json` は scaffold しない)に合わせる
8. **軽微な残骸の除去** — acceptance-and-issue-audit skill description の `parallel-request-workflow` 言及を除去する。ADR 2026-08-17-cli-operational-knowledge-registry の skill 削除記述を実状態(tombstone でなく directory 削除)に合わせて修正する

## スコープ外

- `job cancel <jobId|slug>` への CLI 入力拡張(cancel が slug を受け付ける変更)
- `job show` 出力への `Worktree:` パス表示の追加(guide が内部命名規則に依存しない将来形)
- guide の topic 構成・registry 構造の変更
- docs / README の再構成

## 受け入れ基準

- [ ] review / audit topic 本文に「issue を canon とする」旨の記述が存在せず、「pipeline 開始後の規範は request.md / spec」「issue との比較は転記監査時のみ」に相当する記述が存在することをテストで固定する
- [ ] escalation topic の cancel 案内が `job show` で Job ID を確認する手順を含み、cancel の引数が jobId であることをテストで固定する
- [ ] merge topic の worktree path 記述が jobId 先頭 8 文字表記であることをテストで固定する
- [ ] guide 本文の全 `specrunner ...` コマンド例(inline + コードブロック)について、path 解決・flag 実在・positional placeholder と args 宣言の整合が検証されることをテストで固定する。検証除外は明示リストで管理し、除外理由が読める形にする
- [ ] invocation contract 検証が「`job cancel <slug>`」のような placeholder 名不一致を fail させることを、検証ロジック自体のテスト(意図的な不一致例を与えて fail を確認)で固定する
- [ ] `runner.ts` の halt 出力(`Pipeline halted at step ...` に続く案内)に `specrunner guide escalation` が含まれることをテストで固定する
- [ ] jobs topic 本文に「`job ls` で running を確認」の事前確認手順が存在しないことをテストで固定する
- [ ] setup topic の init 記述が「2 層 config scaffold」でなく global config + repository scaffold の実態と一致すること
- [ ] `.claude/skills/acceptance-and-issue-audit/SKILL.md` に `parallel-request-workflow` 文字列が存在しないこと
- [ ] ADR 2026-08-17-cli-operational-knowledge-registry の記述が skill directory 削除の実状態と一致すること
- [ ] 既存の guide テスト(TC-001〜TC-021 系)は、本 request が修正する本文への文言 pin を除き無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **invocation contract 検証は CommandSpec を正とする**: guide 例の placeholder 名を CommandSpec の args 宣言に合わせる(逆に spec を guide に合わせない)。CommandSpec が CLI interface の正本であるため
- **cancel の修正は案内側で行う**: CLI を `jobId|slug` 受理に広げる案(却下 — 入力 domain の拡張は本 request の範囲外の設計変更で、誤案内の修正だけなら guide 側で完結する)
- **worktree path は表記修正に留める**: `job show` に Worktree パスを表示して guide から命名規則を消す案(却下 — 出力契約の追加になるためスコープ外へ。表記修正だけで誤案内は解消する)
- **導線追加は runner の halt 出力 1 箇所**: resumePoint.reason 側(各 producer)に足す案(却下 — reason は複数 producer があり、halt 時に必ず通る出力面 1 箇所に足す方が漏れない)
