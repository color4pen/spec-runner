# `job reopen` から pipeline 実行責務を除去し lifecycle 操作と実行を分離する

## Status

Accepted (2026-08-27)
Amends: `specrunner/adr/2026-07-22-job-reopen-awaiting-archive.md` — D1 / D2 を改訂する

## Context

`2026-07-22-job-reopen-awaiting-archive.md`（以下「初期 ADR」）は `ReopenCommand` を
`CommandRunner` サブクラスとして実装し、`awaiting-archive → running` の遷移と
pipeline 再実行を単一コマンドに結合した（初期 ADR D1 / D2）。

この結合は、`resume` が持つ以下の入力・preflight を `reopen` がすべて欠いたまま
pipeline を起動するという責務境界の欠陥を生んだ:

| `resume` が提供する入力・機構 | `reopen` の状態 |
|---|---|
| `--prompt`（step への one-shot injection） | なし（`resumePrompt: undefined` を返す） |
| `--adopt-commits`（未 push commit の採用） | なし |
| `--apply-canon`（dirty protected 領域の採用） | なし |
| `--wontfix`（open finding の棄却） | なし |
| worktree dirty-state inspection | なし |
| ingress safety gate（branch fetch / revision 照合） | なし |

その結果、reopen 前に人間が変更を加えた場合の扱いが一貫しない:

| reopen 前の状態 | 旧挙動 |
|---|---|
| commit + push 済み | origin 上の既存 revision として暗黙に受け入れられる |
| commit 済み・未 push | egress ledger で `EGRESS_UNKNOWN_COMMIT` になり得る |
| 未 commit の変更 | ingress で検査されず、step の write-scope により混入・隔離・復元のいずれかになる |
| 別環境から PR branch に push | 既存 local worktree を fetch / update せず、古い checkout から実行し得る |

根本原因は「`reopen` が pipeline 実行まで所有しながら `resume` の実行契約を持っていない」こと。
`reopen --prompt` だけを追加すると次に `--adopt-commits` / `--apply-canon` 等も複製が必要になり、
二つの実行 entry point が継続的に乖離する。

### 前提とする変更

- **`2026-07-21-approval-revision-binding.md`**: commitOid 束縛による承認失効は変更なし。
  本変更は reviewerStatuses / conformance record を書き換えない。
- **`#1083` (archive 1 相化)**: `archive` が即 `archived` になるため、
  `awaiting-archive` で reopen 可能な窓は archive 実行前まで。本 ADR はこの新契約を前提とする。

---

## Decision

### D1: ReopenCommand を CommandRunner から切り離し standalone class として再実装する

**決定**: `ReopenCommand`（`src/core/command/reopen.ts`）の `extends CommandRunner` を除去し、
standalone class として再実装する。公開 API は `async execute(): Promise<number>` のみとし、
実行シーケンスは以下に限定する:

1. worktree guard（specrunner job worktree 内からの呼び出しを exit 2 で拒否）
2. slug による job 解決（terminal-only slug には exit 1 で拒否）
3. status gate（`awaiting-archive` 以外は exit 1 で拒否）
4. PR gate（PR なし・MERGED・CLOSED・API エラー → fail-closed で exit 1）
5. operator event の append（`appendOperatorEvent` を `persist` より先に完了）
6. `awaiting-archive → awaiting-resume` へ遷移し persist
7. 成功ログを出力して exit 0

`CommandRunner` の `prepare()` / `setupWorkspace()` / `buildDeps()` / `keepAlive` は
一切呼ばれない。pipeline / agent query / CLI step は起動されない。

constructor のシグネチャは `(slug: string, options: ReopenOptions)` のみ。
`RuntimeStrategy` と `EventBus` は依存から除去される。

**Rationale**: `CommandRunner` は pipeline 実行の Template Method である。
subclass として残すと、`prepare()` が常に pipeline 実行につながるという暗黙の前提が
将来の開発者に引き継がれ、override は脆弱な安全策に過ぎない。
継承を除去することで「ReopenCommand には pipeline を起動するコードパスが存在しない」ことが
構造的に保証される。

**却下した代替案**:

- *`execute()` を override して早期 return*: `CommandRunner.execute()` の前段
  （provider readiness gate・foreground notice・exit guard 登録）が引き続き実行される。
  将来の preamble 変更で副作用が再有効化されるリスクがある。
- *`prepare()` で即座に throw*: Template Method を乱用する。workspace / step /
  request / config 解決ロジックがすべて dead code になる。

---

### D2: REOPEN_TRANSITIONS のターゲットを `running` から `awaiting-resume` に変更する

