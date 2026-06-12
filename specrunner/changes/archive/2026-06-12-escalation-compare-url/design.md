# Design: escalation 通知コメントに branch の compare URL を含める

## Context

escalation（`awaiting-resume`）で停止した job への判断には変更差分の確認が必要だが、現状の
escalation 通知コメントは marker / 停止 step / reason / 再開コマンドのみで、diff への導線が
GitHub 上に存在しない。job の branch は step 完了毎に origin へ push 済み
（`src/core/step/commit-push.ts`）のため、escalation 時点で差分は GitHub の compare ページ
（`{base}...{branch}`）として既に閲覧可能になっている。不足しているのは通知コメントからの
導線のみで、URL を 1 行加えるだけで「diff を見る → linked issue にコメントで判断 → /resume」が
GitHub 上で完結する。

現状コードの主要な制約:

- `src/core/notify/issue-notifier.ts:88` — `buildEscalationComment(state: JobState): string` は
  `JobState` のみを入力とする純関数。marker / step / reason / resume コマンドだけを組み立てる。
- `notifyJobTerminal(state, ctx)` の呼び出し元は **2 箇所**ある:
  1. `src/core/pipeline/pipeline.ts:459` — `notifyJobTerminal(state, deps)`。`deps`（PipelineDeps）は
     `request`（`ParsedRequest`、`baseBranch` を持つ）を保持する。
  2. `src/core/inbox/run-inbox.ts:358` — `notifyJobTerminal(state, { githubClient, owner, repo })`。
     この経路は **`JobState` しか持たず**、`ParsedRequest.baseBranch` を即座に参照できない
     （base-branch を得るには request.md を再 parse する I/O が必要になる）。
- `src/state/schema.ts:89-92` — `RepositoryInfo` は `owner` / `name` を持つため、owner / repo は
  state のみから取得できる。
- `src/state/schema.ts:201` — `state.branch` は `string | null`。branch 作成前
  （request-review 段階）の escalation では `null` があり得る。
- `src/state/schema.ts:79-87` — `RequestInfo` は base-branch を保持しない。一方
  `ParsedRequest.baseBranch`（`src/parser/types.ts`）は job 起動時に確定しており、
  `src/core/command/pipeline-run.ts:84` の `bootstrapJob` 呼び出し時点で参照可能。
- DSM 閉包: `src/core/notify`（domain）は `core/port` / `state` / `logger` のみ import 可。
  adapter 直接 import / runtime 分岐は不可。

## Goals / Non-Goals

**Goals**:

- escalation 通知コメント本文に compare URL（`https://github.com/{owner}/{repo}/compare/{base}...{branch}`）を
  1 行含める。
- `state.branch` が `null` の場合は URL 行を省略し、従来の文面で投稿する（投稿自体を妨げない）。
- URL の base に request.md の base-branch（`ParsedRequest.baseBranch`）を反映する。
- `buildEscalationComment` を `JobState` のみを入力とする純関数のまま保ち、pipeline / inbox
  両経路で同一挙動を得る。

**Non-Goals**:

- escalation 時の draft PR 作成（diff への行コメント単位のレビューが実需になった場合に別 request）。
- 完走通知（completion comment）の変更（PR URL が既に含まれている）。
- inbox / resume コメントジェスチャー側の挙動変更。
- compare URL の到達性検証（branch が origin に存在するかの確認）。best-effort の通知に検証 I/O を
  足さない。

## Decisions

### D1: base-branch を `JobState.request`（RequestInfo）に永続化し、コメントは state のみから組み立てる

`src/state/schema.ts` の `RequestInfo` に `baseBranch?: string | null`（optional, backward compat）を
追加する。`src/core/command/pipeline-run.ts:84` の `bootstrapJob` に渡す `request` リテラルに
`baseBranch: request.baseBranch`（`ParsedRequest.baseBranch`）を 1 行加える。これにより
`buildInitialJobState`（`...params.request` の spread で baseBranch を取り込む）→ state 永続化 →
load の round-trip で base-branch が state に乗る。`buildEscalationComment(state)` は
`state.request.baseBranch` を読んで URL を組み立てる。

**Rationale**: `notifyJobTerminal` の呼び出し元は pipeline と inbox の 2 経路あり、inbox 経路
（`run-inbox.ts:358`）は `JobState` しか持たない。base-branch を「コメント生成時に ctx 経由で
渡す」方式にすると、inbox 経路で base-branch を得るために request.md を再 parse する I/O 分岐が
必要になり、`buildEscalationComment` の純粋性も崩れる。base-branch を job 起動時に state へ
永続化しておけば、両経路とも追加の I/O なしに `state.request.baseBranch` を読むだけで済み、
`buildEscalationComment(state)` は `JobState` 入力の純関数のまま保てる。base-branch は job の
ライフサイクルを通じて不変なため state に持つのが自然で、`issue-notification` change が
`issueNumber` を state へ持たせたのと同じ配線パターンに従う。

