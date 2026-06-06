# Design: run / resume の終端結果を機械可読な --json 契約で出す

## Context

`run` / `resume` の終端処理は `handleResult`（`src/core/command/runner.ts:244`）に集約されている。
ここが `JobState.status` を exit code に写像している:

- `awaiting-archive`（PR 生成・正常終了）→ exit 0
- `awaiting-resume`（escalation / loop 枯渇 / 安全網による halt）→ exit 1
- `failed`（恒久失敗）→ exit 1

結果（PR URL・停止事由・次アクション）は人間向け文字列でのみ出力される。`handleResult` は
`logInfo` / `logError` / `stderrWrite` しか使っておらず、これらは **すべて stderr** に書く
（`src/logger/stdout.ts`：`logInfo`/`logError`/`logWarn`/`stderrWrite` は `process.stderr.write`、
stdout に書くのは `stdoutWrite` / `logResult` のみ）。つまり **run / resume の終端で stdout は現状空** である。

このため CI など無人の起動側が「PR ができたのか / 人の判断を待っているのか / 恒久的に失敗したのか」を
**exit code だけでは区別できない**（`awaiting-resume` と `failed` がどちらも exit 1 に潰れている）。
区別するには stderr の人間向け文字列を grep するしかなく、終端を機械可読に判別できない。

`doctor`（`src/cli/doctor.ts`）と `request review`（`src/core/command/request-review.ts`）は既に `--json` を持ち、
「機械向け結果は stdout に JSON、人間向けは別系統」というパターンを確立している。本変更はこのパターンを
`run` / `job start` / `resume` に一貫適用する。

### 終端の発生箇所（execute 内）

`run` / `resume` は `CommandRunner.execute()`（`runner.ts:84`）を共有する。job state 生成後に終端しうる箇所は次の4つ:

1. `setupWorkspace` 失敗 → `store.fail(... WORKSPACE_SETUP_FAILED)` → return 1（`runner.ts:120`）
2. `buildDeps` / `registerCleanup` 失敗 → `store.fail(... INIT_FAILED)` → return 1（`runner.ts:171`）
3. pipeline throw（crash）→ disk state を `failed` に落とし `outputPipelineThrowError` → return 1（`runner.ts:189`）
4. `handleResult`（normal return）→ `awaiting-archive` / `awaiting-resume` / `failed`（`runner.ts:209`）

`awaiting-resume`（status）に潰れている事由のうち、escalation と loop 枯渇は pipeline が `resumePoint` を付けて
正常 return する（`src/core/pipeline/pipeline.ts:287` / `:487`）ため `handleResult` の `awaiting-resume` 分岐に到達する。
一方 crash（pipeline throw）は (3) の catch 経路に分岐して status=failed として扱われ、signal 中断は process が
落ちるため終端 JSON を出す前に消える（exit-guard が disk を `awaiting-resume` にするのは次回 resume 用の永続化のみ）。
よって `handleResult` に届く `awaiting-resume` は常に「人が判断・再実行すべき」終端である。

### job 生成前の失敗（契約対象外の前提）

preflight 失敗（config 欠落・auth・引数エラー等：`src/cli/run.ts:60`）や resume の prepare 検証ゲート
（job 未検出・running 中・連続 escalation：`src/core/command/resume.ts`）は job state（jobId / slug / step）が
確定する前に終端する。終端 JSON は jobId / slug / step を必須とするため、これら「起動に失敗した」ケースは
本契約の対象外とし、現行の exit code（1 / 2）と stderr メッセージを不変に保つ。

## Goals / Non-Goals

**Goals**:

- `run`（alias）/ `job start`（canonical）/ `resume` に `--json` フラグを追加し、終端結果を構造化 JSON で
  stdout に出力する。
- JSON が終端の種別を機械可読に表す: `pr-created` / `awaiting-human` / `failed`。
- JSON に終端判定の最小情報を含める: 種別・PR URL（あれば）・slug・jobId・停止 step・停止事由（あれば）。
- exit code（0 / 1 / 2）を不変に保つ。種別は JSON field で表す。
- `--json` 未指定時の人間向け出力（stderr の現行文字列）を完全に不変に保つ。
- status → 種別 の写像を 1 箇所に集約し、4 つの終端箇所で同じ写像を再利用する。

**Non-Goals**:

- exit code の多値化（`EXIT_CODE` 契約・`run || exit 1` 前提を壊さない）。
- `awaiting-resume` の内部表現（discriminated union 化等）の再設計。state スキーマは変えない。
- `job ls` / `job show` の `--json`。
- 本契約を消費する CI / GitHub Actions 側の定義（別 request の責務）。
- 人間向け出力の文言・出力先（stderr）の変更。

## Decisions

### D1: 終端契約は exit code でなく stdout JSON で表す