**決定**: `src/state/lifecycle.ts` の `REOPEN_TRANSITIONS["awaiting-archive"]`
を `{ running }` から `{ awaiting-resume }` に変更する。`{ allowReopen: true }`
opt-in の仕組み（B-17）は維持される。`VALID_TRANSITIONS` と `canTransition` は変更しない。

transition patch は `{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: null }`。
pipeline プロセスが起動しないため `pid` は `null`（旧設計の `process.pid` から変更）。

reopen 後のジョブは `awaiting-resume` になる。`ResumeCommand.prepare()` は
既存の `VALID_TRANSITIONS["awaiting-resume"] = { running, canceled }` により
`awaiting-resume → running` を受け入れる。resume 側の遷移ロジックに変更は不要。

**Rationale**: `awaiting-resume` は「実行準備済みだが未実行」の正確な状態である。
`running` に遷移しながら pipeline を起動しないと、FSM の状態が実態と乖離する（`running` は
パイプラインが能動的に実行中であることを意味する）。`beforeExit` guard が即座に
`awaiting-resume` へ再遷移させるという余分なジャーナルエントリも発生しない。
また既存の status を再利用することで新 status の追加を回避できる。

**却下した代替案**:

- *`allowReopen` opt-in を廃止して `VALID_TRANSITIONS` に追加*:
  `canTransition` の全消費者に新 edge が公開され、PR gate / operator event 記録を
  迂回できる呼び出し元が増える。
- *`running` のまま pipeline のみスキップ*: FSM 不変条件（running = プロセス実行中）に違反。

---

### D3: `--from` を reopen から即時削除する（deprecation 期間なし）

**決定**: `ReopenOptions` / CLI flags / `REOPEN_USAGE` から `--from` を除去する。
CLI パーサーは `--from` を reopen に渡すと "unknown option" エラーで非 0 を返す。
`--from` は `job resume` 側にのみ存在する正本となる。

Actions workflow の `action=reopen` パスは同一 PR で更新し、`--from` を `job resume` へ渡す。

**Rationale**: `--from` は pipeline の再入ポイントを指定するフラグであり、
`reopen` が pipeline を起動していたときのみ意味を持っていた。pipeline 起動が除去された
今、`--from` に意味はない。唯一の既知の呼び出し元は Actions workflow であり、
同一 PR でアトミックに更新される。deprecation 期間は dead code を生むだけで
外部消費者への利益がない。

**却下した代替案**:

- *deprecation warning を出して値を no-op にする*:
  以前は必須だったフラグを暗黙に無視すると、オペレーターが `resume --from` を指定し忘れる原因になる。
- *`--from` を受け取って後続の resume 呼び出しに自動転送する*:
  subcommand 間の暗黙的なオプション転送は脆弱。reopen 時点で適切な target step が決まっていない場合もある。

---

### D4: OperatorEventRecord.fromStep を optional にする

**決定**: `src/store/event-journal.ts` の `OperatorEventRecord.fromStep` を
`fromStep: string` から `fromStep?: string` に変更する。新しい reopen イベントは
`fromStep` を含まない。既存の `events.jsonl` レコード（`fromStep` あり）は引き続き有効。

**Rationale**: `fromStep` は reopen 時の pipeline 再入 step を記録するフィールドだったが、
`--from` が `reopen` から除去されたため記録すべき step が存在しない。
optional 化は後方互換性を保つ最小変更であり、`fold()` リーダーは欠如フィールドを
absent として扱う既存の挙動でそのまま対応できる。

**却下した代替案**:

- *`fromStep: string | null`*: 明示的な `null` より field absence の方が意味的に正確。
- *フィールドを完全に削除*: 既存レコードの `fromStep` 値が `fold()` で再シリアライズ時に失われる。

---

### D5: Actions workflow で reopen と resume を明示的に compose する

**決定**: `.github/workflows/specrunner-dispatch.yml` の `action=reopen` ブランチを
2 コマンドの順次実行に変更する:

```bash
bun ./bin/specrunner.ts job reopen "$SLUG" --reason "$REASON"
bun ./bin/specrunner.ts job resume "$SLUG" --from "$FROM" [--prompt "$PROMPT"]
```

`reopen` が非 0 で終了した場合、`resume` は実行されない（bash の `set -e` / ステップ終了伝播）。
2 コマンド間に中間 commit / push は不要: `reopen` は `state.json` のみを更新し、
`resume` は同一 worktree の同一パスから読む。

`FROM` は引き続き `action=reopen` の required input として保持する（`resume` が必要とするため）。

