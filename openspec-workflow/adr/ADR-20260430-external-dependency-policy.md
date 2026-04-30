# ADR-20260430-external-dependency-policy

**Title**: SpecRunner external dependency policy: openspec & git required, gh CLI replaced by GitHubClient port, no LLM in operational tooling

## Status

accepted

## Context

dogfooding 001〜005 を通じて、SpecRunner が動作する前提条件（外部 CLI / 認証 / 設定 / repo 状態 / Anthropic agent 登録）が揃っていないと runtime error で初めて気付く問題が顕在化した。`specrunner doctor`（本 change で追加）の設計にあたり、SpecRunner が依存する外部要素の境界を明文化する必要がある。

並行して `specrunner finish` / `cancel` / `gc` / `status` 等の operational tooling の追加が計画されており、それらにも適用される共通方針を先んじて宣言しておかないと、各コマンドで個別に「LLM を呼ぶか」「gh CLI を要求するか」「openspec を必須とするか」を再判断することになり、整合性が崩れる。

参考としたコンテキスト:

- **dogfooding 経験**: openspec 未 install / gh CLI 未認証 / Anthropic key revoke 等の failure を doctor 化した経験。
- **openspec-workflow との比較**: openspec-workflow（skill 集合）は spec management の本丸であり、自前実装する代わりに `npx openspec` を必須前提とする方が認知負荷・bundle size の両面で合理的。
- **Anthropic Managed Agents との責務分離**: pipeline 実行（propose / spec-review / implementer / code-review 等）は LLM judgment を必要とするが、operational tooling（環境診断 / 後片付け / 状態確認）は deterministic な機械検証で完結する。両者を混ぜないことが debug 容易性と test 容易性を保つ。

詳細な要件と判断根拠は [`openspec-workflow/requests/active/cli-doctor-command/request.md`](../requests/active/cli-doctor-command/request.md)（「設計上の重要な決定」セクション）および [`openspec/changes/cli-doctor-command/design.md`](../../openspec/changes/cli-doctor-command/design.md) D5 を参照する。本 ADR はそれらを唯一の制度として固定する。

## Decision

SpecRunner が外部に依存する要素の必須/不要を以下の表で固定する。

| 依存 | 必須? | 検証方法 / 代替手段 | 適用範囲 |
|------|-------|---------------------|---------|
| **node** | 必須 (>= 18) | `process.version` | 全 CLI |
| **bun** | 必須 | `bun --version`（execFile） | shebang で bun 指定 |
| **git** | 必須 | `git --version`（execFile） | repo 操作（init / pipeline / finish） |
| **openspec** | 必須（`npx openspec` 経由可、global install 不要） | `npx openspec --version`（execFile, 30s timeout） | spec management |
| **gh CLI** | **不要** | `GitHubClient` port で REST API（`/user`, scope 検証, PR 操作）を直叩き | PR 作成 / token 検証 |
| **LLM (Managed Agents)** | **不要**（operational tooling では） | deterministic 検証（file existence / shell exit / HTTP status / JSON parse / hash compare）で完結 | doctor / finish / cancel / gc / status |

これにより:

- `specrunner doctor` の全 check は LLM judgment を呼ばない。
- 後続の `specrunner finish` / `cancel` / `gc` / `status` も同じ原則を継承する（LLM を呼ばないことが default）。
- gh CLI は SpecRunner の install 前提から外れる。GitHub 操作は既存の `GitHubClient` port（fetch ベース）で完結する。
- openspec は `npx` 経由で利用するため global install を user に要求しない。SpecRunner の bundle にも同梱しない。

## Alternatives Considered

### Alternative 1: gh CLI を必須とする

- **Pros**: PR 操作が gh CLI 1 行で書ける。auth flow（device flow）が gh に委譲できる。
- **Cons**: install 前提が増える。CI 環境で gh CLI のセットアップが追加で必要になる。GitHubClient port が既に実装済みでこれを使えば fetch ベースで完結する。dogfooding 環境のセットアップが複雑化する。
- **Why not**: GitHubClient port が既に PR 関連の REST API（token 検証 / PR list / PR create / scope 確認）を吸収しており、gh CLI を二重に要求する利点がない。port パターンに統合した方が test 容易性も高い。

### Alternative 2: openspec を npm dep として bundle する

