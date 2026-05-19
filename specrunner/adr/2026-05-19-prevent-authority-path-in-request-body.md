# Request 作成フローへの Authority Path ガード: 直接埋め込みと LLM 検出の選択

**Date**: 2026-05-19
**Status**: accepted
**Issue**: #323

## Context

PR #294 で executor 側（implementer / spec-fixer）の authority path 直接編集ガード（`AUTHORITY_SPEC_GUARD` fragment）が実装された。しかし request 作成側（generate prompt / scaffold template / review prompt）に同等の防衛がなかったため、以下の連続事故が発生した。

| PR | request body の記述 | 結果 |
|----|---------------------|------|
| #289 | authority path を MODIFIED 対象として記述 | guard なし → spec-merge で escalation |
| #291 | 新規 authority path を ADDED 対象として記述 | 同型 escalation |
| #294 実装後 3 件 | 同じ pattern を繰り返し作成 | executor guard が halt させた（request 自体が無効） |

executor 側 guard が halt を引き起こすのは正しい動作だが、request 作成時点で書けてしまう限り同型の過ちが繰り返される。**create → execute の両段階で防衛する**ために request 作成側の防衛を追加する。

設計で解決すべき問題は 2 つ:

1. **authority path 禁止規律をどこに書くか**: 既存の `AUTHORITY_SPEC_GUARD` fragment に統合するか、各 prompt に直接埋め込むか
2. **request-review での検出方法**: 正規表現による静的検出か、LLM による自然言語判断か

## Decision

### 1. 各 prompt への直接埋め込み（fragment 分離しない）

`request-generate-system.ts` と `request-review-system.ts` のそれぞれに authority path 禁止規律を直接テキストとして追加する。`AUTHORITY_SPEC_GUARD` fragment には追加しない。

変更点:

| ファイル | 追加内容 |
|---------|----------|
| `src/prompts/request-generate-system.ts` | Output Rules セクションに「authority path を MODIFIED / ADDED の対象として直接記述してはならない。spec 変更は delta spec path で表現する」MUST ルール |
| `src/core/command/request.ts` `buildScaffoldTemplate` | delta spec path guidance コメントを scaffold に埋め込み（authority path を例文として書かない） |
| `src/prompts/request-review-system.ts` | authority path + 編集動詞共起を HIGH severity finding として検出するルール、および referential 記述の除外節 |

### 2. request-review の検出は LLM 判断（prompt 自然言語ルール）

authority path + 編集動詞（MODIFIED / ADDED / を更新 / を作成 等）の共起検出は、prompt に自然言語ルールを追加して LLM に判断させる。

例外節も自然言語で表現: 「authority path であり編集禁止」のような referential / policy 言及文脈は HIGH finding にしない。

### 3. テスト: string contains assertion

`tests/unit/command/request-review.test.ts` に `REQUEST_REVIEW_SYSTEM_PROMPT` が検出ルール本体と referential 除外節のテキストを含むことを確認する string contains assertion を追加する（既存の TC-RR-001〜010 と同パターン）。

## Alternatives Considered

### A: `AUTHORITY_SPEC_GUARD` fragment に request 作成側の規律を追加

既存の fragment を拡張し、`request-generate-system.ts` と `request-review-system.ts` にも inject する。

Rejected:
- `AUTHORITY_SPEC_GUARD` は executor 側 agent（implementer / spec-fixer / code-review 等）のフラグメントであり、「作る側の agent が spec を直接書くな」という文脈で設計されている。request 作成側の「request body 内に authority path を書くな」は関心事が異なる（対象は LLM が生成するコードではなく、LLM / ユーザーが書く request の内容）。
- fragment に統合すると、executor 向け inject テーブル（`fragment-coverage.test.ts`）に request-generate / request-review を追加する必要が生じ、executor 文脈とは無関係なファイルが fragment 適用対象に混入する。
- request-generate と request-review それぞれで必要なルールは短く（各 1 ルール）、fragment に切り出す再利用性がない（YAGNI）。

### B: `request validate` コマンドへの正規表現検出追加（dsv 拡張）

`src/core/spec/rules/` に request body 内の authority path 表記を検出する rule を追加し、静的に弾く。

Rejected:
- `request validate` はファイルの構造的妥当性（frontmatter, type, slug 等）を検証する責務。request body の記述内容（path 表記の意味的適切さ）まで静的に検出するのは別の責務であり、dsv 拡張として独立した設計議論が必要（スコープ外）。
- request-review はすでに LLM が request.md 全体を読んでレビューする仕組み。同じ情報を二重に parse する必要はなく、prompt ルールだけで検出できる。

## Consequences

### Positive

- request-generate / request-review の防衛規律が、executor 側 guard（`AUTHORITY_SPEC_GUARD`）から独立して管理される。executor 文脈の変更が request 作成側に波及しない。
- `fragment-coverage.test.ts` の inject テーブルを汚染しない。request-generate と request-review は fragment 適用対象に追加しない。
- request-review の LLM 判断は referential 除外を自然言語で表現できる。正規表現では除外節の表現が困難（「body 内で authority path を説明している」かどうかはコンテキスト依存）。
- string contains assertion により、prompt から検出ルールが削除された場合を regression test が検知する。

### Negative

- 「authority path を request body 内に書いてはならない」という規律が複数箇所に分散する: request-generate-system.ts / request-review-system.ts / `AUTHORITY_SPEC_GUARD`（executor 側）。各ファイルを個別に管理する必要がある。
- LLM 判断は決定論的でないため、境界ケース（referential か編集指示かの判定）で false positive / false negative が生じる可能性がある。静的検出（dsv 拡張）は別途検討が必要。

### Known Design Debt

- dsv 拡張（`request validate` で request body 内 path 表記を静的検出）は未実装。LLM 検出の補完として将来追加する余地がある。

## Files Changed

| File | Change |
|------|--------|
| `src/prompts/request-generate-system.ts` | MODIFIED: Output Rules に authority path 禁止 MUST ルール追加 |
| `src/core/command/request.ts` | MODIFIED: `buildScaffoldTemplate` に delta spec path guidance コメント追加 |
| `src/prompts/request-review-system.ts` | MODIFIED: authority path + 編集動詞共起の HIGH finding 検出ルールと referential 除外節追加 |
| `tests/unit/command/request-review.test.ts` | MODIFIED: TC-RR-011 / TC-RR-012 string contains assertion 追加 |
| `specrunner/changes/prevent-authority-path-in-request-body/specs/request-authoring-guard/spec.md` | NEW delta spec |