**Rationale**: 2 つの明示的な CLI コマンドで workflow YAML に lifecycle / execution の
分離を可視化できる。`reopen → resume` の compose は自明に正しく、新しい workflow action や
job を追加する必要がない。`reopen` が途中で失敗すれば job は `awaiting-resume` に留まり
（回復可能な状態）、オペレーターが手動で `resume` するかワークフローを再実行できる。

**却下した代替案**:

- *`action=reopen-and-resume` を新設*:
  branch / slug 解決ロジックが `action=reopen` パスと重複する。

---

### D6: B-17 conformance 記述を更新する（invariant の機械的仕組みは維持）

**決定**: `architecture/conformance.md` の B-17 行テキストを
`awaiting-archive → awaiting-resume`（旧: `awaiting-archive → running`）に更新する。
enforcement 機構（`allowReopen: true` リテラルのファイル限定 grep + liveness check）は変更しない。

`core-invariants.test.ts` の B-17 テストは、`reopen.ts` が `{ allowReopen: true }` リテラルを
引き続き保持しているため（ターゲット status が変わっても call site は同じ）、コード変更なしで通過する。

**Rationale**: B-17 は呼び出し元を pin するものであり、遷移先 status を pin するものではない。
`{ allowReopen: true }` が `src/core/command/reopen.ts` にのみ存在する invariant は
本変更後も成立し続ける。prose 記述のみ更新が必要。

---

### D7（後付実装修正）: planner が `job reopen` 後に消費済み `/resume` コメントを再起動しないよう保護する

**決定**: `src/core/inbox/planner.ts` の `planResumes` 関数に `effectiveCutoff` ガードを追加する。

```
effectiveCutoff = max(cutoff（最新 escalation marker の timestamp）, job.updatedAt)
```

`job reopen` が `awaiting-archive → awaiting-resume` に遷移すると `job.updatedAt` が
reopen 時刻に更新される。その後の inbox poll で、古い（既に消費済みの）`/resume` コメントが
cutoff を超えているように見えても、`effectiveCutoff` が reopen 時刻になることで
再起動を防ぐ。

`job reopen` は新しい escalation marker コメントを投稿しないため、旧 cutoff のまま
inbox poll が走ると stale な `/resume` コメントが再活性化してしまう。
`updatedAt` を secondary cutoff として用いることで escalation marker の新規投稿なしに
スタンドアローンな保護を実現できる。

**Rationale**: `reopen` は pipeline を起動せず状態のみを遷移させる。
escalation marker を投稿しない設計との整合を保ちつつ、
stale comment の再消費というデグレを防ぐ最小の実装。

---

## Alternatives Considered

### Alternative A: resume のガードを緩和して awaiting-archive → running を許可する

`canTransition` の結果を変えるか `VALID_TRANSITIONS` に edge を追加して `resume` が
`awaiting-archive` から直接 `running` へ遷移できるようにする案。

- **Pros**: 専用の `reopen` コマンド拡張が不要。`--from` / `--prompt` 等の resume 入力をそのまま使える。
  operator は 1 コマンドで lifecycle 遷移と実行を完結できる。
- **Cons**: operator による明示的な audit record（`--reason` 必須・`operator-event` journal）が失われる。
  「`awaiting-archive` は証跡完結状態であり、再入には operator 記録が必要」という初期 ADR の設計方針に反する。
- **Why not**: 初期 ADR で却下済み（architect 評価済み）。`awaiting-archive` からの再入が
  operator の明示的意思決定なしに可能になることは、証跡完結状態の意味を損なう。

### Alternative B: reopen に --prompt / --adopt-commits 等を追加してコピーする

`reopen` に resume の全入力（`--prompt` / `--adopt-commits` / `--apply-canon` / `--wontfix`）を
複製し、pipeline 再実行まで内包し続ける案。

- **Pros**: 破壊的変更なし（`reopen --from` の呼び出し元に移行不要）。
  operator は 1 コマンドで完結でき、手順変更が最小。`reopen` 独自の前提条件ゲート
  （`awaiting-archive` 限定・PR gate）を resume に持ち込まずに済む。
- **Cons**: 2 つの実行 entry point が継続的に乖離するリスクが持続する。
  ingress safety gate のロジックが 2 箇所に分散し、`resume` 側の future 変更が
  `reopen` 側に伝播しない。`reopen --prompt` だけ追加すると次に
  `--adopt-commits` / `--apply-canon` 等も複製が必要になり、乖離が拡大し続ける。