種別（pr-created / awaiting-human / failed）は exit code ではなく JSON の field で表現する。exit code は
現行の 0 / 1 / 2 を据え置く。

- **Rationale**: exit code を増やすと `EXIT_CODE`（`src/errors.ts`）の既存契約と、`run || exit 1` 前提で呼ぶ
  既存スクリプトが壊れる。stdout が現状空であること（Context 参照）から、JSON 追加は既存出力と衝突しない。
  `doctor` / `request review` が確立した「機械向け＝stdout JSON、人間向け＝別系統」を一貫適用するだけで、
  新しい抽象を導入しない。
- **Alternatives considered**:
  - (a) exit code を種別ごとに分ける（例: awaiting-human=3）— `EXIT_CODE` 契約と `run || exit 1` を破壊。Non-Goal。
  - (b) stderr に JSON を混ぜる — 人間向け progress と機械向け結果が同じ stream に混在し、grep 不要という利点が消える。

### D2: status → 種別 の写像を純粋関数 1 つに集約する

`src/core/command/run-result.ts` を新設し、`JobState` を受けて契約オブジェクトを返す純粋関数
`buildRunResult(state, slug)` を置く。`handleResult` と execute 内の他 3 終端は、この 1 関数を呼んで
契約を組み立てる。写像ロジック（status → 種別、停止事由の抽出）はこの関数にのみ存在する。

- **Rationale**: 現在 status → exit code を決めているのは `handleResult` の 1 点。種別の写像も同じ概念なので、
  写像を散らさないために純粋関数に集約する。crash / setup / init 失敗は `handleResult` に到達しない別経路だが、
  人間向け出力の経路が終端ごとに異なる（crash は `outputPipelineThrowError` が hint 付きで出す等）ため、
  「呼び出し位置」ではなく「写像関数」を単一の真理とする。純粋関数なので LLM 不要の決定的テストが書ける。
- **Alternatives considered**:
  - (a) crash / setup / init 失敗も failed state を合成して `handleResult` に流し、呼び出し位置まで 1 点化する —
    終端ごとに異なる人間向け出力（hint 等）を `handleResult` に集約すると分岐が増え、「人間向け出力不変」を
    壊すリスクが上がる。写像の集約という本質を満たさないので不採用。
  - (b) 各終端に写像を直書きする — 写像が 4 箇所に分散し、種別の取りこぼし・不整合を招く。Rationale に反する。

### D3: 終端契約の JSON スキーマ

`buildRunResult` が返す契約オブジェクトの形:

```jsonc
{
  "schemaVersion": 1,
  "result": "pr-created" | "awaiting-human" | "failed",
  "slug": "<request slug>",
  "jobId": "<job uuid>",
  "step": "<停止時の step 名>",
  "prUrl": "<PR の URL>" | null,
  "reason": { "code": "<error code>" | null, "message": "<停止事由>" } | null
}
```

- field は request の「終端判定に必要な最小情報」に対応する: 種別=`result`、PR URL=`prUrl`、`slug`、`jobId`、
  停止 step=`step`、停止事由=`reason`。
- `prUrl` は `state.pullRequest?.url ?? null`。`reason` は停止事由が無ければ `null`。
- **Rationale**: 要件 3 を最小構成で満たす。CI 側は `result` を読めば exit code に依存せず終端を判別できる。
- **Alternatives considered**: PR の number / createdAt 等も含める — request は「PR URL」のみを要求しており最小構成を逸脱。不採用。

### D4: schemaVersion を契約に含める

契約 JSON のトップに `schemaVersion: 1` を含める。

- **Rationale**: 本 JSON は CI が無人で消費する**契約**であり、将来 field を追加した際に消費側がバージョンを
  検出できる必要がある。固定の 1 リテラルで開始する。
- **Alternatives considered**: バージョン無し — 契約進化時に消費側が形を判別できず、無人連携の壊れ方が静かになる。不採用。

### D5: 種別の写像規則と停止事由の抽出

`buildRunResult` の写像:

| status | result | step | reason |
|--------|--------|------|--------|
| `awaiting-archive` | `pr-created` | `state.step` | `null` |
| `awaiting-resume` | `awaiting-human` | `state.resumePoint?.step ?? state.step` | `{ code: state.error?.code ?? null, message: state.resumePoint?.reason ?? state.error?.message ?? "awaiting human judgment" }` |
| それ以外（`failed` 等） | `failed` | `state.step` | `{ code: state.error?.code ?? null, message: state.error?.message ?? "unknown error" }` |

crash（pipeline throw）終端は in-memory state を持たないため、写像入力として
`{ status: "failed", step: <jobState.step>, error: <thrown error から code/message> }` 相当を渡し、同じ規則で
`failed` を導出する（写像関数は status / error / resumePoint のみ参照する純粋関数なので、合成入力でも一貫する）。

