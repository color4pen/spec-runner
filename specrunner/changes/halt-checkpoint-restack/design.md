# Design: halt checkpoint を未 push 作業 commit から分離して publish する

## Context

pipeline が halt（escalation / guard halt / exhaustion）すると、`awaiting-resume` への遷移後に
`LocalRuntime.commitFinalState`（`src/core/runtime/local.ts:752`）が
`commitFinalState`（`src/core/step/commit-push.ts:770`）を呼び、pipeline 管理パスのみを明示 pathspec で
commit（`checkpoint: <slug>`）して push（1 retry）する。push 失敗は `stderrWrite` の warn のみで
throw しない（`src/core/step/commit-push.ts:877-882`）。

この checkpoint commit の親は**ローカル branch tip** である。tip に push 拒否された作業 commit が
含まれる場合、push range にその commit が入るため checkpoint の push も同じ理由で拒否され、
halt 記録が publish されない。しかも一度拒否 commit が history に入ると、**それ以降のすべての push が
同じ range を含むため拒否され続ける**（#1059 / job c2c7ba44 の実測: 5 step 分が未 publish のまま
branch tip は `status: running` の checkpoint で止まった）。

その結果 `origin/<branch>` の tip は quiescent でない checkpoint のままとなり、attach
（`job attach --branch` / `job resume --from-issue`）は `attachQuiescentPolicy`
（`src/core/attach/checkpoint-policy.ts:155`）に fail-closed で拒否される。local state を持たない
ephemeral runner では job が回復不能になる。

checkpoint モデルの契約は「失ってよいのは中断された 1 step 分まで」であり（ADR-20260715 D1/D2）、
halt 記録が作業 commit と push を相乗りする現構造はこの契約を破っている。

現状コードで確認した前提:

- `pipelineManagedPaths(slug)`（`src/core/pipeline/round-git-scope.ts:109`）= state.json / events.jsonl /
  usage.json / bite-evidence-result.md / pr-create-result.md
- attach 検証（`src/core/attach/verify-checkpoint.ts`）は **checkpoint commit の tree** に対して
  (b) journal/projection 整合、(b-new) counter reversal、(profile)、[policy]、(d) request.md 存在、
  (e) identity を検証する。`attachResumePolicy` は resume step の `reads()` 必須入力が
  **tree に存在すること**まで要求する（`resume-input-missing`）
- `readCheckpointFromRef`（`src/git/checkpoint-ref.ts`）は checkpoint tree の
  `specrunner/changes/<slug>/` 配下から state.json / events.jsonl / treeFiles を読む
- egress backstop `verifyEgressLedger` は `git rev-list HEAD --not --remotes=origin` を
  `synthesizedCommits` 台帳と突合する。台帳外 OID が publish range にあると
  `EGRESS_UNKNOWN_COMMIT` で resume が止まる
- journal には projection に materialize されない journal-only record の先例がある
  （`LineageRecord` / `OperatorEventRecord` / `FindingRecencyRecord`）。`fold()` は未知 type を
  黙って無視する（forward compat）。counter reversal は `transition` / `step-attempt` の
  件数減少のみを検出する
- `SpawnOptions`（`src/util/spawn.ts`）は `env` overlay をサポートするため `GIT_INDEX_FILE` を使った
  temp index 操作が可能。stdin は渡せない（`update-index --index-info` は使えない）

## Goals / Non-Goals

**Goals**:

- halt checkpoint の publish を、未 push 作業 commit の push 可否から**分離**する。
  直接 push が失敗した場合、最後に push 成功している remote tip（`origin/<branch>`）を親として
  checkpoint commit を積み直し、それを push する（1 retry）
- 積み直された checkpoint が attach 検証（generic integrity + `attachQuiescentPolicy` + identity）を
  通過し、拒否された step から resume できる self-consistent な内容であること
- 積み直しの発生と「publish されなかった local commit」を journal event として
  **publish される checkpoint の中に**記録する（ephemeral runner が後から判別できること）
- 通常経路（push 成功）は既存挙動・既存テストのまま不変。積み直し push も失敗した場合は
  現行同様 warn で継続する（throw しない）
- local state を持つ環境の以後の挙動（次 step の commit → push）を壊さない

**Non-Goals**:

