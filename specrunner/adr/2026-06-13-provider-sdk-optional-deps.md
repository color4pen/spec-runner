# provider SDK を optionalDependencies + dynamic import で遅延ロードする

**Date**: 2026-06-13
**Status**: accepted

## Context

SpecRunner の local provider 実行は、これまで `@anthropic-ai/claude-agent-sdk` と `@openai/codex-sdk` を hard dependency として静的 import していた。結果として、モデル選択で実際に使わない provider の SDK と、その配布バイナリまで常に install されていた。

この change の目的は、install footprint を削ることだけではない。provider SDK を optionalDependencies に移すなら、module evaluation 時点で import 失敗しないように runtime の import boundary も変える必要がある。さらに、未 install の provider が選ばれたときは raw な module resolution error ではなく、どの package を install すべきか分かるエラーを返す必要がある。

この決定の対象は local provider SDK に限る。managed runtime の `@anthropic-ai/sdk` は別の依存であり、この change の範囲外である。

## Decision

### D1: `@anthropic-ai/claude-agent-sdk` と `@openai/codex-sdk` は両方とも `optionalDependencies` に移す

local provider SDK を対称に扱い、どちらか一方だけを hard dependency に残さない。

理由:
- どちらの provider も runtime で選択されるため、片方だけを常時 install する合理性がない
- 片方だけ optional にすると、未使用 provider の binary を削れても、もう片方の provider では install footprint が残る
- dependency policy を provider ごとに揃えることで、今後の local provider 追加時にも同じ方針を適用しやすい

### D2: provider SDK の読み込み境界を loader module に集約し、`dynamic import()` で遅延ロードする

provider adapter は SDK を静的 import せず、各 provider 専用の loader module を経由して必要時に `import()` する。

対象となる runtime 境界:
- Claude local runner
- Claude one-shot query path
- Codex local runner
- dispatching runner の provider 選択後の分岐

理由:
- optionalDependencies 化だけでは、module evaluation 時の解決失敗を防げない
- provider 選択はすでに runtime の決定なので、その後に load する形が自然
- loader module を seam にすることで、missing package のテストを集中させやすい

### D3: 未 install の selected provider SDK は `SpecRunnerError` に変換し、package 固有の install guidance を付ける

module not found はそのまま露出させず、選択された provider に応じて次のような案内を返す。

- Claude local provider: `bun add @anthropic-ai/claude-agent-sdk`
- Codex local provider: `bun add @openai/codex-sdk`

ただし、loader は top-level の package 欠如だけを missing SDK として扱い、SDK 内部の別エラーまでは誤って書き換えない。

理由:
- optional dependency の失敗は利用者の環境整備問題であり、診断可能なエラーにするべき
- raw `ERR_MODULE_NOT_FOUND` は package 名と対処法が分かりにくい
- transitive import failure を誤分類すると、実際の不具合を隠してしまう

### D4: bundle は provider SDK を external のまま保持し、動的 import の形を壊さない

`tsup` の bundle は provider SDK を取り込まず、`dist/specrunner.js` でも `import(specifier)` の runtime load を維持する。

理由:
- optionalDependencies の狙いは、install したときに必要な SDK だけを入れることにある
- bundle が SDK を内包すると、optional dependency 化の効果が薄れる
- distribution artifact での挙動確認が必要であり、source-level だけでは不十分

### D5: `queryOneShot` も local Claude SDK の lazy load に合わせる

Claude one-shot path は dispatching runner とは別経路だが、同じ provider SDK を使うため、同じ loader seam に寄せて遅延ロードする。

理由:
- dispatching path だけ遅延化しても、one-shot path が静的 import のままだと startup crash が残る
- 1 つの provider SDK に対して複数の入口がある場合、同じ missing-package behavior を共有した方が保守しやすい

## Consequences

### Positive

- 未使用 provider の binary を default install から外せる
- provider が未 install の場合に、利用者が次に取るべき `bun add ...` が明確になる
- provider SDK の import boundary が 1 箇所に集約され、テストしやすくなる
- bundle 後も dynamic import の方針を維持できる

### Negative

- provider SDK の欠如は startup ではなく first-use 時に検出される
- loader module と error normalization が追加され、実装は少し複雑になる
- optionalDependencies 前提のため、package manager や install オプションによっては追加の検証が必要になる

## Alternatives Considered

### Alternative 1: `optionalDependencies` だけにして static import は残す

Pros:
- 依存メタデータだけ変えればよく、コード変更が最小で済む

Cons:
- module evaluation 時点で import 失敗するため、未 install 環境で起動できない
- optionalDependencies の目的を満たせない

Why not:
- requirement は「provider が実際に選択されたときのみロードする」ことなので、static import を残す案は不適合

### Alternative 2: 片方の provider SDK だけを optional にする

Pros:
- 変更範囲が小さく、片側だけ先に footprint を削れる

Cons:
- install footprint の削減が部分的にしか進まない
- provider 間の方針が非対称になり、今後の運用が分かりにくい

Why not:
- この change の目的は local provider SDK を対称に扱って未使用 binary を外すことなので、片側だけ optional 化する案は採用しない

### Alternative 3: missing package を raw error のまま返す

Pros:
- 追加の error normalization が不要で、実装が最も簡単

Cons:
- 利用者にとって原因と対処が分かりにくい
- どの package を install すべきかが伝わらない

Why not:
- requirement は明確な install guidance を求めているため、raw error のまま返す案は不適合

### Alternative 4: provider selection より前に全 optional SDK を preflight する

Pros:
- missing SDK を早期に検出できる

Cons:
- optional dependency の目的を壊し、使わない provider まで強制的に要求してしまう
- startup 時のチェックが増えて、遅延ロードの意図と逆行する

Why not:
- 選択されていない provider の package まで要求するのは、footprint 削減と runtime 遅延ロードの狙いに反する

### Alternative 5: Claude one-shot を `ClaudeCodeRunner` に統合する

Pros:
- queryOneShot と runner の実装を単一化できる

Cons:
- `ClaudeCodeRunner` は step lifecycle 前提の context を持つため、one-shot の責務と混ざる
- pipeline 固有ロジックが one-shot path に漏れやすくなる

Why not:
- one-shot query は command-oriented で、runner とはコンテキスト shape が異なる。既存の分離方針を崩す必要がない

### Alternative 6: 各 call site に `await import()` を直書きする

Pros:
- loader module を増やさず、実装を各入口に局所化できる

Cons:
- missing-package error handling が各所に散らばる
- テスト seam が分散し、将来の修正で drift しやすい

Why not:
- provider SDK の読み込み境界は 1 箇所に集約した方が、保守性とテスト性が高い

## References

- Request: `specrunner/changes/provider-sdk-optional-deps/request.md`
- Design: `specrunner/changes/provider-sdk-optional-deps/design.md`
- Spec: `specrunner/changes/provider-sdk-optional-deps/spec.md`
- Review feedback: `specrunner/changes/provider-sdk-optional-deps/review-feedback-001.md`
- Review feedback: `specrunner/changes/provider-sdk-optional-deps/review-feedback-002.md`
- Review feedback: `specrunner/changes/provider-sdk-optional-deps/review-feedback-003.md`
