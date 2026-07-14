# request-review と design の間に fact-check attestation を導入し探索コストの重複を排除する

**Date**: 2026-07-14
**Status**: accepted

## Context

`design` ステップは pipeline 全体の実行コストのうち大きな割合をリポジトリ探索に費やす。その探索の一部は「現状コード断定の再検証」である（`src/prompts/design-system.ts`）：設計着手前に request 内の `file:line` / シンボル / パス断定を Read/Grep で実コードと照合し、不一致なら停止する。

`request-review` ステップはパイプライン上 `design` の直前に位置し、同一クラスの断定を既に検証している（`src/prompts/request-review-system.ts`、Step 2: Code Assertion Fact-Check）。`request-review` と `design` の間、`request.md` はヒューマン編集（needs-discussion escalation 時）を除いて変更されない。したがって、hash で無変更を確認できる場合、`design` 側の再検証は重複探索である。

これまで `request-review` は結果を findings ファイルに書き出すが、「何の状態を検証したか」の機械可読なマニフェストを残していなかった。

## Decision

### D1: attestation は change folder の file artifact であり、job state には含めない

attestation を `specrunner/changes/<slug>/request-review-attestation.json` に書き出す。`JobState` / `StepRun` のスキーマは変更しない。

- **根拠**: 他の change folder artifact（request-review-result, spec, design, tasks 等）と同じ扱いとなり、state スキーマ変更・migration が不要で pipeline metrics 等の state 変更と衝突しない。branch と一体で worktree に存在するため `design` が同一 worktree 上で読める。
- **却下案**: attestation（またはその hash）を `StepRun` / state の型付きフィールドとして保持する案。次のステップが一時的に必要とするだけのデータにスキーマ変更・migration が必要となる。ファイルが自然な形式である。

### D2: skip は content hash 一致時のみ

`design` が記録済み断定の再検証を省略するのは、現在の `request.md` content hash が attestation に記録された hash と一致する場合に限る。

- **根拠**: hash gate が drift 検出能力を保全する。`request.md` が review 後に編集された場合は hash が不一致となり、`design` は全断定を再検証する。
- **却下案**: `design` 側の fact-check を完全廃止する案（常に省略）。review 後の request 編集による drift を検出できなくなる。

### D3: `request-review` agent が attestation を書く。hash は CLI が計算して注入する

CLI が `request.md` content hash を確定的に計算し、`request-review` 初期メッセージに注入する。`request-review` agent は Step 2 完了後に attestation ファイルを書き出し、注入された hash をそのまま記録する。

- **根拠**: runtime 中立。local / managed 両ランタイムで agent はすでに change folder ファイルを作成・コミットしており、executor・runtime-strategy・report-tool に新たなポートを追加しなくてよい。trust-critical な判断は agent に委ねない（D4 参照）。機構は fail-safe である（D2 / 不正・欠落・hash 不一致のいずれも design を full re-verify に誘導する）。
- **却下案**: CLI が executor/runtime-strategy 経由で attestation ファイルを直接書く案。local-only の executor seam が必要（managed には書き込み先の worktree がない）かつ新規ポートが侵襲的で、D3 の fail-safe 特性と D4 があれば correctness 上の優位がない。

### D4: skip / re-verify の判定は CLI-deterministic gate（DesignStep.enrichContext）に置く

「現在の `request.md` hash が attestation と一致するか」の比較と、それに基づく指令の生成は CLI コード（`DesignStep.enrichContext`）が担う純粋評価であり、design agent は判定しない。`enrichContext` は結果を `DynamicContext` のフィールドに格納し、design 初期メッセージが指令として注入する。agent は指令に従うだけ。

- **根拠**: 安全ゲートが決定論的かつユニットテスト可能に保たれる（「verify, don't trust」）。LLM による hash 比較は信頼性がなく、drift ゲートが CLI の外に出ることを防ぐ。
- **却下案**: design agent が attestation を読んで freshness を自己判断する案。LLM の文字列比較は信頼性・テスト可能性ともに不十分で、ゲートが CLI の外に出る。

### D5: 両サイドが `request.md` ファイルバイトを node:crypto SHA-256 でハッシュする

生成側（`RequestReviewStep.enrichContext`）と消費側（`DesignStep.enrichContext`）はともに `specrunner/changes/<slug>/request.md` のバイトを `createHash("sha256")` でハッシュし、`sha256:<hex>` 形式の文字列を使う。

