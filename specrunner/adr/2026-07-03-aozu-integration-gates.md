# ADR-20260703: 設計レイヤ CLI（aozu）との opt-in 固定結線 — 入口ゲートと archive 相乗り出口 hook

## ステータス

accepted

## コンテキスト

設計レイヤ CLI **aozu** は、プロダクトリポジトリの `design/` 配下の設計文書を正本として管理する決定的ツールで、実装パイプライン向けの交換面契約 v0 を公開している。契約は呼び出し側に 2 つの結線点を推奨する:

- **入口**: request 検証で `aozu check --request <path>` を実行し、request 本文中の `[[id]]` 引用を実在解決・状態検証する（exit 0 = 合格 / 1 = 不合格 / 2 = 入力不正）。診断は stderr に `<LEVEL> <CODE> <id> <message>` 形式で出力される。
- **出口**: 取り込み完了時に `aozu mark implemented --request <slug> [--pr <n>]` を実行し、当該 slug の requested 設計要素を implemented へ遷移する（冪等。exit 0 = 遷移完了 / 1 = 未知の slug / 2 = 入力不正）。

spec-runner にはこの受け口が無く、引用検証も implemented 遷移も人手のままだった。ロードマップ草稿はこの結線を「上流ツールの成熟が前提」として据え置いていたが、aozu 側で契約 v0 と対象動詞が実装済みとなり前提が満たされた。

関連するコード上の前提:

- `src/core/preflight.ts` — `run` 起動時の fail-fast で `parseRequestMd` を実行する。request 検証の一方の入口。
- `src/core/command/request.ts` — `executeValidate()` が `request validate` CLI をなす。request 検証のもう一方の入口。
- `src/core/archive/orchestrator.ts` — 設計不変条件「base ブランチへ checkout / commit / push しない。archive コミットは feature ブランチに記録し remote feature ブランチへ push する」が明記されている。
- `src/config/schema.ts` — config は zod/v4-mini + 意味検査の 2 層。任意セクションは `optional(object({...}))` で拡張してきた（`archive` / `inbox` / `transientRetry`）。
- `src/core/doctor/checks/runtime/codex-cli.ts` — 外部 CLI presence 検証の既存パターン（`execFile` で presence 確認、条件付き required、install ヒント返却）。
- 実行時依存は極小（`dependencies` は Anthropic SDK のみ）。外部ツールは npm 依存でなく CLI spawn で結合する規律。

## 決定

### D1: config に provider-agnostic な `designLayer` セクションを追加する

`SpecRunnerConfig` に任意セクション `designLayer` を追加する:

```jsonc
{
  "designLayer": {
    "enabled": true,
    "command": "aozu",
    "requireCitationTypes": ["new-feature", "spec-change"]
  }
}
```

- schema key は generic な `designLayer`（`aozu` を schema に焼き込まない）。実コマンド名は `command` 経由で注入し、既定 `"aozu"`。これは「自前 CLI config に upstream provider 固有名を流用しない」規律と、「aozu は npm 依存でなく config 注入コマンド名を spawn する」architect 決定の両方に整合する。
- `resolveDesignLayerConfig(config): ResolvedDesignLayer` を新設し、欠損既定込みで `{ enabled, command, requireCitationTypes }` を返す（`resolveInboxConfig` / `resolveTransientRetryConfig` と同じパターン）。全消費者（gate / hook / doctor）はこの解決済み値のみを参照する。
- `enabled !== true` のとき全結線点は spawn せず即 return（無効時の完全な挙動保存）。

**採用理由**: 既存 config は「任意セクション + resolve ヘルパ」で拡張してきた同型パターンにより、schema 検査・deep merge・後方互換が既存機構に乗る。

**却下案 A**: env var での有効化 — team 共有される `.specrunner/config.json` に載らず、project config commit 共有の設計に反する。

**却下案 B**: schema key を `aozu` にする — 特定ツール名を契約表面に固定してしまい、注入可能コマンド名の設計と矛盾する。