- push 拒否の原因側の対処（push 能力 preflight は別 request）
- attach 側の operator override（#1059 対応方向 C）
- 未 push の**作業 commit（source code）**の救出・復元。損失を中断 1 step 分に限定することが目的
- archive / `--with-merge` 経路の変更（`finalize` label も同じ関数を通り実装は label 非依存に働くが、
  本 request の受け入れ条件は awaiting-resume checkpoint を対象とする）
- 新しい CLI サブコマンド / operator 向け UI の追加

## Decisions

### D1: 積み直しは `commitFinalState` の push 二重失敗の**後段**に置き、成功経路には一切の git 呼び出しを足さない

`commitFinalState` の既存フロー（stage → diff → commit → persistBeforePush → egress → push ×2）は
一切変えず、`push2` も失敗して既存の warn を出した**直後**に restack を試行する。
早期 return する分岐（staging 0 件 / staged 差分なし / commit 失敗 / egress 失敗）からは restack を
呼ばない。egress 失敗は fail-closed の判断であり、そこから publish を試みるのは backstop の迂回になる。

- Rationale: 成功経路の spawn 列が変わらないため「push 成功の通常経路は既存テスト無変更で green」を
  構造的に保証できる（既存 TC-003 の sequence 期待が壊れない）。既存 warn を先に出すことで
  TC-011（push stderr を warn に含む）も無変更で green。
- Alternatives considered:
  - **push 前に常に remote tip を親にして積む**: 通常経路の commit topology が変わり、作業 commit を
    含む push が別途必要になる。成功経路の不変を破るため却下。
  - **push 1 回目失敗で即 restack**: 一過性失敗の retry 機会を奪う。retry 2 回のあとに限定する。

### D2: 積み直す tree の overlay 単位は「pipeline 管理パス」ではなく **change folder `specrunner/changes/<slug>/` 全体**（管理パスはその真部分集合）

restack commit の tree = `origin/<branch>` tip の tree に対して、`specrunner/changes/<slug>/` subtree を
ローカル checkpoint commit のものへ差し替えたもの。それ以外のパス（`src/`, `.github/` など）は
remote tip のまま = 未 push 作業 commit の内容は一切 publish されない。

- Rationale: request の実装範囲 1 は「管理パスのみ」と書かれているが、**実測トポロジでは管理パスのみの
  overlay では受け入れ条件 2（attach 成立 + 拒否された step から再走）を満たせない**。
  拒否 commit が history に入ると以降のすべての push が拒否されるため、拒否時点以降に生成された
  change folder 成果物（例: test-cases.md、spec.md の修正）も remote tip には存在しない。
  attach の `attachResumePolicy` は resume step の `reads()` 必須入力が checkpoint tree に
  存在することを要求する（`resume-input-missing`）ので、管理パスだけを載せた tree は
  「journal は最新・成果物は古い」不整合 checkpoint になり fail-closed で弾かれる。
  ADR-20260715 D1 が要求する「projection・journal・resume に要る成果物を同一 tree に収めた単一 commit」を
  満たす最小単位が change folder 全体である。change folder は pipeline 自身が所有する canonical な
  job 文書であり、source code の救出（非目標）とは領域が異なる。
- Alternatives considered:
  - **管理パスのみ overlay（request の字面）**: 上記の理由で受け入れ条件 2 を満たせないケースが
    通常発生する。棄却（ただし overlay 単位は定数 1 個であり、方針変更時の変更量は小さい）。
  - **ローカル checkpoint commit の tree をそのまま親付け替え**: 未 push 作業 commit の差分が
    まるごと 1 commit に畳み込まれて publish されるため、拒否理由（例: `.github/workflows/`）が
    そのまま再現し push も再拒否される。契約違反かつ無効。棄却。
  - **change folder + 特定 source path**: 「何を救うか」の判断が必要になり非目標に踏み込む。棄却。

### D3: tree 構築は temp index（`GIT_INDEX_FILE`）+ `ls-tree` / `update-index` / `write-tree` / `commit-tree` の plumbing で行い、worktree・HEAD・index を一切変更しない

手順（すべて `spawnFn` 経由。temp index は `.specrunner/local/<slug>/` 配下（git 管理外）に置き、
終了時に best-effort で削除）:

1. `git read-tree <remoteTip>`（temp index を remote tip の内容で初期化）
2. `git ls-tree -r <remoteTip> -- <changeDir>/` と `git ls-tree -r <localCheckpointOid> -- <changeDir>/` を比較し、
   remote 側のみに存在するパスを `git update-index --force-remove -- <path>`、
   local 側の各 entry を `git update-index --add --cacheinfo <mode>,<oid>,<path>` で反映
3. worktree の `events.jsonl`（D5 の restack record 追記済み）を `git hash-object -w --` して
   `--cacheinfo 100644,<blob>,<changeDir>/events.jsonl` で上書き
4. `git write-tree` → tree OID。`<remoteTip>^{tree}` と一致するなら publish 差分なしとして skip
5. `git commit-tree <tree> -p <remoteTip> -m "<messageLabel>: <slug> (restacked onto origin/<branch>)"`

- Rationale: worktree checkout も index 変更も伴わないため、halt 直後の worktree 状態
  （dirty file / 進行中の成果物）を一切壊さない。stdin を渡せない `SpawnFn` 制約にも適合し、
  すべての git 呼び出しが exitCode/stdout だけで fake 可能 = unit test しやすい。
- Alternatives considered:
  - **一時 worktree（`git worktree add --detach`）で porcelain 操作**: 大きな repo で halt 時に
    full checkout のコストがかかり、失敗経路が増える。fallback 案として保持するが第一候補にしない。
  - **`git read-tree --prefix=` によるサブツリー差し替え**: prefix 既存 entry と衝突するため
    事前に `git rm -r --cached` が要り、plumbing の前提条件が増える。明示 entry 反映（上記 2）の方が
    決定的で test 可能。
  - **`git stash` + `git reset --hard origin/<branch>` 系の porcelain**: worktree を破壊しうる。却下。

### D4: publish 前に「差分封じ込め」を fail-closed で検証する

`git diff --name-only <remoteTip> <restackedOid>` の結果が全件 `<changeDir>/` 配下でなければ
push せず skip（warn）する。判定不能（git 失敗）も skip。

- Rationale: 「未 push 作業 commit を publish しない」という本 request の中心的な安全性質を、
  構造（D3 の作り方）だけでなく実行時にも二重で担保する。既存の egress backstop
  （`verifyEgressLedger`）は `HEAD` からの publish range を見る設計で、HEAD から到達しない
  restack commit は対象外になるため、restack 専用の封じ込め検査が必要。
- Alternatives considered:
  - **`verifyEgressLedger` を再利用**: `rev-list HEAD --not --remotes=origin` は restack commit を
    見ないため意味を成さない。棄却。
  - **構造保証のみ（検査なし）**: overlay 実装のバグが直ちに情報流出（未 push commit の publish）に
    なる。fail-closed 文化に反する。棄却。

### D5: 積み直しは `checkpoint-restack` という journal-only record として記録し、**tree 構築より前**に events.jsonl へ append する

record（`src/store/event-journal.ts` の `EventRecord` union に追加、projection には materialize しない）:

- `type: "checkpoint-restack"` / `ts` / `slug` / `branch`
- `parentOid`（= 積み直しの親 = 最終 push 成功 tip）、`localTipOid`（= push を拒否された local tip）
- `unpublishedCommits`（`git rev-list <parentOid>..<localTip>` の OID 列 = publish されなかった作業 commit）
- `reason`（push 失敗の git stderr を `maskSensitive` で伏字化し先頭 N 文字に truncate）

append は restack 実行決定後（remote tip 解決後）・tree 構築前に行う。これにより publish される
checkpoint の events.jsonl に record が含まれ、local state を持たない環境でも
「未 push 作業 commit が publish されなかった」ことを checkpoint 単体から判別できる。

- Rationale: 「後から判別できること」の読み手は ephemeral runner / operator であり、判別材料は
  publish される tree の中に無ければ意味がない。journal-only record は先例
  （lineage / operator-event / finding-recency）があり、`_journal` counters（historyCount /
  stepCounts）を増やさないため attach の counter reversal 検査に影響しない
  （fold は未知 type を無視し、新 type も counter に数えない）。
- Alternatives considered:
  - **`TransitionRecord`（history）として記録**: `historyCount` が state.json の `_journal` と
    ずれる（fold > stored）。reversal 検査は通るが、次回 persist の delta 計算に
    余計な相互作用を持ち込む。棄却。
  - **push 後に append**: publish 済み tree に入らないため要件を満たさない。棄却。
  - **stderr warn のみ**: 揮発する。棄却。