**Alternatives considered**:
- **base-branch をコメント生成時に ctx（`NotifyCtx`）経由で渡す**: pipeline 経路は `deps.request.baseBranch`
  をそのまま渡せるが、inbox 経路は base-branch を持たず request.md 再 parse が要る。純粋関数の
  シグネチャも `JobState` のみから外れる。却下。
- **base を `main` 固定にする**: 配線は最小だが、base-branch が `main` 以外（`master` / release 系）の
  request で誤った compare URL を生む。request 要件 3 が「request.md の base-branch を反映する」を
  優先しており、反映の実装コストは state への 1 フィールド追加と 1 行のセットで小さい。固定は却下。
- **`JobState` 直下に `baseBranch` を持たせる**: base-branch は request 由来の属性であり、`RequestInfo`
  内に置く方が意味的に整合し、`{ ...s.request, path: ... }` の既存 spread でも保全される。却下。

### D2: compare URL の組み立てを純粋ヘルパー `buildCompareUrl` に切り出す

`src/core/notify/issue-notifier.ts` に純関数
`buildCompareUrl(owner: string, repo: string, base: string, branch: string): string` を追加し、
`https://github.com/${owner}/${repo}/compare/${base}...${branch}` を返す。
`buildEscalationComment` はこのヘルパーを使い、URL 行（例: `Diff: <url>`）を marker ブロックの後・
`To resume:` の前に 1 行挿入する。

owner / repo / base / branch の各値は verbatim で URL に挿入する。branch 名は
`<prefix><slug>-<jobId8>`（system 生成、URL 非敵対文字のみ）、base は request.md の base-branch で、
いずれも GitHub の ref として有効な文字列のため追加の percent-encoding は行わない（GitHub の
compare path は ref 中の `/` をそのまま受け付ける）。

**Rationale**: URL 形式を 1 つの純関数に集約（SSOT）することで、`buildMarker` と同様に単体テストで
形式を固定でき、受け入れ基準（URL 含有・base 反映）を直接検証できる。`buildEscalationComment` は
null 分岐（D3）と本文組み立てに専念する。

**Alternatives considered**:
- **URL を `buildEscalationComment` 内にインライン記述**: テストは body の `toContain` で間接検証できるが、
  形式の SSOT 化と直接テストの容易さで劣る。ヘルパー化を採る。

### D3: `state.branch` が `null` のとき URL 行を省略する（投稿は従来通り）

`buildEscalationComment` 先頭で `state.branch` を判定する。`null`（および空文字）の場合は URL 行を
生成せず、既存の marker / Step / Reason / resume コマンドのみの本文を返す。`branch` が非 null の
場合のみ `buildCompareUrl(state.repository.owner, state.repository.name, state.request.baseBranch ?? "main", state.branch)`
で URL 行を加える。

base の解決は `state.request.baseBranch ?? "main"`: 新規 job では D1 で永続化された base-branch を
使い、legacy state file（baseBranch 欠落）では `main` にフォールバックする。

**Rationale**: 要件 2「branch 未確定時は URL 行を省略し従来文面で投稿（投稿自体を妨げない）」。
branch が null なのは request-review 段階の escalation で、この時点では origin に branch が無く
compare ページも成立しないため URL を出さないのが正しい。legacy state の base-branch 欠落は
backward compat の既定（`main`）で吸収し、`RequestInfo.baseBranch` を optional にすることで
`validateJobState` の追加検証なしに pass-through できる。

**Alternatives considered**:
- **branch null 時に URL 行を「(branch 未確定)」等の注記で残す**: ノイズが増えるだけで導線価値がない。
  行ごと省略する方が clean。却下。

## Risks / Trade-offs

- **[legacy state file の base-branch 欠落]** 本変更前に起動された job の state は `baseBranch` を持たず、
  その job が後から inbox 経由で再 escalation 通知される場合、base が実際の base-branch でなく `main` に
  なる可能性がある → Mitigation: `?? "main"` フォールバックで URL 生成自体は成功し、大半の request は
  base が `main`。base が `main` 以外の legacy job という稀ケースに限った軽微なずれで、通知の到達性や
  job 結果には影響しない。
- **[compare URL の到達性は未保証]** branch が origin に push 済みである前提は commit-push step に依存する。
  push 失敗等で branch が origin に無い場合 compare ページは 404 になり得る → Mitigation: 通知は
  best-effort の観測手段であり、URL を 1 行載せるだけ。到達性検証 I/O は scope 外（Non-Goal）。
- **[既存テストへの影響]** escalation body へ 1 行追加するが、既存の本文アサーションは `toContain`
  ベース（`tests/unit/core/notify/issue-notifier.test.ts` / `pipeline.notification.test.ts`）のため
  regression しない → Mitigation: 新規アサーションで URL 行を固定し、既存ケースは不変を確認する。

## Open Questions

- URL 行のラベル（`Diff:` 等）の文言: 人間可読であればよく、機械 parse 対象ではない。実装時に
  簡潔な英語ラベルを採る。
- base が `main` 以外の legacy job の発生頻度は実運用上ほぼ無く、フォールバックずれを明示記録する
  以上の対処は不要と判断してよいか。
