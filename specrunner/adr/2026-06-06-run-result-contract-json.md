# run / resume 終端契約：機械可読 --json 出力で終端種別を表す

**Date**: 2026-06-06
**Status**: accepted

## Context

`run` / `resume` の終端は `handleResult`（`src/core/command/runner.ts`）に集約されており、`JobState.status` を exit code に写像していた。

- `awaiting-archive`（PR 生成・正常終了）→ exit 0
- `awaiting-resume`（escalation / loop 枯渇 / 安全網 halt）→ exit 1
- `failed`（恒久失敗）→ exit 1

`awaiting-resume` と `failed` がどちらも exit 1 に潰れており、CI などの無人起動側は「PR ができたのか / 人の判断を待っているのか / 恒久的に失敗したのか」を exit code だけでは区別できなかった。終端結果（PR URL・停止事由）は人間向け文字列として stderr にのみ出力され、run / resume の終端で stdout は空であった。

`doctor` / `request review` は既に「機械向け結果は stdout JSON、人間向けは別系統」というパターンを確立していた。本変更はこのパターンを run / job start / resume に一貫適用し、CI 連携の前提となる終端の機械可読契約を定める。

## Decision

### D1: 終端種別は exit code でなく stdout JSON の field で表す

終端の種別（`pr-created` / `awaiting-human` / `failed`）は exit code の増値ではなく、`--json` 指定時に stdout に出力する JSON の `result` field で表現する。exit code は現行の 0 / 1 / 2 を据え置く。

`--json` 未指定時は stdout に終端 JSON を出力しない（人間向け出力は従来どおり stderr に保たれる）。

- **Rationale**: exit code を増やすと `EXIT_CODE`（`src/errors.ts`）の既存契約と、`run || exit 1` 前提で呼ぶ既存スクリプトが壊れる。stdout が現状空であることから、JSON 追加は既存出力と衝突しない。`doctor` / `request review` が確立した stdout / stderr 分離パターンの一貫適用であり、新しい抽象を導入しない。
- **Alternatives considered**:
  - exit code を種別ごとに分ける（例: `awaiting-human=3`）— `EXIT_CODE` 契約と `run || exit 1` を破壊。不採用。
  - stderr に JSON を混ぜる — 人間向け progress と機械向け結果が同一 stream に混在し、契約の分離が消える。不採用。

### D2: status → 種別の写像を純粋関数 1 つに集約する

`src/core/command/run-result.ts` を新設し、`JobState` を受けて契約オブジェクトを返す純粋関数 `buildRunResult(state, slug)` を置く。`handleResult` と execute 内の他 3 終端（setupWorkspace 失敗 / init 失敗 / pipeline crash）はすべてこの 1 関数を呼んで契約を組み立てる。写像ロジックはこの関数にのみ存在する。

- **Rationale**: 写像を散らさないことで、種別の取りこぼし・不整合を防ぐ。純粋関数なので LLM 不要の決定的テストが書ける。
- **Alternatives considered**:
  - 各終端に写像を直書きする — 写像が 4 箇所に分散し不整合を招く。不採用。
  - crash / setup / init 失敗を `handleResult` に流して呼び出し位置まで 1 点化する — 終端ごとに異なる人間向け出力（hint 等）の集約で分岐が増え「人間向け出力不変」を壊すリスクがある。不採用。

### D3: 終端 JSON スキーマ（schemaVersion: 1）

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

`schemaVersion` は固定の `1` リテラルで開始する。本 JSON は CI が無人で消費する契約であり、将来 field を追加した際に消費側がバージョンを検出できる必要があるため、バージョンなし形式は不採用とした。

### D4: 種別の写像規則

| status | result | step | reason |
|--------|--------|------|--------|
| `awaiting-archive` | `pr-created` | `state.step` | `null` |
| `awaiting-resume` | `awaiting-human` | `state.resumePoint?.step ?? state.step` | resumePoint / error から導出 |
| それ以外（`failed` 等） | `failed` | `state.step` | error から導出 |

`awaiting-resume` に潰れている事由のうち、escalation と loop 枯渇は status=`awaiting-resume`（resumePoint 付き）で return されるため `awaiting-human` に写る。state スキーマは変えず、出力時に `resumePoint` / `error` から導出するに留める。

job 生成前の失敗（preflight / 引数エラー等）は jobId / slug / step が確定しないため本契約の対象外とし、現行の exit code と stderr メッセージを不変に保つ。