### D6: restack push 成功後、local branch を publish 済み commit の子孫にする（`ours` 相当の graft）

`git symbolic-ref -q HEAD` が `refs/heads/<branch>` の場合に限り、
`git commit-tree <HEAD^{tree}> -p <HEAD> -p <restackedOid> -m "merge: publish restacked checkpoint for <slug>"`
で merge commit（tree = local HEAD の tree、つまり local 側が勝つ `-s ours` 相当）を作り、
`git update-ref refs/heads/<branch> <mergeOid> <localHead>`（compare-and-swap）で branch を進める。
merge OID は ledger（`synthesizedCommits`）へ追記する。失敗は warn のみ。

- Rationale: graft が無いと `origin/<branch>` に local history から到達できない commit が載り、
  以後の**すべての** push が non-fast-forward で拒否される。step の `commitAndPush` は
  push 二重失敗で `pushFailedError` を **throw** するため、一過性の push 失敗で restack した場合に
  「その後の pipeline を確実に落とす」新しい壊れ方を作ってしまう。これは request の
  「これ以上悪化させない」「local state がある環境の挙動は不変」に反する。
  worktree/index を触らない plumbing（commit-tree + update-ref）なので、halt 時の worktree 状態も
  作業 commit も失われない。tree は HEAD と同一なので index との不整合も生じない。
- Alternatives considered:
  - **graft しない**: 上記の新規故障モードを導入する。棄却。
  - **`git merge -s ours`（porcelain）**: dirty worktree（D5 で events.jsonl を追記済み）での
    挙動に依存し、index / worktree を触る。plumbing の方が安全。棄却。
  - **local branch を remote tip に reset**: 未 push 作業 commit を破壊する。棄却。
  - **resume/attach 時に遅延 reconcile**: 復旧経路が増え、失敗時の観測も遅れる。棄却。

### D7: 実装は独立 module `src/core/step/checkpoint-restack.ts` に置き、副作用は callback で注入する

公開関数の形（概略）: `restackCheckpointOntoPublishedTip({ cwd, branch, slug, spawnFn, messageLabel,
pushFailureStderr, recordRestack?, persistCommit? })` が判別可能 union の `RestackOutcome`
（`skipped`（理由付き） / `published`（graft 結果付き） / `push-failed`）を返す。
`commitFinalState` は結果を warn 文言に反映するだけで、いかなる場合も throw しない。
`LocalRuntime.commitFinalState` が `recordRestack` に `JobStateStore` の journal append を、
`persistCommit` に既存 `persistBeforePush` 相当（`updateJobState` + in-memory ledger 追記）を束ねる。

- Rationale: `commit-push.ts` は既に 900 行超で責務が密。restack は独立した失敗経路であり、
  fake `spawnFn` だけで全分岐を unit test できる純粋な git 手続きとして切り出すのが安全。
  store 依存を callback で受けることで `src/core/step/` → `src/store/` の新規依存を作らない
  （既存 `persistBeforePush` と同じ注入パターン）。
- Alternatives considered:
  - **`commit-push.ts` に直書き**: 既存関数の複雑度をさらに上げ、テストの sequence 期待が
    絡み合う。棄却。
  - **`LocalRuntime` に直書き**: runtime 層に git plumbing が漏れ、unit test が重くなる。棄却。

### D8: remote tip の解決は「best-effort fetch → remote-tracking ref の rev-parse」。解決できなければ restack しない

`git fetch origin <branch>`（失敗は無視）→ `git rev-parse refs/remotes/origin/<branch>^{commit}`。
exitCode≠0 または stdout が空なら「publish 済み tip が存在しない」とみなし、warn して skip する。

- Rationale: push 失敗が non-fast-forward（他 runner が進めた）の場合、stale な tracking ref を
  親にすると restack push も無駄に拒否される。fetch は失敗経路でのみ発生するので通常経路の
  コストは増えない。stdout が空のときに skip する仕様により、既存の failure-path unit test
  （sequence 外は `{ exitCode: 0, stdout: "" }` を返す fake）が**無変更で green** のままになる。
- Alternatives considered:
  - **branch が未 push のとき base branch（`origin/<base>`）を親にする**: そもそも 1 度も publish
    できていない job であり、bootstrap から作り直す判断は本 request の射程外。skip とする。
  - **fetch しない**: divergence 時に確実に失敗する。棄却。