- **根拠**: 同一ソースを両サイドでハッシュすることでパーサー正規化によるハッシュ不一致を排除する。node:crypto は Node/Bun 共通で新規依存なし。
- **却下案**: 生成側がインメモリの parsed request（`request.content`）をハッシュする案。消費側のファイルバイトハッシュと一致しない可能性があり、最適化が無音で無効化される。

### D6: 記録済み断定リストは advisory。design は未記録の断定を引き続き検証する

attestation が有効（hash 一致）であっても、`design` は `request.md` 内の in-scope 断定のうち attestation に記録されていないものは検証する。省略は記録済み断定のみ。

- **根拠**: 実際のゲートは hash 等値と CLI による承認確認である。リストはどの断定を省略するかを導くのみで、agent 作成のリストを網羅的と見なすことは「verify, don't trust」に反する。hash 一致時は `request.md` の内容が同一なので未記録集合は通常空であり、コストは無視できる。
- **却下案**: hash 一致時に fact-check を全省略（リストを網羅的として信頼）する案。agent が作成したマニフェストを完全に信頼することになる。

### D7: managed runtime は現状動作に graceful degrade する

attestation の生成・消費は `enrichContext` でのローカルファイル読み取りに依存する。managed runtime にはローカル worktree がないため読み取りが失敗し（既存の `enrichContext` degrade パターン）、attestation は生成・消費されず `design` は全断定を再検証する。

- **根拠**: managed runtime でのリグレッションなし。探索コスト削減はコストが発生するローカル runtime パスで効く。
- **却下案**: 今すぐ managed をサポートする案。managed へのファイル書き込みチャネルが必要で scope 外かつ不要。degrade は挙動を保全する。

### D8: attestation 書き出しは宣言済み・非ゲートの出力とする

`RequestReviewStep.writes()` が attestation path を `verify: false` で宣言する。produced-output contract gate は attestation 欠落を halt 扱いしない。

- **根拠**: gating すると `request-review` に新たな停止経路（agent がファイルを省略した場合に halt）が生じ、step の観測可能な停止挙動が変わる。非ゲートの宣言でデータフローを明示しつつ、停止挙動は不変に保つ（fail-safe が欠落をカバー）。
- **却下案**: produced contract で gating する案。「観測可能な停止挙動を不変に保つ」受け入れ基準に違反する。

### D9: pure な attestation ロジックを専用モジュールに分離する

`src/core/factcheck-attestation.ts` に attestation 型、hash ヘルパー、JSON build/parse ヘルパー、freshness 評価、design 指令ビルダーをまとめる（I/O なし純粋関数）。path ヘルパー（`factCheckAttestationPath`）は `src/util/paths.ts` に追加。`DynamicContext`（`src/git/dynamic-context.ts`）に注入 hash（生成側）と評価結果（消費側）を持つ additive な optional フィールドを追加する。

- **根拠**: 既存の `src/core/attestation/`（run/PR 承認ジャーナル、コスト記録）と名称を区別し概念の混同を防ぐ。`src/core/attestation/` や `src/core/step/judge-verdict.ts` と同じ純粋関数レイアウトに合わせ、テスト可能な「経路」を prompt / step から分離する。
- **却下案**: `src/core/attestation/` を再利用する案。そのモジュールは run/PR 承認（ジャーナル hash、ゲート、コスト）を扱う全く別の概念であり、上書きすれば概念が混濁する。

## Alternatives Considered

### Alternative 1: design 側 fact-check を完全廃止する（常に省略）

attestation の有無や hash 比較なしに、`design` の現状コード断定再検証を無条件で削除する。

- **Pros**: 実装が最小。hash 計算・attestation 生成・消費の仕組みが一切不要。探索コスト削減が最大。
- **Cons**: `request.md` が review 後に人間編集された場合の drift を検出できなくなる。review 後に断定が変わった request を `design` が無検証で受け入れる。
- **Why not**: drift 検出能力を失うことは受け入れられない。hash gate で「変更なし」を確認した場合のみ省略することで、drift 検出を保全しつつコスト削減を両立する（D2）。

### Alternative 2: CLI が attestation ファイルを executor / runtime-strategy 経由で直接書く