## Alternatives Considered

### Alternative 1: exit code を種別ごとに多値化する（例: awaiting-human=3）

- **Pros**: `--json` フラグ追加なしで消費側が exit code だけで種別を判別できる。シェルスクリプトとの親和性が高い。
- **Cons**: `EXIT_CODE`（`src/errors.ts`）の既存契約を壊す。`run || exit 1` 前提で呼ぶ既存スクリプトが静かに誤動作する。exit code の意味論は CLI の公開 API であり、後方互換を破る変更はリリース管理コストが高い。
- **Why not**: 既存スクリプトへの破壊的影響が許容できない。stdout が現状空であることから JSON 追加は衝突しない（D1 採用）。

### Alternative 2: stderr に JSON を混ぜる

- **Pros**: 出力先を増やさず、既存の stderr 経路に乗せるだけで実装できる。
- **Cons**: 人間向け progress と機械向け結果が同一 stream に混在し、消費側が JSON を抽出するために結局 grep が必要になる。契約の目的（stderr grep 不要化）が達成されない。
- **Why not**: stdout / stderr の分離（機械向け=stdout、人間向け=stderr）が `doctor` / `request review` で既に確立されており、この不変条件を壊す。

### Alternative 3: 写像ロジックを各終端に直書きする

- **Pros**: 新ファイル（`run-result.ts`）を作らず、各終端のその場で種別を決めるだけで実装できる。コード量が少ない。
- **Cons**: 写像規則が 4 終端（handleResult / setupWorkspace 失敗 / init 失敗 / pipeline crash）に分散し、種別の取りこぼし・不整合が生じやすい。将来の種別追加時に全箇所の更新が必要になる。
- **Why not**: 写像を 1 関数に集約することで純粋関数テストが書け、不整合のリスクを排除できる（D2 採用）。

### Alternative 4: --json をグローバル flag にする（全サブコマンド共通）

- **Pros**: `run` / `job start` の両エントリへの個別定義が不要になり、flag 定義漏れのリスクが消える。
- **Cons**: 本変更のスコープは run / resume の終端契約に限定されており、`job ls` / `job show` への `--json` は別 request の責務。グローバル化すると未実装コマンドで `--json` を渡したときの挙動が未定義になる。
- **Why not**: コマンド単位の flag 定義に留めることで、各コマンドが自身の出力契約を独立に定義できる（D6 採用）。

### Alternative 5: --json 指定時に人間向け stderr 出力を抑止する

- **Pros**: 機械向けの消費側が stderr を無視すればよいという前提を明示できる。出力が整理される。
- **Cons**: 診断情報（halt のヒント・error detail）が消え、CI ログでの問題調査が困難になる。要件は「機械向け=stdout / 人間向け=stderr の分離」であり、stderr 抑止は要求されていない。
- **Why not**: stderr はそのまま残すほうが診断に有用で、stdout の JSON 契約は stderr の内容に左右されない（D7 採用）。

## Consequences

### Positive

- CI など無人の起動側が `result` field を読むだけで終端種別を判別でき、stderr grep が不要になる。
- exit code 契約（0 / 1 / 2）・`run || exit 1` 前提のスクリプトはすべて不変。
- 写像ロジックが `buildRunResult` 1 点に集約され、決定的テストで検証できる。
- `doctor` / `request review` との出力チャネル設計が統一される。

### Negative

- `run`（alias）と `job start`（canonical）の両エントリに `--json` flag を定義する必要があり、片方への定義漏れが `Unknown flag` エラーを引き起こす。

### Known Debt / Deferred

- `awaiting-resume` の discriminated union 化（事由別の内部表現の再設計）は本変更のスコープ外。`resume-simplify` request で別途対処する。
- `reason.message` のフォールバック文言は実装者が決定（構造 field への人間向け文章の混在のみ禁止）。

## References

- Request: `specrunner/changes/run-result-contract-json/request.md`
- Design: `specrunner/changes/run-result-contract-json/design.md`
- Spec: `specrunner/changes/run-result-contract-json/spec.md`
- Implementation: `src/core/command/run-result.ts`・`src/core/command/runner.ts`・`src/cli/command-registry.ts`
- Related: `specrunner/adr/2026-05-27-cli-output-channel-unification.md`（stdout / stderr 分離の先行決定）
