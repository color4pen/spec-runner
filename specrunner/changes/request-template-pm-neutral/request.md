# request template と prompt から bun / tests/ のハードコードを除去する

## Meta

- **type**: bug-fix
- **slug**: request-template-pm-neutral
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

#562 で runtime の PM 検出を導入し、#569 で implementer / test-case-gen から `tests/` 固定を外したが、以下の箇所に dogfooding 由来のハードコードが残っている。

1. `src/core/command/request.ts:48` — request template の受け入れ基準に `bun run typecheck && bun run test` がハードコード。生成される全 request.md に bun 固有コマンドが入る
2. `src/prompts/build-fixer-system.ts:33` — build-fixer のプロンプトが「対応する test を `tests/` 配下に追加する」と指示。implementer は #569 で「プロジェクトの配置に従う」に修正済みだが build-fixer は漏れた
3. `src/core/verification/phases.ts:4` / `src/core/verification/runner.ts:43,248` — JSDoc が「`bun run <script>` で実行」と記述。runtime は #562 で PM 検出に変更済みだがコメントが stale

## 要件

1. `request.ts:48` の受け入れ基準を PM 非依存の記述に変更する（例: `typecheck && test が green`）。
2. `build-fixer-system.ts:33` の `tests/` 配下の指示を「プロジェクトの既存テスト配置パターンに従う」に変更する。
3. `phases.ts:4` / `runner.ts:43,248` の stale JSDoc を、PM 検出で決定されるコマンドを使う旨に更新する。

## スコープ外

- PM 検出ロジック自体の変更（#562 で対応済み）。
- test-coverage の拡張子拡張（別 request）。
- プロンプト全体の汎用化（別件・長期）。

## 受け入れ基準

- [ ] `specrunner request template` の出力に `bun` が含まれない
- [ ] build-fixer のプロンプトに `tests/` 固定パスが含まれない
- [ ] `phases.ts` / `runner.ts` の JSDoc に `bun run` が含まれない
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- request template の受け入れ基準は PM 名を含めない（`typecheck && test が green` のような汎用記述）。PM を動的に埋め込む案もあるが、template はオフラインで生成されるため過剰。
- build-fixer のプロンプトは implementer と同じ方針（#569）に合わせる。
