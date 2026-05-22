# core が下位レイヤー (cli / 具象 adapter / SDK) を逆参照している module-boundary 違反を解消する

## Meta

- **type**: spec-change
- **slug**: core-layer-boundary-fix
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

### 症状（= 既存 module-boundary spec への違反）
`module-boundary/spec.md` は既に次を規定している:

> Requirement: Dependency Direction Rules — `core` MUST NOT import from `adapter` or `cli`
> Scenario: core does not import from adapter — `grep -rE "from ['\"](\.\./)*adapter/" src/core/` returns 0 lines
>
> Requirement: Core Layer Has No Direct SDK Dependencies — `src/core/` SHALL NOT import the SDK directly. SDK access SHALL be mediated by `src/core/port/` interfaces and `src/adapter/<runtime>/` implementations.

この既存要件に対し、コードが 3 箇所違反している（実機確認済み）:

1. **core → cli**: `src/core/command/runner.ts:29,81` が `src/cli/progress.ts` の `ProgressDisplay` を直接 import し `new ProgressDisplay(events, { verbose, slug })` している。「core MUST NOT import from cli」違反。
2. **core → 具象 adapter**: `src/core/request/reviewer.ts:7` と `src/core/request/manager.ts:8` が `src/adapter/claude-code/query-one-shot.js` の `queryOneShot` / `QueryFn` を直 import。`grep adapter/ src/core` scenario が現状 fail する。
3. **core → SDK 直結**: `src/core/request/manager.ts:4` と `generator.ts:6` が `@anthropic-ai/claude-agent-sdk` の `query` を直接 import。「SDK access SHALL be mediated by port」要件に抵触する。

### spec が自己矛盾しているため spec-change として扱う
当初 bug-fix（module-boundary への準拠）と捉えたが、`one-shot-query/spec.md` の **Requirement: request-review は queryOneShot 経由で query() を呼び出す** + Scenario「runReview が queryOneShot を呼び出す → THEN queryOneShot が import されている」が、**reviewer.ts が adapter の queryOneShot を直 import することを義務付けている**。これは module-boundary（core MUST NOT import from adapter）と**正面から矛盾**している。

本 request は module-boundary 側に寄せて違反を解消するため、`one-shot-query` spec の当該 Requirement / Scenario を **delta で更新する必要がある**（reviewer は OneShotQueryClient port に依存する形に書き換え、2 つの baseline spec の矛盾を解消する）。spec を編集するため type は spec-change。

### spec の stale 問題（本件では直さない・別 issue）
SDK 禁止 scenario は `@anthropic-ai/(sdk|claude-code)` を grep しているが、実際の package 名は `@anthropic-ai/claude-agent-sdk` で、現 scenario は違反 #3 を捕捉できない（package rename に spec が追従していない）。この package 名修正は本件と独立した spec 衛生の問題なので**別 issue に切り離す**。本件で SDK 直結を直す機械ガードは code-level test で担保する。

## 要件

1. **違反1 (core→cli) の解消**: `core/command/runner.ts` から `cli/progress` import を除去する。`EventBus` を `execute()` 内 `new` から外し **`CommandRunner` のコンストラクタ注入**にする（`runtime` と同じ seam）。`ProgressDisplay` の生成・配線は cli 層に移し、`run.ts` と `resume.ts` の**両経路**から呼ぶ（共通ヘルパーに括り、重複と resume 経路の表示劣化を防ぐ）。
2. **違反2・3 (core→adapter / core→SDK) の解消**: one-shot query の抽象 `OneShotQueryClient` interface を `core/port/` に新設する（生の関数型 `QueryFn` ではなく、既存 `SessionClient`/`AgentRunner` と同じ interface 粒度に揃える）。`reviewer.ts` / `manager.ts` / `generator.ts` はこの port 型に依存し、`adapter/claude-code` と `@anthropic-ai/claude-agent-sdk` の直 import を除去する。具象実装は `adapter/claude-code` 側に置き、`executeReview` / `executeCreate`（cli から呼ばれる薄い entry）を composition point として注入する。**SDK にフォールバックする default 引数は削除する**（現状の握り潰しが違反の温床）。
3. 既存の外部挙動は変えない: pipeline 実行時の進捗表示（**run と resume の両方**）、`request review` / `request generate` の出力は従来どおり。純粋な依存方向の是正で振る舞いは不変。
4. baseline の `grep adapter/ src/core = 0` scenario が pass する状態にする。spec scenario の無い「cli 逆参照」「SDK 直結」は **code-level regression test** で恒久ガードする。
5. **`one-shot-query` spec の矛盾を解消する**: delta path `specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md` で、Requirement「request-review は queryOneShot 経由で query() を呼び出す」とその Scenario「runReview が queryOneShot を import している」を、**「reviewer は OneShotQueryClient port に依存する」**へ更新する。これにより module-boundary と one-shot-query の baseline が一致する。`queryOneShot` 関数自体（adapter 側の実行基盤）の Requirement は残す（実装は adapter に存続するため）。

