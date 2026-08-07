# Design: core の検証済み死コードを削除する

## Context

コードベース監査 + request-review の fact-check attestation により、core 周辺に死コード（本番参照ゼロ・専用 test のみ参照）が蓄積していることが確認された。削除対象はすべて「専用 test 含め参照ゼロにできる」か「専用 test ごと削除する」かのいずれかが attestation 済みである。

削除カテゴリは 5 種類に大別される:

1. **finish モジュール** — `resolve-target.ts`・`pr-status.ts`・`types.ts` の不要 export（`FinishFs` は archive で使用中のため残す）
2. **errors.ts ファクトリ 7 個 + 対応 ERROR_CODES 7 個** — 本番呼び出しゼロ。`BRANCH_NOT_REGISTERED`・`STATE_FILE_INVALID` の CODE 自体は本番で直接使われるため残す
3. **barrel / tombstone ファイル 4 本** — importer ゼロ（`core/event/index.ts`・`core/step/index.ts`・`store/index.ts`・`state/store.ts`）
4. **ディレクトリ削除 2 件** — `core/tools/`（1 行 re-export）・`core/validation/`（2 個の shim）、依存 test 修正あり
5. **個別 symbol 削除** — `request/manager.ts` の `resolve`、`core/doctor` 周辺の 3 箇所、`core/port/index.ts`、`prompts` の不使用 wrapper/re-export 3 個、`kernel/tool-types.ts` の 3 symbol、`core/finish/derive-usage.ts` 全体

## Goals / Non-Goals

**Goals**:
- 上記死コードをすべて削除し、`typecheck && test` が green を維持する
- 共有 test は「削除対象 symbol に対する assertion のみ」を除去し、他の期待値を無変更に保つ
- 削除後に grep 0 件を受け入れ基準として確認する

**Non-Goals**:
- `FinishFs`・`ERROR_CODES.STEP_INPUT_MISSING`・`ERROR_CODES.BRANCH_NOT_REGISTERED`・`ERROR_CODES.STATE_FILE_INVALID`・type としての `DoctorContext`・`CustomToolContext`/`CustomToolResult`/`CustomToolHandler`・`request/manager.ts` の `list` は削除しない
- `resultFileNotFoundError`・`ERROR_CODES.CODE_REVIEW_RESULT_NOT_FOUND`（契約 test が参照）は削除しない
- `ConfigStore` port（ADR 裁定で保持）は削除しない
- `excludeChangeFolderPaths`・`conformanceApprovedLatest`（ADR 裁定・active draft 参照）は削除しない
- `src/core/pipeline/run.ts` の wrapper 群（e2e test 入口として現役）は削除しない
- adapter / cli / config / logger 領域の死コードは別 request に委ねる
- 代替実装・alias・後方互換 shim は作らない（復元は git 履歴で可能）

## Decisions

**D1: ファイルごと削除 vs symbol 単位削除の判断基準**

ファイル内の全エクスポートが死コードであればファイルごと削除する。一部のみ死コードの場合は symbol 単位で削除し、ファイルは残す。

- 根拠: 部分削除の方がファイル全体削除より git blame が追いやすく、残存 symbol を誤って消す危険がない
- 検討した代替: ファイルを空にする → importer がいない以上意味がなく、tombstone ファイルを量産するだけ

**D2: ERROR_CODES の code 定数は factory 削除後も残す（BRANCH_NOT_REGISTERED・STATE_FILE_INVALID）**

`branchNotRegisteredError`・`stateFileInvalidError` factory は削除するが、`ERROR_CODES.BRANCH_NOT_REGISTERED`（`pipeline/run.ts:124` コメント参照）と `ERROR_CODES.STATE_FILE_INVALID`（`store/job-location-resolver.ts` 等で直接使用）は残す。

- 根拠: factory と code 定数は独立した export。code 定数を消すと本番コードが壊れる
- 検討した代替: 後方互換 alias 残置 → journal の code は opaque string で読み取り互換が保たれるため不要（architect 裁定済み）

**D3: `core/tools/` ディレクトリ削除 → `agent-runner.test.ts` の readdir assertion ブロック削除**

`src/core/tools/types.ts` は 1 行 re-export で TS importer ゼロ。ディレクトリごと削除する。  
`tests/unit/adapter/managed-agent/agent-runner.test.ts:259-264` の "only types.ts remains" assertion は、ディレクトリ消滅後に `readdir` が例外を投げるため削除する。

- 根拠: assertion の意図（register-branch が残っていない）は TC-017（同ファイル 271 行以降）でも担保されており、ブロック削除で観測空白は生じない

**D4: `core/validation/` ディレクトリ削除 → 依存 test の import を `src/parser/validation/` に repoint**

`src/core/validation/registry.ts`・`types.ts` は shim（5 行以下の re-export）で src importer ゼロ。ディレクトリごと削除する。  
`tests/unit/core/validation/registry.test.ts` と `tests/unit/parser/rules/rule-name-typesafe.test.ts` が shim 経由で import しているため、実体 `src/parser/validation/` を直接 import するよう修正する。

**D5: `src/core/doctor/index.ts` 削除 → `next-steps.test.ts` の動的 import は既存 fallback が吸収**

`next-steps.test.ts:15-30` はすでに try/catch で fallback を持ち、index.js の import が失敗したとき `next-steps.js` を直接 import する。`index.ts` を削除するとこの fallback 経路が常時使われるようになり、テストは無修正で green を維持できる。

- 根拠: fallback が存在するため test 修正が不要

**D6: `src/core/finish/derive-usage.ts` 削除 → orchestrator の呼び出し block・test の vi.mock を削除**

`deriveAndWriteUsage` は自己文書化 no-op（`skipped: true` を常に返し副作用ゼロ）であることが確認済み。orchestrator の try/catch block（`usageResult.skipped` チェック含む）を丸ごと削除する。vi.mock している 3 つのテストからも mock 行を削除する。

## Risks / Trade-offs

[Risk] `tests/error-codes.test.ts` が `branchNotRegisteredError`・`stateFileInvalidError` を named import しているため、factory 削除後に import 文が壊れる → import リストから 2 symbol を除去し、対応 assertion ブロックを削除する。`ERROR_CODES.BRANCH_NOT_REGISTERED` と `ERROR_CODES.STATE_FILE_INVALID` の assertion は factory とは独立しているため残す。

[Risk] `tests/unit/generate-chain-removed.test.ts` の TC-010 ブロックが `core/port/index.ts` を readFileSync するため、ファイル削除後に例外発生 → TC-010 ブロック（3 テスト）を削除する。他の TC は無関係であることを確認すること。

[Risk] `src/core/doctor/checks/index.ts` の `allChecks` と個別 re-export block の削除が、`commonChecks`・`managedChecks`・`localChecks` を残す残す作業より先に実施されると型エラーが出る可能性 → 削除 diff を 1 commit にまとめてビルドを通す。

## Open Questions

なし（architect 評価済みの設計判断がすべての分岐を覆っている）
