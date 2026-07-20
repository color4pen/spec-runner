# CLI における `process.cwd()` の役割を 2 つに限定し、repo root をディスパッチ時に一括解決する

**Date**: 2026-07-20
**Status**: accepted

## Context

複数の CLI コマンドが `process.cwd() === repo root` を暗黙に仮定していた。
`resolveRepoRoot` の適用は per-command の任意選択であり、通すコマンド（`job prune` / `job cancel` / `inbox` / `job show` 等）と `process.cwd()` を内部状態パスの基点として直接使うコマンドが混在していた。

配布は `npm install -D` + `npx` であり、`npx` は `node_modules` を上方探索するため subdirectory からの起動は正規経路である。「起動できる範囲」が「正しく動く範囲」より広い状態にあり、以下の実測症状が確認された（v0.4.1、npm 公開物含む）:

- `job stats` を `src/` から実行 → `No runs found. Summary: 0 runs`（repo root では 400+ run 表示）
- `doctor` を `src/` から実行 → `workflow-structure` が偽 warn、`local-state-writable` が `src/.specrunner/local` を参照、`orphan-sidecars` が偽 pass
- `request new` を subdirectory から実行 → `<subdir>/specrunner/drafts/<slug>/request.md` に入れ子構造を生成

欠陥の構造的原因は「per-command の任意適用」である。各作者が `resolveRepoRoot` を呼ぶかどうかを個別に判断する規約は規模で必ず漏れる。また、`process.cwd()` の正当な使用（repo root 探索の起点、ユーザー入力相対パスの解決基準）と不当な使用（内部状態パスの基点）を区別する機械的な歯が存在しなかった。

本 ADR は以下の 2 つの横断的な設計決定を記録する:

1. `process.cwd()` の役割を CLI 全体で 2 つに限定するという**境界原則**の確立
2. repo root をディスパッチ時に一括解決して handler へ注入するという**構造的修正**

## Decision

### D1: `process.cwd()` の役割を 2 つに限定する（境界原則）

CLI において `process.cwd()` が担う役割を以下の 2 つに限定する:

- **(a) repo root 探索の起点**: `resolveRepoRoot(cwd?)` の引数として渡す用途のみ
- **(b) ユーザーが引数で指定した相対パスの解決基準**: `request validate <path>` / `--prompt-file <path>` 等の invoker 相対パス解決

内部状態パス（`.specrunner/` / `specrunner/drafts` / `specrunner/changes` 等）はすべて repo root 起点で導出する。`process.cwd()` を内部状態パスの基点として直接使うことは許容しない。

**採用理由**: subdirectory から起動した場合に誤ったパスを静かに導出する欠陥の根本原因は「cwd を repo root の代替として直接使う」ことにある。役割を限定し境界を明文化することで、新しい call site で誤用が再発するのを防ぐ。

### D2: repo root をディスパッチ時に一括解決し、`CommandContext` として handler に注入する

コマンドディスパッチ時（`bin/specrunner.ts`）に、invoker cwd から repo root を一度だけ解決し、`CommandContext = { repoRoot: string | null; invokerCwd: string }` を構築して handler の第 2 引数として渡す。

`CommandDef.handler` のシグネチャを `(parsed: ParsedArgs, ctx: CommandContext) => Promise<void>` に拡張する。TypeScript は引数が少ない関数の代入を受け入れるため、`ctx` を使わない既存 handler の変更は不要。

`src/cli/command-context.ts` にて `CommandContext` 型・builder `buildCommandContext(invokerCwd, resolveFn?)`（resolver injectable でユニットテスト可能）・guard `assertRepoAvailable(ctx, commandName)` を提供する。

**採用理由**: 欠陥そのものが「per-command の任意適用」である。単一のディスパッチ choke point で一括解決することで、各コマンドが個別に判断する必要をなくし、正しい基底パス導出をデフォルトにする。

**却下案: per-command の `resolveRepoRoot` 規約を徹底する。**
これは現行の構造そのものである。規約は規模で必ず漏れる — それが今回の欠陥の構造的原因。

**却下案: コマンド内部で必要になった時点で遅延解決する。**
per-command の判断を再導入し、単一 choke point での構造的修正という利点が失われる。

### D3: `requiresRepo` 宣言 + 統一エラーで repo 外起動を止める

`CommandDef`（およびサブコマンド `CommandDef`）に `requiresRepo?: boolean`（デフォルト `false`）を追加する。ディスパッチ時に `def.requiresRepo && ctx.repoRoot === null` であれば統一エラー（`ARG_ERROR` / exit 2）で停止し、prescriptionとして `git init` または repo への移動を促す。`src/errors.ts` の `repoRequiredError(command)` ファクトリが既存の `NOT_GIT_REPO` コードを再利用する。

本 change で `request new` / `job stats` を `requiresRepo: true` に設定する。`doctor` は D4 の理由により `false` を維持する。