- **Pros**: install 後すぐに使える。`npx` の初回 download 待ちが発生しない。
- **Cons**: openspec の version が SpecRunner release に固定される（version conflict が生じる）。bundle size が膨らむ。openspec 側の更新サイクルに引きずられる。
- **Why not**: openspec は外部 tool として独立に進化させたい。SpecRunner は openspec の specific version に依存しない設計が望ましい。`npx openspec` で初回 30s timeout を許容することで、運用上の待ち時間と version 自由度のトレードオフを後者寄りに倒す。

### Alternative 3: doctor / finish / cancel に LLM judgment を入れる

- **Pros**: hint message を「現状の error と repo 状態から最適な修復手順を生成」のように動的にできる。
- **Cons**: LLM コストが doctor のたびに発生する。判断が非決定的になり test が脆くなる。crash 時の原因切り分けで「LLM 出力の妥当性」と「ロジックの妥当性」を分離する必要が出る。CI で flaky になる。
- **Why not**: operational tooling の責務は「機械的に検証可能なことを検証する」であり、judgment を要する場面（spec の正しさ / code の正しさ）は pipeline の Managed Agents が担う。両者を混ぜると debug 不能になる。doctor の hint は静的 string で十分（`specrunner init --resync` 提案など）。

## Consequences

### Positive

- **install 前提の最小化**: user は node / bun / git の 3 つだけ用意すれば SpecRunner が動く。openspec は npx 経由、gh は不要。
- **test 容易性**: doctor / finish / cancel / gc 等の全 operational tooling が deterministic で unit test 可能（DoctorContext mock で fetch / fs / child_process を差し替え可能）。
- **CI integration**: doctor / finish 等が exit code で結果を返すため CI script から直接 chain できる（LLM 経由だと exit code が安定しない）。
- **将来の operational tooling への原則**: 「ここに LLM 入れたい」という誘惑への制度的防波堤になる。新規 operational subcommand を追加する際、本 ADR が判断基準を提供する。
- **bundle size / version conflict 回避**: openspec を bundle しないことで、openspec 側の更新サイクルから独立できる。

### Negative

- **`npx openspec --version` の初回 download が遅い**: 初回実行で 5s を超え得るため、doctor の openspec check のみ timeout 30s を許容する（design.md D7 で個別 check ごとに timeout 仕様を固定）。
- **operational tooling の hint が静的になる**: error message から動的に修復手順を生成する余地がなくなる。代わりに静的 hint table を整備する必要がある。
- **GitHub 操作で gh CLI の便利機能が使えない**: device flow auth / interactive prompt 等は GitHubClient port で自前実装が必要（既に済んでいる）。

### Risks

- **openspec の major version 更新で `npx openspec --version` の出力が変わる**: → 緩和策: doctor では「コマンド実行できる」ことを pass の条件とし、version pin はしない。version 比較が必要になったら別 check として追加する。
- **将来の subcommand で「ここだけは LLM が必要」というケース**: → 緩和策: その時点で本 ADR を superseded する。新規 ADR で判断根拠を明示する。安易な例外は作らない。
- **GitHubClient port が gh CLI 機能の一部（例: PR review automation）を将来再実装する負担**: → 緩和策: 必要になった時点で port method を追加する。port パターンが既に確立しているため拡張コストは線形。

### Known Design Debt

- 本 change スコープ内では発生していない。後続の `specrunner finish` / `cancel` / `gc` / `status` 実装時に、本 ADR の原則（LLM 不要 / gh CLI 不要 / openspec 必須）を踏襲することが期待される。逸脱が必要になった場合は本 ADR を superseded する新規 ADR を作る。

## 参照

- [Request: cli-doctor-command](../requests/active/cli-doctor-command/request.md) — 「設計上の重要な決定」セクションが本 ADR の一次根拠。
- [Design: cli-doctor-command](../../openspec/changes/cli-doctor-command/design.md) — D5 で本 ADR 生成を Step 7 に委譲、D6/D7 で deterministic 検証手段を具体化。
- [ADR-20260430-pr-create-step-design](ADR-20260430-pr-create-step-design.md) — D1 で同じく `kind: cli` を選びつつも gh CLI を spawn する判断を採用しているが、それは pipeline step（PR 作成）の文脈であり、operational tooling である本 ADR の対象外。整合性: PR 作成は pipeline step（kind=cli）として gh を spawn、token 検証等の operational check は GitHubClient port 経由、という二層構成で矛盾なく共存する。
