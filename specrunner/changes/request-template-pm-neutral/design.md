# Design: request template と prompt から bun / tests/ のハードコードを除去

## Context

spec-runner は language / package-manager 非依存を志向する CLI runner である。runtime の verification は PM 検出（#562）で実行コマンドを決定し、implementer / test-case-gen は test 配置を「プロジェクトの既存配置に従う」（#569）に変更済み。しかし dogfooding 由来のハードコードが 3 箇所残存し、生成物・agent prompt・doc-comment に Bun / `tests/` 前提を漏出させている。

現状の残存箇所:

1. `src/core/command/request.ts:48` — request template の受け入れ基準が `bun run typecheck && bun run test` をハードコード。`specrunner request template` で生成される全 request.md に PM 固有コマンドが混入する。
2. `src/prompts/build-fixer-system.ts:33` — build-fixer prompt が test-coverage 失敗時に「test を `tests/` 配下に追加する」と固定ディレクトリを指示。implementer は #569 で修正済みだが build-fixer は漏れている。
3. `src/core/verification/phases.ts:4` / `runner.ts:43` / `runner.ts:248` — JSDoc が「`bun run <script>` で実行」と記述。runtime は #562 で PM 検出に変更済みのため comment が stale。

検証で確認した production の `bun run` 出現は上記 4 箇所のみ、`tests/` 固定パスは build-fixer の 1 箇所のみ。

## Goals / Non-Goals

**Goals**:

- request template の出力を PM 非依存の wording にする。
- build-fixer prompt の test 配置指示を implementer（#569）と同一方針に揃える。
- phases.ts / runner.ts の JSDoc を PM 検出ベースの記述に更新する。

**Non-Goals**:

- PM 検出ロジック自体の変更（#562 で対応済み）。
- test-coverage の拡張子拡張（別 request）。
- prompt 全体の汎用化（別件・長期）。

## Decisions

### D1: request template は PM 名を含まない静的 wording を使う

受け入れ基準を `typecheck && test が green` のような PM 名を含まない表現に置換する。

- Rationale: template はオフライン生成され、検出対象の project cwd を持たないため、PM を動的に埋め込む基盤がない。静的な PM 非依存表現が最小かつ十分。
- Alternatives considered: 検出した PM 名を template に動的注入する案 — オフライン生成で検出元が無く過剰実装のため却下（architect 評価済み）。

### D2: build-fixer prompt は implementer（#569）の wording に揃える

`tests/` 配下指示を「配置先はプロジェクトの既存テストの配置パターンに従う（特定ディレクトリを指定しない）」に置換する。

- Rationale: agent 間で test 配置方針を統一する。#569 が canonical な表現を既に確立済み。
- Alternatives considered: test 配置の記述ごと削除 — build-fixer は test-coverage 失敗時に test を追加する責務を残すため、配置方針の記述は必要。固定パスのみを外すのが妥当。

### D3: phases.ts / runner.ts は JSDoc-only の修正とする

`bun run <script>` の記述を「PM 検出で決定される run コマンドで実行」に更新する。振る舞いは変更しない。

- Rationale: runtime は #562 で既に PM 検出に移行済み。comment のみが stale であり、将来の保守者を誤誘導する。doc-comment の整合化が目的で、実行パスには手を入れない。
- Alternatives considered: なし（doc 修正に代替案なし）。

## Risks / Trade-offs

- [Risk] 既存テストがハードコード文字列を assert している（`tests/unit/core/command/request.test.ts:121` が `bun run typecheck && bun run test` を期待、`tests/prompts/build-fixer-system.test.ts:26` の OR 分岐に `test を \`tests/\`` 参照あり）。 → Mitigation: implementer が新 wording に合わせて assertion を更新する。tasks.md で明示的にタスク化する。
- [Risk] D3 の JSDoc は compile 時に除去されるため module export の unit test では検証できない。 → Mitigation: grep（`bun run` が 0 件）+ review で検証する。tasks.md の受け入れ基準に grep 確認を含める。

## Open Questions

- なし。