## Risks / Trade-offs

- **[Risk] restack push 自体も拒否される（例: pre-receive が branch 全体を拒否）** → publish は
  諦めて warn で継続（現行と同じ = これ以上悪化しない）。`RestackOutcome` を warn 文言に含め、
  operator が原因を切り分けられるようにする。テストで固定（受け入れ条件 3）。
- **[Risk] graft（D6）が local history を書き換える** → tree は HEAD と同一・親に HEAD を含む
  merge commit のみで、既存 commit の破棄・書き換えはしない。`update-ref` は old value 指定の
  compare-and-swap とし、HEAD が対象 branch を指していない（detached）場合は graft をしない。
  失敗しても publish 済みの成果は残る。
- **[Risk] merge commit / restack commit が `synthesizedCommits` 台帳から漏れると
  `EGRESS_UNKNOWN_COMMIT` で resume が止まる** → 両 OID を publish/参照より前に台帳へ追記する
  （既存 persist-before-push 不変の踏襲）。台帳追記の失敗は warn で継続し、publish は妨げない。
- **[Risk] publish される checkpoint の events.jsonl が state.json の `_journal` counters より
  1 record 多い** → `checkpoint-restack` は counter 対象外（transition / step-attempt ではない）なので
  counter reversal（`actual < stored`）は発生しない。attach 検証（`verifyCheckpoint`）が通ることを
  実 git の e2e テストで固定する。
- **[Risk] resume step の `reads()` 入力が remote tip にも local change folder にも無い**
  （change folder 自体が未生成の極端な事例）→ attach は従来どおり fail-closed で拒否。
  本 request は「change folder が commit 済みなら publish される」ところまでを保証する。
- **[Risk] halt 経路に `git fetch`（ネットワーク I/O）が増える** → 失敗経路限定。fetch 失敗は
  無視して次へ進むため、オフライン環境でも停止しない。
- **[Trade-off] request 字面（管理パスのみ）からの逸脱（D2）** → 受け入れ条件 2 の充足を優先した。
  overlay 単位は 1 箇所の定数であり、方針を戻す場合の変更量は小さい。
- **[Trade-off] restack 中の git 呼び出し回数が change folder の entry 数に比例して増える** →
  halt 1 回あたり数十回の軽量 plumbing 呼び出しで、halt という低頻度イベントに限定される。
- **[Trade-off] graft（D6）後の non-ephemeral runner では、restack の原因となった push 拒否が
  解消されるまで halt → restack が繰り返され得る** → operator 裁定（2026-08-22, issue #1060）で
  許容範囲とした。halt 時の warn メッセージに「以降の push も同じ理由で拒否される可能性がある。
  ローカル branch を手当てしてから resume すること」を含め、operator の手当てへ誘導する。
  graft の無効化は non-fast-forward 問題を再発させるため採らない。
- **[既知事項] published restack commit の tree に含まれる state.json の `synthesizedCommits` は、
  restack commit 自身の OID（checkpointOid / restackedOid / mergeOid）を含まない**（publish 時点の
  snapshot に自身の OID を含められない構造のため）→ semantic inconsistency として既知とする。
  現行の attach / egress 契約上の functional impact は確認されていない: restack OID は origin に
  存在するため `rev-list HEAD --not --remotes=origin` の publish range に入らず、
  `EGRESS_UNKNOWN_COMMIT` は発生しない。runtime 側の台帳（disk / in-memory）は
  persist-before-push で両 OID を追記済み。

## Open Questions

- publish された restack checkpoint に含まれる `unpublishedCommits` を、operator が後から
  救出（cherry-pick）するための CLI 補助（例: `job show` での表示）を用意するか。
  本 request では journal record に残すところまでとし、UI は別 request に委ねる。
- `finalize`（awaiting-archive）経路でも restack は同じコードパスで働くが、archive 経路の
  受け入れ条件は本 request の対象外。archive 側の quiescence 要求（PR number 等）との
  相互作用を別途整理する必要があるか。
- 同一 branch を複数 runner が同時に触る状況（fetch 後も remote が進む race）では restack push が
  拒否されうる。lease / epoch を前提としない現行方針のままで良いか（ADR-20260715 D4 の射程）。