- **Why not**: 本変更の根本問題（責務境界の欠陥）を解消しない。
  `resume` が唯一の実行 entry point であるという不変条件を確立することが目的であり、
  二頭体制を維持しては将来の継続的な乖離が避けられない。

### Alternative C: `--from` を deprecated として警告付きで受け取り暗黙に resume へ転送する

`reopen --from <step>` を引き続き受け付け、deprecation warning を出力したうえで
後続の `job resume --from <step>` 呼び出しに透過的に転送する案。

- **Pros**: 既存の Actions workflow / スクリプトを変更せずに移行できる。
  オペレーターが明示的な移行作業なしに新契約に段階的に対応できる。破壊的変更を回避できる。
- **Cons**: subcommand 間の暗黙的なオプション転送は脆弱。`reopen` が `resume` の
  インターフェースを知る必要が生じ、責務の境界が再び曖昧になる。
  reopen 時点で適切な target step が決まっていない場合に対処できない。
  deprecation 期間中は `reopen` に dead code が残る。
- **Why not**: `--from` の唯一の既知の呼び出し元は Actions workflow であり、
  同一 PR でアトミックに更新できる。外部消費者がいない状況での deprecation 期間は
  dead code を生むだけで利益がない。明示的な CLI エラーの方が operator を
  `resume --from` へ確実に誘導できる（design.md D3）。

---

## Consequences

### Positive

- **責務境界が明確**: `reopen` = lifecycle 遷移のみ、`resume` = pipeline 実行の唯一の entry point。
  将来の `resume` 入力追加（例: 新しい preflight flag）が自動的に reopen 後の再開にも適用される。
- **FSM の一貫性**: `awaiting-resume` への遷移がジョブの実際の状態（未実行）を正確に反映する。
- **worktree 安全**: reopen 後に人間が変更を加えた場合も、`resume --adopt-commits` /
  `resume --apply-canon` / `resume --wontfix` 等の既存 safety gate が単一の契約として適用される。
- **Actions 可視性**: workflow YAML で lifecycle 操作と実行操作が 2 行で分離され、
  reopen が失敗した場合の振る舞いが明確になる。
- **B-17 保持**: `{ allowReopen: true }` を用いた `awaiting-archive → awaiting-resume` の
  遷移は引き続き `src/core/command/reopen.ts` の単一 call site に限定される。

### Negative / Trade-offs

- **reopen 後のワンライナーが 2 コマンドになる**: Actions / 手動運用ともに
  `job reopen` と `job resume` を順番に呼ぶ必要がある。
- **`--from` の破壊的変更**: `reopen --from` を使っていた呼び出し元は
  `resume --from` に移行が必要（Actions workflow はアトミックに更新済み）。

### Known Gaps / Future Work

- merge 済み PR の reopen は引き続きスコープ外。
- `awaiting-archive` ジョブに対する直接 `resume`（reopen なし）の拒否は継続。
  直接実行したい場合は `reopen → resume` の 2 ステップが正規フロー。

---

## Affected Modules

- `src/core/command/reopen.ts` — standalone class に再実装（`CommandRunner` 継承を除去）
- `src/state/lifecycle.ts` — `REOPEN_TRANSITIONS` ターゲットを `awaiting-resume` に変更
- `src/cli/reopen.ts` — `bootstrap()` / `EventBus` / `RuntimeStrategy` 依存を除去
- `src/cli/command-registry.ts` — `reopen` subcommand flags から `from` を削除
- `src/store/event-journal.ts` — `OperatorEventRecord.fromStep` を optional に変更
- `src/core/inbox/planner.ts` — `planResumes` に `effectiveCutoff` ガードを追加
- `.github/workflows/specrunner-dispatch.yml` — `action=reopen` ブランチを 2 コマンド compose に変更
- `architecture/conformance.md` — B-17 行テキストを `awaiting-resume` に更新
- `src/core/command/guide.ts` — escalation 節を 2 ステップフロー（reopen → resume）に更新
- `tests/unit/architecture/core-invariants.test.ts` — B-17 JSDoc を更新（test ロジック変更なし）

---

## References

- Request: `specrunner/changes/split-reopen-from-resume/request.md`
- Design: `specrunner/changes/split-reopen-from-resume/design.md`
- Spec: `specrunner/changes/split-reopen-from-resume/spec.md`
- Amends: `specrunner/adr/2026-07-22-job-reopen-awaiting-archive.md`（D1 / D2 を改訂）
- Related: `specrunner/adr/2026-07-21-approval-revision-binding.md`（commitOid 束縛、変更なし）
- Related: `specrunner/adr/2026-06-10-inbox-auto-fire-inbound-transport.md`（planner の inbox 設計）