### D2: 入口ゲートは決定的 CLI への委譲とし、単一モジュールで両入口から呼ぶ

新モジュール `src/core/design-layer/check-gate.ts` に `runDesignLayerCheckGate` を実装し、`run` の preflight（`parseRequestMd` 直後）と `request validate` の両方から呼ぶ。二重実装しない。

動作規則:

- `designLayer.enabled !== true` → 即 `{ passed: true, skipped: true }`（spawn しない）。
- 有効時: `args = ["check", "--request", requestMdPath]`。`requestType ∈ requireCitationTypes` なら `--require-citation` を付与。`spawn(command, args, { cwd })` を実行。
- `exitCode === 0` → `{ passed: true, skipped: false }`。
- `exitCode !== 0`（1 / 2 / null）→ aozu の stderr を利用者出力へ透過し `{ passed: false, exitCode, diagnostics }` を返す。`exitCode: null`（ENOENT）も不合格として扱う。
- ゲート自体は throw しない。合否の解釈は呼び出し側が担う。preflight は `SpecRunnerError`（`DESIGN_LAYER_CHECK_FAILED`）を throw し、`executeValidate` は exit 1 を返す。

**採用理由**: 契約は決定的 CLI の exit code / 診断書式で機械的合否を与える。単一モジュール化で両入口が同一の合否規則を共有する。

**却下案**: request-review（LLM step）のプロンプトへ引用検査を追加する — 非決定的で、exit code / 診断書式による機械的合否が得られない。

### D3: 出口 hook は archive フェーズ・feature ブランチに置き、archive コミットに相乗りさせる

新モジュール `src/core/design-layer/mark-hook.ts` に `runDesignLayerMarkHook` を実装する。

呼び出しタイミング: `runArchiveOrchestrator` の Phase 1 の既存 `git add specrunner/changes/`（archive 記帳の stage）の**直後**、`commitArchive` の**直前**。これにより:

- exit 0 のとき: `git add -A`（D5 参照）で aozu の書いた state 変更を staging し、後続の `commitArchive` が archive 記帳と state 変更を**同一コミット**に含める。
- `status === "error"`（exit 2 / null）: archive を中断する（squash merge に届かず fail-safe）。
- `status === "unknown-slug"`（exit 1）: 警告を出力し archive を継続する。
- `designLayer.enabled !== true`（無効）: 挿入点が完全 no-op で既存挙動不変。

**採用理由**: archive コミットと同じ配達経路（feature ブランチ → squash merge）に相乗りするため新配達機構を持たず、base 直コミット禁止の不変条件（`orchestrator.ts` 設計不変条件）を守る。base から見た遷移はちょうど merge 時点で起きる。merge が失敗すれば遷移も base に届かない（fail-safe）。`mark implemented` の冪等性により archive の再実行にも安全。

**却下案 A**: merge 成功後に base へ直接コミット — orchestrator の設計不変条件「base ブランチへ checkout / commit / push しない」に違反する（[ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) も同原則を採用）。

**却下案 B**: state 変更だけの追い PR — request 1 件ごとに PR が 2 本になり重く、設計状態の収束が遅れる。[ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) が確立した 1-PR モデルにも反する。

### D4: mark の exit 1（未知の slug）は警告に留め、archive を失敗させない

`mark implemented` が exit 1（未知の slug = aozu 管理下にない request）を返したとき、archive を失敗させず警告に留めて継続する。exit 2（入力不正 = 設定不整合）および exitCode null（spawn 失敗）は archive を失敗させる。

**採用理由**: 通常の bug-fix 等、設計レイヤ管理下にない request が正常系として存在する。exit 1 を失敗にすると、設計レイヤ非管理 request のすべての archive が blockされる。設計状態の乖離が生じた場合も aozu 側の status のフロンティア表示で観測可能であり、冪等な `mark implemented` の再実行で回復できる。

**却下案**: exit 1 も失敗にする — 設計レイヤ非管理 request（大多数の bug-fix 等）の archive が設定不整合として扱われ、既存ワークフローが破綻する。