- **Rationale**: 要件 2・architect 評価。escalation / loop 枯渇は status=`awaiting-resume`（resumePoint 付き）で
  return されるため `awaiting-human` に、crash / 恒久 `failed` は `failed` に写る。事由の区別は state スキーマを
  変えず、出力時に `resumePoint` / `error` から導出するに留める。
- **Alternatives considered**: `resumePoint.iterationsExhausted` 等で escalation と loop 枯渇をさらに細分して
  別種別にする — 要件は両者を共に `awaiting-human` とするため不要。種別を増やすと消費側契約が複雑化。不採用。

### D6: `--json` フラグの配線

`--json`（boolean）を command registry の `run`（alias）と `job start`（canonical）と `job resume` の各 flags に
定義する。値は CLI entrypoint → command の options → `prepare()` の返す `PrepareResult.json` を経由して
`execute()` / `handleResult` に届ける。

- 配線経路:
  - `src/cli/command-registry.ts`: 各エントリの `flags` に `json: { type: "boolean" }` を追加し、
    `runRun` / `runResume` に `json` を渡す。
  - `src/cli/run.ts`（`PipelineRunOptions`）/ `src/cli/resume.ts`（`ResumeOptions`）に `json` を追加し、command へ伝播。
  - `src/core/command/pipeline-run.ts` / `src/core/command/resume.ts` の `prepare()` が `PrepareResult.json` を設定。
  - `src/core/command/runner.ts`: `PrepareResult` に `json?: boolean` を追加し、`execute()` が読む。
- **Rationale**: `run` と `job start` は別 registry エントリだが `runRun` を共有する。flag は両エントリに定義しつつ、
  出力処理自体は `execute()` の共有経路で 1 回だけ実装する。`PrepareResult` 経由の伝播は既存の `resumePrompt`
  （`runner.ts:63`）と同じ仕組みで、新しい配線抽象を増やさない。
- **Alternatives considered**: parser のグローバル flag にする — `--json` は run/resume の終端契約に限定するため、
  command 単位の flag 定義に留める（Non-Goal: job ls/show には足さない）。

### D7: emission は 4 終端で行い、`--json` off では stdout に何も書かない

`execute()` の 4 終端（setupWorkspace 失敗 / init 失敗 / crash / handleResult）で、`json` が true のときだけ
`buildRunResult(...)` の結果を `stdoutWrite(JSON.stringify(contract, null, 2) + "\n")` で stdout に 1 回出力する。
人間向け出力（stderr）の呼び出しは現状のまま全て残す。`json` が false のときは stdout に一切書かない。

- **Rationale**: 要件 1・5。`doctor` / `request review` と同じ `stdoutWrite(... + "\n")` 形式で出力する。
  人間向け出力は stderr に分離済みなので、JSON を stdout に足しても人間向け出力は不変。`--json` off では
  stdout が現状どおり空に保たれる。job 生成前の失敗（Context 参照）は終端 JSON の対象外。
- **Alternatives considered**: `--json` 時に人間向け stderr 出力を抑止する — 要件は「機械向け=stdout / 人間向け=stderr」の
  分離であり、stderr 抑止は要求されていない。stderr はそのまま残すほうが診断にも有用で、stdout の JSON 契約は汚れない。不採用。

## Risks / Trade-offs

- [Risk] `run` / `job start` の 2 エントリのどちらかに `--json` flag 定義を入れ忘れると、その経路で
  `Unknown flag(s): --json`（`src/cli/flag-parser.ts:87`）で落ちる。
  → Mitigation: spec の Scenario で両エントリの flag 受理を要求。T-02 で両エントリへの定義を明示し、テストで両経路を検証。
- [Risk] stdout に人間向け文字列が混ざると JSON 契約が壊れる。
  → Mitigation: `handleResult` は現状 stderr のみ（Context で確認済み）。T-04 で「`--json` 時 stdout は単一の有効 JSON のみ」を assert。
- [Risk] crash 終端は in-memory の終端 state を持たないため、合成入力の step / reason が実際とズレる可能性。
  → Mitigation: D5 のとおり crash は常に `failed`・`step` は `jobState.step`・`reason` は thrown error から導出と固定。
    決定的に検証可能。
- [Risk] `--json` 未指定時の出力が回帰する。
  → Mitigation: 既存 `cli-run-verdict.test.ts` / `runner.test.ts` の human-output assertion を維持し、
    T-04 で `--json` off 時 stdout が空であることを追加 assert。

## Open Questions

なし（ブロッキングなし）。`reason.message` の既定文言（停止事由が空のときのフォールバック文字列）は
implementer が決定してよい。唯一の制約は raw な人間向け文章を `result` / `step` 等の構造 field に混ぜないこと。