**採用理由**: 最小の宣言面で「repo が必要なのに repo 外で起動された」ケースを確実に止める。

**却下案: 3 値 enum（`required` / `optional` / `none`）。**
`optional` と `none` の dispatch 時の振る舞いが同一（best-effort 解決、エラーなし）。`boolean` で十分。

### D4: `doctor` は repo 外実行可を維持し、`DoctorContext` に repo root フィールドを追加する

`doctor` は `requiresRepo: false` を維持する。初回セットアップ途中のユーザーが叩く診断コマンドが「repo が無い」の一言で停止するのは診断の放棄にあたるため。

代わりに `DoctorContext` に `repoRoot?: string | null` を追加し、9 つの repo/storage checks が内部状態パスを解決するとき `ctx.repoRoot ?? ctx.cwd` を使うよう変更する。repo 内で実行された場合（プロダクションケース）は root を使い、repo 外では invoker cwd にフォールバックする（`job-show.ts:42` / `ps.ts:87` の確立済み graceful degradation イディオム）。

**却下案: `ctx.cwd = repoRoot ?? invokerCwd` と上書きして checks を無変更にする。**
2 つの役割を同一フィールドに混在させることが今回の欠陥の原型であり、別フィールドで持つという要件に反する。

**却下案: doctor にも repo 必須を課す。**
上述の通り、診断コマンドが初回セットアップ中に使用不能になるのは受け入れられない。

### D5: `process.cwd()` に `src/` 全体 ratchet allowlist 歯を追加する（B-13）

architecture invariant test（`tests/unit/architecture/core-invariants.test.ts`）に `B-13: CWD` として以下を追加する:

- `src/` 内の `process.cwd()` 出現箇所（テストファイル・コメント行除く）を grep で全列挙
- すべての出現が `arch-allowlist.ts` の `CWD` エントリで覆われていることを assert
- liveness: 生の match 件数 > 0 を assert（抽出の空振りを防ぐ）
- T-04 型 regression guard: allowlist 未登録の `process.cwd()` を合成して invariant が落ちることを固定

`arch-allowlist.ts` を以下の分類でシードする:

- **permanent-legit**: 役割 (a) — `repo-root.ts`・`load-config-with-overlay.ts`・`init.ts` toplevel resolve・`job-show.ts`/`ps.ts` の graceful degradation・`doctor` の invoker-cwd default 等。役割 (b) — `command-registry.ts` の validate arg・`--prompt-file`・DI default（`deps.cwd ?? process.cwd()` 系）等
- **debt**: 未転換の内部状態パス導出（`command-registry.ts` の残余 `354/362/363/388/562/599/640/753/767/819/821`・`config/store.ts:148`・`inbox.ts:32` 等）

allowlist ガバナンスは既存 ratchet 規律と同型: エントリは削除のみ可、追加は CODEOWNERS gate。

**採用理由**: D1 の境界原則を機械的に強制する歯が存在しなければ規則は規模で漏れる。既存 B-6（`process.env`）ratchet と同型の構造で CWD 管理を持続可能にする。

**却下案: 全 `process.cwd()` を一括転換する（allowlist なし）。**
全コマンドに及ぶ変更で PR がレビュー不能になる。既存の arch-allowlist 規律と同型の漸進的焼却が確立している。

**却下案: 正当使用（役割 (a)(b)）を scan から除外して seed を縮小する。**
要件は正当使用を allowlist に列挙しコメントで区別することを明示している（それ自体がドキュメントになる）。

### D6: worktree 意味論を不変に保つ

`resolveRepoRoot` 自体は変更しない。job worktree 内では enclosing worktree の root を返す現行挙動が dispatch 経由でそのまま引き継がれ、worktree 内の起動でも正しい root が context として渡される。

## Alternatives Considered

### Alternative A: per-command の `resolveRepoRoot` 規約を review で徹底する（D2 の対抗案）

- **Pros**: 変更範囲が最小。既存の per-command パターンを踏襲する。
- **Cons**: 現行の構造そのもの。任意適用の規約は規模で必ず漏れる — それが今回の欠陥の構造的原因である。
- **Why not**: 欠陥を構造的に解決せず、症例の再発を防止できない。

### Alternative B: 全 `process.cwd()` を一括転換してから ratchet を立てる（D5 の対抗案）

- **Pros**: allowlist seed が空（または最小）になる。
- **Cons**: 全コマンドへの変更が一 PR に集中し、レビュー不能になる。
- **Why not**: 既存 arch-allowlist 規律（B-6 等）と同型の漸進的転換が確立しており、大爆発 PR は不要。

### Alternative C: `ctx.cwd` を `repoRoot ?? invokerCwd` で上書きして doctor の checks を無変更にする（D4 の対抗案）

- **Pros**: checks 側のコード変更がゼロ。
- **Cons**: invoker cwd と repo root を 1 フィールドに混在させる。「2 つの役割を別フィールドで持つ」という D1 の境界原則に反し、欠陥の原型を check 内部に再導入する。
- **Why not**: boundary violation を消すのではなく内部に押し込むだけであり、後続の変更で混乱の原因になる。

