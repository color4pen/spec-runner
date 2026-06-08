# テスト配置先の tests/ ハードコードを解消し implementer に配置を委ねる

## Meta

- **type**: spec-change
- **slug**: test-dir-detection
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

specrunner の 3 箇所が `tests/` ディレクトリをハードコードしており、implementer がテストコードをルート直下の `tests/` に書くよう誘導している。

1. `src/core/verification/test-coverage.ts:159` — TC ID の grep 対象が `path.join(cwd, "tests")` 固定
2. `src/prompts/implementer-system.ts:52` — 「verification step が `tests/` 配下に対する grep で TC ID の存在を機械的に検証する」
3. `src/prompts/test-case-gen-system.ts:132` — 「verification step (which greps `tests/` for each must TC ID)」

specrunner 自身の開発（dogfooding）では `tests/` がルートにあるため問題にならないが、他のプロジェクト（例: pnpm monorepo で collocated test 規約）では vitest 設定が `tests/` を含まず、生成されたテストが一度も実行されない死んだファイルになる（#565）。

本来 implementer は LLM agent なので、プロジェクトの既存テスト配置を見て適切な場所に書く能力がある。`tests/` への誘導を外し、TC ID の grep 対象をプロジェクトの実態に合わせれば、implementer が自律的に正しい配置を選ぶ。

## 要件

1. `test-coverage.ts` の TC ID grep 対象を `tests/` 固定から、プロジェクト内の `*.test.ts` / `*.spec.ts` ファイルの実在場所に変更する。検出は `find` または `glob` でプロジェクト全体（`node_modules` / `dist` / `.git` 除外）から `*.test.ts` / `*.spec.ts` を収集する。
2. `implementer-system.ts:52` から `tests/` 配下という固定パスの記述を除去する。「プロジェクトの既存テスト配置に合わせてテストを書く」旨に変更する。
3. `test-case-gen-system.ts:132` から `tests/` 配下という固定パスの記述を除去する。
4. spec-runner 自身の dogfooding（`tests/` がルートにある）で既存の TC ID 検証が壊れない。

## スコープ外

- vitest config の parse（include パターンの解析は不要。実在ファイルの収集で十分）。
- `.specrunner/config.json` へのテストディレクトリ設定の追加（実在ファイル検出で不要）。
- implementer のテスト品質改善（配置先の問題のみ扱う）。

## 受け入れ基準

- [ ] `test-coverage.ts` が `tests/` 固定ではなくプロジェクト全体から `*.test.ts` / `*.spec.ts` を収集して TC ID を grep する
- [ ] implementer と test-case-gen のプロンプトから `tests/` 固定パスの記述が除去されている
- [ ] spec-runner 自身の `tests/` 配下のテストで TC ID 検証が引き続き動作する（後方互換）
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- テストファイル収集は `find` 相当の glob でプロジェクト全体をスキャンする。`node_modules` / `dist` / `.git` を除外。vitest config の parse は過剰（実在ファイルが真実）。
- implementer への指示は「プロジェクトの既存テストの配置パターンに従う」で十分。具体的なディレクトリを指定しない。agent が既存テストの import パスやディレクトリ構造を見て判断する。
