# Design: readme-resume-command-fix

## Context

README.md の Troubleshooting 節「Silent exit」が、存在しない top-level コマンド
`specrunner resume` を 2 箇所で案内している。

- `README.md:411` — `` If `specrunner run` or `specrunner resume` exits unexpectedly... ``
- `README.md:418` — `` Run `specrunner resume <slug>` to continue. ``

CLI の実コマンドは `specrunner job resume <slug>` である。source of truth は
`src/cli/command-registry.ts` の `USAGE` 定数（`job resume <slug>  halted job を再開`）および
`COMMANDS.job.subcommands["resume"]`。top-level `resume` コマンドおよびその alias は存在しない
（top-level alias は `run` のみ）。

`README.md:411` と `:418` 以外に `specrunner resume` の表記は存在しない（grep 確認済み）。
同節の `awaiting-resume`（状態名）や `specrunner run`（別コマンド）は誤記ではないため触れない。

## Goals / Non-Goals

**Goals**:

- `README.md:411` / `:418` の `specrunner resume` を `specrunner job resume` に修正する
  （`:418` は `<slug>` 引数を保つ）
- 同じ誤記の再混入を防ぐ drift-guard 回帰テストを追加し、受け入れ基準
  「README に `specrunner resume` という表記が残っていない」を機械検証可能な不変条件として固定する

**Non-Goals**:

- README のその他の節の変更（scope 外）
- CLI への top-level `resume` alias の追加（scope 外。誤記は README 側を実コマンドに合わせて直す）
- `awaiting-resume` 状態名や `specrunner run` 表記の変更（誤記ではない）

## Decisions

### D1. README の 2 行を `specrunner job resume` に置換する（source of truth は command-registry の USAGE）

`README.md:411` の `specrunner resume` → `specrunner job resume`、
`README.md:418` の `specrunner resume <slug>` → `specrunner job resume <slug>` に修正する。
置換後の正しさは `src/cli/command-registry.ts` の `USAGE`（`job resume <slug>`）を正とする。

**Rationale:** CLI が提供する実コマンドが `job resume <slug>` であり、README をそれに合わせるのが
最小かつ正しい修正。`awaiting-resume` を含む `:418` の置換は部分文字列 `specrunner resume` のみを
対象とするため、状態名は影響を受けない。

**Alternatives considered:**

- CLI に top-level `resume` alias を追加して README を正とする案 → request の scope 外（「CLI への
  `resume` alias の追加」は明示的にスコープ外）。誤記側（README）を直す方が変更面積が小さく副作用がない。

### D2. drift-guard 回帰テストを `tests/unit/docs/` に追加する

`tests/unit/docs/readme-resume-command.test.ts`（新規）を追加し、README 本文が bare な
`specrunner resume` 表記を含まないことを assert する。正しい `specrunner job resume` は
部分文字列 `specrunner resume` を含まない（間に `job ` が入る）ため、修正後はテストが green、
誤記が再混入すると red になる。

**Rationale:** 本リポジトリの同日先行例 `tests/unit/docs/readme-pipeline-sync.test.ts`
（README ↔ STEP_NAMES drift guard）に倣い、README の正しさを test で固定するのが既存の慣習。
spec.md（pipeline が scaffold する必須ファイル）に書くべき Layer-1 behavior は「構造・型・FSM が
自動では強制しない選択」であり、README のコマンド表記の正しさはまさにそれに該当する。受け入れ基準
「README に `specrunner resume` という表記が残っていない」を一度きりの目視確認ではなく durable な
不変条件として encode する。

**Alternatives considered:**

- テストを追加せず 2 行の編集のみ行う案 → 受け入れ基準を満たすが、将来 silently 再混入しても検知
  できず、spec.md の Requirement を裏付ける enforcement が無くなる。回帰耐性のため却下。
- 既存 `readme-pipeline-sync.test.ts` に describe を追記する案 → 当該ファイルは STEP_NAMES drift
  guard が単一責務であり、コマンド表記の assert を混在させると名称と内容が乖離する。専用の新ファイルにする。

## Risks / Trade-offs

- **[Risk] 部分文字列マッチが `specrunner job resume` を誤検知する** → Mitigation: `specrunner job resume`
  は `specrunner resume` を部分文字列として含まないため誤検知しない。テストの assert 対象は bare
  `specrunner resume`（必要なら `/specrunner resume\b/` 等の境界つき regex）に限定する。
- **[Trade-off] 2 行 docs 修正に対して test 追加は変更面積を増やす** → Mitigation: 追加は小さな単一
  ファイルで、本リポジトリの README invariant の既存慣習に沿う。受け入れ基準の機械検証化という
  明確な便益がある。誤記訂正そのもの（D1）と独立しているため、test を外しても D1 は成立する。

## Open Questions

- なし（要件は request.md の受け入れ基準で確定。実装時に分岐が出れば spec-fixer / code-fixer ループで対応）