## スコープ外

- spec の package 名修正（`claude-agent-sdk` 追従）— stale spec の是正は spec-change のため**別 issue**
- `core/runtime/local.ts:17` の SDK 直 import — module-boundary が許容しているわけではなく、spec の stale な grep pattern（`(sdk|claude-code)`）が `claude-agent-sdk` を検出できないため現状 scenario が pass しているだけ。本件ではスコープを区切るため除外し、別途是正対象とする（regression test のスコープも core/request 配下に限定する）
- `ProgressDisplay` の表示内容の改善（issue #367）
- `queryOneShot` の実装ロジック（config 解決 / timeout / 完了判定）の変更 — adapter 側に置いたまま、core からの依存形だけを port に変える
- リクエストの分割（#2 cli / #4 adapter+SDK は同一の core 境界違反として 1 本で扱う）

## 受け入れ基準

- [ ] `grep -rE "from ['\"](\.\./)*adapter/" src/core/` が 0 件（baseline scenario pass）
- [ ] `grep -rn "cli/" src/core` が 0 件
- [ ] `grep -rn "@anthropic-ai/claude-agent-sdk" src/core/request` が 0 件
- [ ] `OneShotQueryClient` port が `core/port/` に存在し、`reviewer.ts` / `manager.ts` / `generator.ts` がそれに依存している（具象は adapter、注入は composition point）
- [ ] 境界違反（cli / adapter / SDK）のコードレベル regression test が追加されている
- [ ] `one-shot-query` delta spec が reviewer の queryOneShot 直 import 義務を OneShotQueryClient port 依存に更新し、module-boundary と矛盾しない
- [ ] **run と resume の両方**で進捗表示が従来どおり、`request review` / `request generate` の出力も従来どおり（regression なし）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

module-architect レビュー済み:

- **ProgressDisplay/EventBus**: EventBus は core 純正なので追い出さない。違反は `ProgressDisplay`(cli) の import のみ。EventBus を `CommandRunner` コンストラクタ注入にし（`PrepareResult` 経由は prepare に infra 配線責務が漏れ SRP 違反）、ProgressDisplay 配線は cli 層の共通ヘルパーで run/resume 両経路に適用する。`initVerboseLog` は EventBus と独立なので分離して扱う。
- **one-shot query port**: 生の `QueryFn`（SDK ストリーム形状）を port にすると SDK 漏れになる。`OneShotQueryClient` interface（`run(opts): Promise<...>` 1 メソッド）を切る。`queryOneShot` の実装（config/timeout/完了判定）は adapter の責務として残す。
- **composition point**: request 経路には pipeline の `buildDeps` のような DI seam が現状無く、`runReview` は queryFn 無しで呼ばれ SDK default に落ちている。`executeReview`/`executeCreate` を composition point に確立し、具象を注入、default fallback を削除する。
- **テスト seam**: 既存の `queryFn?` mock 注入（関数）が interface 実装に変わるため、`reviewer`/`manager` 系 test のモック書き換えを tasks に織り込む。
- **adr: true** は新 port `OneShotQueryClient` 追加の記録のため。