`RequestReviewStep` が attestation を書くのではなく、CLI executor が deterministic にファイルを生成するための新しいポートを `RuntimeStrategy` に追加する。

- **Pros**: attestation の存在が CLI-authoritative になり、agent の書き忘れ・書き誤りを排除できる。
- **Cons**: 新規ポートメソッドと executor ブランチが必要で侵襲的。managed runtime にはローカル worktree がないため local-only の実装になり、managed では別の経路が必要。fail-safe 特性（D2）と D4 の CLI-gate があれば correctness 上の優位がない。
- **Why not**: 実装コストと runtime 分岐の複雑化が正当化できない。agent-written アプローチは fail-safe で正確性を失わないため、executor seam は over-engineering になる（D3）。

### Alternative 3: design agent が attestation を読んで freshness を自己判断する

`DesignStep.enrichContext` で hash 比較を行う代わりに、design プロンプトの散文で「attestation が存在し hash が一致すれば省略せよ」と記述し、agent に判定させる。

- **Pros**: CLI コードの変更が最小。hash 比較ロジックを CLI に実装しなくてよい。
- **Cons**: LLM の文字列比較は信頼性がなくユニットテストできない。drift gate が CLI の外に出ることで「verify, don't trust」原則に反する。agent のプロンプト応答次第で判定が揺れ、テストで固定できない。
- **Why not**: 安全ゲートは deterministic かつ unit-testable である必要がある。判定は `DesignStep.enrichContext`（CLI 純粋評価）に置き、agent は指令に従うだけにする（D4）。

### Alternative 4: attestation を `JobState` / `StepRun` の型付きフィールドとして保持する

attestation の hash やフラグを state スキーマの typed field として記録し、`design` が state 経由で読み取る。

- **Pros**: state 経由でのアクセスが他のステップ間データと統一される。ファイル I/O が不要。
- **Cons**: state スキーマ変更と migration が必要。pipeline metrics 等の他の state 変更と衝突リスクがある。次のステップが一時的に必要とするだけのデータにスキーマを拡張するコストが不均衡。
- **Why not**: change folder の file artifact として扱うことで、スキーマ変更・migration が不要になり、他の変更フォルダ artifact（request-review-result, spec 等）と同列に扱える。データの自然な形式はファイルである（D1）。

## Consequences

### Positive

- `request-review` と `design` の間に機械可読なデータ契約が生まれ、ステップ間の依存が明示される。
- hash 一致時に `design` の探索コスト（Read/Grep 呼び出し数）を削減できる。
- fail-safe 設計により、attestation の欠落・破損・偽造が correctness を損なわない。
- CLI-deterministic gate（D4）により、安全・freshness 判定がユニットテストで固定される。

### Negative

- `request-review` agent に「attestation ファイルを書く」責務が追加される。プロンプト変更が prompt drift の可能性を持つ（既存テストと verdict invariance テストで固定）。
- hash 一致時も `design` は「attestation に記録されていない断定」を検証するため、最適化効果はリスト記録の完全性に依存する（D6）。
- managed runtime では最適化が効かない（D7）。managed の探索コスト削減は将来課題。

### Known Debt / Deferred

- managed runtime への first-class attestation サポート（managed へのファイル書き込みチャネル）は scope 外。現状の degrade で behavior は保全される。
- CLI が attestation ファイルを直接書く（executor seam 経由）強化は deferred。fail-safe property が現状の agent-written 方式を正当化する。
- attestation の生成を CLI-authoritative にし、存在保証を強化するかは open question として残す。

## References

- Request: `specrunner/changes/request-review-factcheck-attestation/request.md`
- Design: `specrunner/changes/request-review-factcheck-attestation/design.md`
- Spec: `specrunner/changes/request-review-factcheck-attestation/spec.md`
- Related: `specrunner/adr/2026-06-04-step-io-contracts.md`（`writes()` 宣言・非ゲート出力の原型）
- Related: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`（RuntimeStrategy seam）
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（local/managed 分離）
- Implementation: `src/core/factcheck-attestation.ts`・`src/util/paths.ts`・`src/git/dynamic-context.ts`・`src/core/step/request-review.ts`・`src/core/step/design.ts`・`src/prompts/request-review-system.ts`・`src/prompts/design-system.ts`