### Alternative D: `requiresRepo` を tri-state enum にする（D3 の対抗案）

- **Pros**: `optional`（best-effort、エラーなし）と `none`（resolve 不要）を意味的に区別できる。
- **Cons**: dispatch 時の振る舞いが `optional` と `none` で同一（resolve するが失敗してもエラーなし）。boolean で表現できる区別に語彙コストが不均衡。
- **Why not**: 振る舞いの差異が生じるまで拡張を遅らせるべきであり、現時点では boolean が十分。

### Alternative E: ユーザー入力相対パスも repo root 基準に統一する（D1 の役割 (b) を廃止）

すべてのパス解決を repo root 起点に統一し、`process.cwd()` の正当な役割を (a) のみとする案。

- **Pros**: `process.cwd()` の使用が最小になり、境界原則がより単純になる。
- **Cons**: `request validate src/../drafts/x.md` のような invoker 相対パスの入力が壊れる。Unix CLI の標準的な期待（引数は invoker cwd 基準で解決される）に反する。
- **Why not**: ユーザーが指定した相対パス引数を invoker cwd で解決するのは標準的な CLI の契約であり、それを破ると既存のユーザー操作（スクリプト・エイリアス等）が静かに誤動作する。役割 (b) の維持はバグではなく仕様である。

### Alternative F: doctor にも repo 必須を課す（D4 の対抗案）

`doctor` を `requiresRepo: true` にし、repo 外では他の repo 必須コマンドと同様に即座にエラーで停止する案。

- **Pros**: D2 / D3 の dispatch エラーパターンと統一でき、特例が消える。
- **Cons**: `doctor` は初回セットアップ途中のユーザーが最初に叩く診断コマンドである。repo が存在しない状態で「repo が無い」の一言で停止すると、何が問題かを診断するコマンドが問題の症状そのものによって使用不能になる（診断の放棄）。
- **Why not**: `doctor` の存在意義は repo の不健全な状態を報告することにあり、repo 不在も「報告すべき診断結果」の一つである。repo 外でも完走して該当 check を `fail` として表示する現行挙動が正しい。

## Consequences

### Positive

- subdirectory から起動した CLI コマンドが repo root 実行と同一挙動を示すようになる
- repo root 解決の「正しい場所」がディスパッチ choke point に集約され、per-command の判断が不要になる
- `process.cwd()` の不当使用（内部状態パス基点）が B-13 ratchet によって即日 CI red で検出される
- doctor が repo 外でも完走する診断能力を維持しつつ、正確な repo-aware 結果を返すようになる
- 残存 debt（未転換箇所）が allowlist に可視化され、後続 change での焼却ゴールが明確になる

### Negative

- 全コマンドのディスパッチに `git rev-parse` サブプロセスが追加される（`--help`/`--version` 後に実行されるため最悪ケースは限定的）
- `request new` / `job stats` は repo 外で静かに誤動作する代わりに、明示的なエラーで停止する（意図的な挙動変更）
- `arch-allowlist.ts` の CWD seed が大きく（~40 エントリ）、初回追加には CODEOWNERS review が必要

### Known Debt / Deferred

- **allowlist debt 焼却**: `command-registry.ts` の残余 11 箇所・`config/store.ts`・`inbox.ts` 等の未転換箇所は後続 request で分割して削除する
- **`requiresRepo` 宣言の普及**: 本 change で変換した `request new` / `job stats` 以外のコマンドへの `requiresRepo: true` 追加は後続 request に委ねる
- **エラーメッセージ・hint 文言の整合**: 別 request
- **CI での packaged smoke test**: 別 request
- **`architecture/model.md` への CWD invariant の文書化**: B-13 の歯は test + allowlist に自己完結しており、`model.md` 更新は deferred

## References

- Request: `specrunner/changes/repo-root-entry-resolution/request.md`
- Design: `specrunner/changes/repo-root-entry-resolution/design.md`
- Spec: `specrunner/changes/repo-root-entry-resolution/spec.md`
- Related: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md` — vitest arch test + ratchet allowlist の起源（B-6 等の先行 ratchet）
- Related: `specrunner/adr/2026-07-13-invariant-catalog-parity-enforcement.md` — B-x カタログパリティ歯
- Implementation: `src/cli/command-context.ts`・`src/cli/command-registry.ts`・`src/cli/doctor.ts`・`src/core/doctor/types.ts`・`src/errors.ts`・`tests/unit/architecture/core-invariants.test.ts`・`tests/unit/architecture/arch-allowlist.ts`・`tests/unit/cli/command-context.test.ts`・`tests/unit/cli/doctor-repo-root.test.ts`・`tests/unit/cli/job-stats-repo-root.test.ts`・`tests/unit/cli/request-new-repo-root.test.ts`