### D5: `git add -A` で aozu の書き込みを捕捉する（設計側ファイルレイアウトを知らない）

出口 hook が exit 0 を確認した後、recordDir で `git add -A` を実行して aozu が生じた変更を staging する。`design/` 等のパスを hardcode しない。

**採用理由**: spec-runner は契約（CLI 署名と exit code）以外に aozu の内部を知らない、という原則に忠実であるため、設計側 state ファイルの物理パスを hardcode せず、working-tree の結果差分を丸ごと捕捉する。archive 記録時点の recordDir は job 専用 worktree（PR 作成済 = 実装変更は commit / push 済）で、未 commit 差分は archive の `git mv` / status 更新（既に staged）と aozu の書き込みに限られるため、`-A` の over-staging リスクは限定的。`.gitignore` は尊重される。

**却下案**: `git add design/` 等のパス固定 — aozu の内部レイアウトへの依存を持ち込み、契約のみ結合の原則に反する。

### D6: doctor check は designLayer 有効時のみコマンドの presence を検証する

`src/core/doctor/checks/runtime/aozu-cli.ts` を `codex-cli.ts` パターンで新設し、`commonChecks` に登録する（設計レイヤ結線は runtime 非依存のため local / managed 双方で走る `commonChecks` が適所）。`enabled !== true` のとき `execFile` を呼ばず pass を返す。

## 検討した代替案

### A1: aozu を npm 依存パッケージとして導入する

- **Pros**: TypeScript API として直接 import でき、spawn オーバーヘッドがなく型安全。
- **Cons**: 実行時依存が増える（現状 dependencies は Anthropic SDK のみ）。aozu のバージョン更新のたびに spec-runner も npm update が必要になる。npm 依存でなく CLI spawn で外部ツールを結合するという規律に反する。
- **Why not**: プロジェクトの "Minimal-deps North Star" および「外部ツールは npm 依存でなく CLI spawn で結合する」規律に違反する。aozu は CLI インターフェース（exit code + stderr 診断書式）を契約として公開しており、この契約だけに依存すれば内部の変更に耐えられる。

### A2: 有効化を env var で制御する

- **Pros**: config ファイル変更なしに有効化でき、CI 環境で env を差し替えるだけで制御できる。
- **Cons**: team 共有される `.specrunner/config.json` に設定が載らず、リポジトリに commit されない。特定メンバーの環境だけで有効・他では無効という非対称状態が生じる。
- **Why not**: project config の設計は「`.specrunner/config.json` を commit して team で共有する」前提に立っている。env var はその設計に反する。

### A3: schema key を `aozu` にする

- **Pros**: 設定の意味がツール名から一目で分かる。
- **Cons**: 将来コマンド名が変わった（または別ツールを使う）場合、schema key と実体が乖離し config に固定名が焼き込まれる。注入可能コマンド名（`command` フィールド）の設計と矛盾する。
- **Why not**: 「自前 CLI config に upstream provider 固有名を流用しない」規律に反する。`designLayer` という generic key を使い、実コマンド名は `command` で注入する設計のほうが将来変更に強い。

### A4: request-review（LLM step）のプロンプトへ引用検査を追加する

- **Pros**: 既存の review ステップへの追加で新モジュール不要。自然言語での柔軟な判定が可能。
- **Cons**: 非決定的（同一入力でも結果が変わりうる）。exit code / 診断書式による機械的合否が得られず、テストでの固定が困難。LLM が誤検知・誤見逃しをしうる。
- **Why not**: 引用の実在解決は決定的な検証であり、LLM に委ねる必要がない。aozu の決定的 CLI は exit code と構造化診断で機械的合否を与えるため、これを使うのが正しい設計。

### A5: merge 成功後に base ブランチへ直接コミットする

- **Pros**: 「設計状態遷移が merge 完了と同時に base に乗る」タイミングが明確。
- **Cons**: `orchestrator.ts` の設計不変条件「base ブランチへ checkout / commit / push しない」に直接違反する。protected base では push が reject される（[ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) が解消した問題の再発）。
- **Why not**: orchestrator の不変条件は ADR-20260628 で確立・強化された基盤であり、本変更でも守らなければならない。base への直接影響は merge のみに限定する原則が揺らぐ。

