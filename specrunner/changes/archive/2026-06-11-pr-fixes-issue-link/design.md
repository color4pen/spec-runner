# Design: PR の Fixes 行を job state の issueNumber から導出する

## Context

issue 起点の job（inbox / `--issue` 経由）は、PR が merge されたときに起点 issue が GitHub の
自動 close 機能で閉じられることを期待している。これにより job の完了状態を issue の open/closed で
一覧できる。しかし現状の PR body 生成は起点 issue 番号を反映していない。

現状コードの制約:

- `renderPrBody`（`src/core/pr-create/body-template.ts:72-74`）は `parsedRequest.issue` が設定されて
  いる場合のみ `Fixes ${parsedRequest.issue}` を出力する。`parsedRequest.issue` は request.md の Meta
  `- **issue**: <値>` から抽出した文字列で、`#` を含む形（例 `"#264"`）で保持される（`src/parser/types.ts`
  の JSDoc・`src/parser/request-md.ts:116-125`）。このため出力には `#` を再付与していない。
- `renderPrBody` は既に第 2 引数で `jobState: JobState` を受け取っている（`src/core/step/pr-create.ts:33`
  が `renderPrBody({ parsedRequest: deps.request, jobState: state, slug })` を呼ぶ）。よって issueNumber
  参照のための signature 変更・呼び出し側変更は不要。
- `JobState.issueNumber`（`src/state/schema.ts:232`）は `number | null` の optional フィールド。
  `--issue` / inbox 起動時に起点 issue 番号（正の整数）が設定され、未設定 job では undefined のまま。
  `validateJobState`（schema.ts:422-428）は present 時に「正の整数」を強制するため、設定済みの値は
  必ず `> 0` であり 0・負数・非整数は state load 段階で排除される。
- `renderPrBody` は純粋関数で、import は `parser`・`state/schema`・`util/paths`・`config/type-config`
  等の同層 / shared-kernel のみ。本変更は新規 import を伴わず、DSM 閉包に影響しない。

## Goals / Non-Goals

**Goals**:

- PR body の Fixes 行を、`jobState.issueNumber` を優先源として導出する。
- `issueNumber` がある job では `Fixes #<issueNumber>` を出力し、merge による issue 自動 close を成立させる。
- `issueNumber` が無い場合は従来どおり `parsedRequest.issue` を使い、出力を変えない（regression なし）。
- どちらも無い場合は Fixes 行を出力しない。

**Non-Goals**:

- issue の close を archive ステップや API 呼び出しで明示的に行う機構（close は GitHub の merge 時動作に委ねる）。
- `issueNumber` の設定経路（`--issue` フラグ / inbox 配線）の変更（既存挙動を前提とする）。
- `renderPrBody` の signature 変更・`pr-create` step の変更（jobState は既に渡っている）。
- `parsedRequest.issue` 側の出力形式の正規化（`#` 有無の整形等。従来出力を維持する）。

## Decisions

### D1: Fixes 行の導出源は `jobState.issueNumber` を優先し、無ければ `parsedRequest.issue` にフォールバックする

`renderPrBody` の Fixes 行生成（body-template.ts:72-74）を 3 分岐に置き換える。

1. `jobState.issueNumber` が設定済み（非 null / 非 undefined）→ `Fixes #${jobState.issueNumber}`
2. 上記が無く `parsedRequest.issue` が設定済み → 従来どおり `Fixes ${parsedRequest.issue}`
3. どちらも無い → Fixes 行を出力しない

**Rationale**: `issueNumber` は job が実際に紐付く起点 issue（inbox / `--issue`）の SSOT であり、
merge 時に閉じるべき issue を指す。request.md の `issue` フィールドは作成者の自己申告で、issue 起点 job
では空のことがある。「実際に紐付く issue」を優先することで、要件 1（issueNumber を持つ job で Fixes が
出る）と要件 2（無ければ従来挙動）を両立できる。

**Alternatives considered**:

- `parsedRequest.issue` を優先し issueNumber をフォールバックにする → issue 起点 job では request.md の
  issue が空なため Fixes が出ず、本 request の主目的（merge での自動 close）を達成できない。却下。
- 両方を出力する（`Fixes #<issueNumber>` と `Fixes <issue>` を併記）→ 異なる issue を指す場合に重複・
  矛盾した close を引き起こす。単一の優先源に絞る。却下。

### D2: 「設定済み」判定は `!= null`（null / undefined 双方を不在扱い）で行う

`jobState.issueNumber` は `number | null | undefined` を取りうる。判定は `state.issueNumber != null`
（loose 比較で null・undefined を同時に弾く）を用いる。

**Rationale**: 真偽値判定（truthy check）だと `0` を不在扱いするが、`validateJobState` が present 時の
issueNumber を正の整数に強制するため `0` は load 段階で到達しない。それでも `!= null` を使うのは、
「数値の有無」という意図を型に依存せず明示するためで、将来 validation が緩んでも 0 を誤って出力しない
防御になる。

**Alternatives considered**:

- `typeof state.issueNumber === "number"` → 同等に機能するが、`!= null` の方が「optional フィールドの
  有無判定」という慣用に沿い、コードベース内の `noWorktree` 等の optional 判定と整合する。
- truthy check（`if (state.issueNumber)`）→ `0` を取りこぼす理論的バグの余地を残すため不採用。

### D3: 出力形式は issueNumber 側のみ `#` を明示付与する

issueNumber は bare な数値のため `Fixes #${jobState.issueNumber}` と `#` を明示的に付ける。
`parsedRequest.issue` 側は文字列が既に `#` を含む前提で従来どおり `Fixes ${parsedRequest.issue}` を
維持し、出力を変えない。

**Rationale**: 受け入れ基準が `Fixes #<issueNumber>`（# 付き）と「request.md 経由は従来の出力を維持」を
それぞれ求めるため、2 分岐で `#` の扱いを分ける。GitHub の auto-close は `Fixes #<n>` 形式を要求する。

**Alternatives considered**:

- 両分岐を共通整形（`#` 正規化）に統一 → `parsedRequest.issue` の出力が変わり Non-Goal（従来維持）に
  反する。分岐ごとに既存の文字列前提を尊重する。

## Risks / Trade-offs

- **[issueNumber と request.md の issue が異なる値を指す]** issue 起点 job で request.md に別 issue を
  書いた場合、出力は issueNumber 側になる → Mitigation: 「job が実際に紐付く issue」を優先する D1 の
  意図どおりの挙動。merge で閉じるべきは起点 issue であり、これが正しい。
- **[`parsedRequest.issue` が `#` を欠く文字列だった場合]** 従来から `Fixes 264`（# なし）と出力される
  既存挙動が残る → Mitigation: 本 request の Non-Goal。issue 起点 job は issueNumber 分岐を通るため影響
  せず、request.md 経由分岐の整形は別 request の対象とする。
- **[既存テストへの影響]** 既存の `body-template.test.ts` の Fixes 系テストは issueNumber 未設定前提で
  あり、precedence 追加後も通る（issueNumber 未設定 → 従来分岐）→ Mitigation: 既存ケースを壊さず、
  precedence と issueNumber 分岐のケースを追記する。

## Open Questions

- なし（要件・受け入れ基準が一意に挙動を確定しており、未解決の設計判断は無い）。