### A6: 設計側 state 変更だけの追い PR を作る

- **Pros**: 設計状態遷移を独立した単位として追跡しやすい。
- **Cons**: request 1 件ごとに PR が 2 本になり、PR 一覧が汚染される。設計状態の収束も遅れる（本 PR → merge → 追い PR → merge の 2 段）。[ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) が確立した 1-PR モデルに反する。
- **Why not**: 1-PR モデルの維持は設計原則として確立済み。archive コミットへの相乗り（A3 採用案）であれば新しい配達機構を持たず、PR 数を増やさずに済む。

### A7: 汎用 post-merge hook 機構を新設し aozu 結線をその上で実装する

- **Pros**: 将来の別ツール（CI 通知等）にも同じ hook 機構を転用できる。
- **Cons**: 汎用機構の設計・実装コストが大きい。需要が 1 件しかない段階での汎用化は YAGNI。汎用コマンド差し込み機構はセキュリティ・権限・エラーハンドリングの複雑さも伴う。
- **Why not**: 「第二の需要が現れてから汎用化する」原則（request のスコープ外に明示）に従い、本変更は aozu 結線に限定した固定結線とする。

### A8: `git add design/` 等の設計側パスを固定して staging する

- **Pros**: over-staging リスクが明確に限定される。
- **Cons**: spec-runner が aozu の内部レイアウト（`design/` の物理パス構造）を知る必要が生じ、「契約（CLI 署名と exit code）以外に aozu の内部を知らない」原則に反する。aozu が内部構造を変更した際に spec-runner 側の更新も必要になる。
- **Why not**: 「spec-runner は契約のみ結合」の原則が最優先。`git add -A` の over-staging リスクは、archive 時点の worktree がクリーンである前提（job 専用 worktree で PR 作成済）によって限定的に抑えられる。

## 影響

### Positive

- request 本文中の `[[id]]` 引用の実在解決・状態検証が `request validate` / `run` preflight で機械的に合否判定される。
- `mark implemented` が archive コミットと同一配達経路（feature ブランチ → squash merge）に相乗りし、新しい配達機構を持たず base 直コミット禁止の不変条件を守る。
- 既定無効（`enabled !== true`）により、設計レイヤ非導入プロジェクトでは aozu を一切 spawn せず既存挙動を完全に保存する。
- config の `command` 注入により、コマンド名が変わっても spec-runner 側の変更を要しない。
- doctor が结线有効かつ aozu 不在を検出し、早期に導入ヒントを提示する。

### Negative

- archive フェーズに hook 呼び出しが追加されるため、有効時は `mark implemented` の spawn と `git add -A` が archive のクリティカルパスに入る。aozu が遅い環境ではわずかな追加レイテンシが生じる。

### Known Debt

- doctor の presence probe flag（`aozu --version`）が契約で保証されているか未確認。保証されない場合、`--version` で reject しうる。実装時の Open Question として記録済み。確認できない場合の fallback は「ENOENT のみを『不在』と判定し、present だが flag 非対応は warn 扱い」。
- `git add -A` の over-staging リスクは限定的だが、recordDir が汚れている異常ケース（前回の中断によるゴミファイル等）では意図しないファイルが archive コミットに混入する可能性がある。archive の冪等性と worktree 状態の前提により通常は発生しない。

## 参照

- Request: `specrunner/changes/aozu-integration-gates/request.md`
- Design: `specrunner/changes/aozu-integration-gates/design.md`
- Related: [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) — base 直コミット禁止の不変条件（本変更で出口 hook の配置根拠）
- Related: [ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) — 1-PR モデル（追い PR 却下の根拠）
- Related: [ADR-20260526-project-config-overlay](2026-05-26-project-config-overlay.md) — project config の deep merge・optional セクション拡張パターン
