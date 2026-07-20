# CLI の repo root 解決を entry に一本化する — cwd 暗黙仮定で subdirectory 起動が静かに誤動作する問題の構造解

## Meta

- **type**: spec-change
- **slug**: repo-root-entry-resolution
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: cwd の役割を CLI 全体で限定する横断的な境界決定を含むため true -->

## 背景

複数のコマンドが「cwd = repo root」を暗黙に仮定している。repo root 解決（`resolveRepoRoot`）は per-command の任意適用で、通すコマンド（`job prune` / `job cancel` / `inbox` / `attach` / `job show` 等）と `process.cwd()` を内部状態パスの基点として直接使うコマンドが混在する。subdirectory から起動すると、エラーにならず静かに誤った結果を返す。

実測した症状（v0.4.1、npm 公開物含む）:

- `job stats` を `src/` から実行 → `No runs found. Summary: 0 runs`（repo root では 400+ run 表示）
- `doctor` を `src/` から実行 → `workflow-structure` が偽 warn、`local-state-writable` が `src/.specrunner/local` を参照、`orphan-sidecars` が偽 pass（実際には orphan 74 件）
- subdirectory から `request new` → `<subdir>/specrunner/drafts/<slug>/request.md` に入れ子構造を生成。出力は相対パス表示のため誤りが見えない

配布は `npm install -D` + `npx` であり、npx は node_modules を上方探索するため subdirectory からの起動は正規経路。「起動できる範囲」が「正しく動く範囲」より広い状態にある。

## 現状コードの前提

- `src/util/repo-root.ts:9` — `resolveRepoRoot(cwd?)` は `git rev-parse --show-toplevel` で root を返す（repo 外は null）。`:24` に throw 版 `resolveRepoRootOrFail` もある。worktree 内では enclosing worktree の root を返す
- `src/cli/command-registry.ts` — `process.cwd()` の直接使用が 14 箇所（334, 354, 363, 381, 388, 538, 562, 599, 640, 683, 753, 767, 819, 821）。うち :334（`request new`）・:683（`job stats`）は cwd を repo root として下流に渡す。一方 :381（`request validate` のファイル引数）・:538（`--prompt-file`）はユーザー入力相対パスの解決基準としての正当な使用
- `src/cli/doctor.ts:174` — `DoctorContext.cwd` に `process.cwd()` を設定。doctor checks 9 ファイル（`src/core/doctor/checks/` の repo/ 3・storage/ 5・runtime/package-manager.ts）が `ctx.cwd` を repo root として使用。`src/core/doctor/checks/storage/orphan-worktrees.ts` は `repoRoot: ctx.cwd` と直接渡している
- `src/core/command/job-stats.ts:347` — `runJobStats(opts: { cwd, json })` は受け取った cwd を repo root として扱う
- `src/core/command/request.ts:150` — `executeNew` 系は `opts?.cwd ?? process.cwd()` を基点に `specrunner/drafts/` を作る
- `src/cli/job-show.ts:42` — `(await resolveRepoRoot()) ?? process.cwd()` の graceful degradation パターンが既にある
- `tests/unit/architecture/core-invariants.test.ts` + `tests/unit/architecture/arch-allowlist.ts` — grep ベースの invariant を allowlist（ratchet: エントリは削除のみ可、追加は CODEOWNERS gate）でフィルタする機構が確立済み

## 要件

1. **cwd の役割を 2 つに限定する**（境界原則、ADR 対象）: (a) repo root 探索の起点 (b) ユーザーが引数で指定した相対パスの解決基準。内部状態パス（`.specrunner/` / `specrunner/drafts` / `specrunner/changes` 等）はすべて repo root 起点で導出する。

2. **dispatch で一度だけ解決する**: コマンド dispatch 時に repo root を一度解決し、handler へ context として渡す。各コマンドは repo 要否を宣言し、必要なのに repo 外で起動された場合は統一エラー（非ゼロ exit + `git init` または repo への移動を促す処方）で停止する。`doctor` は repo 外でも実行可能とし、repo 不在は該当 check の fail として報告する（現行挙動の維持）。

3. **症例 3 経路を root 起点に修正する**: `doctor`（`DoctorContext` が invoker cwd と別に repo root を持ち、checks は root を使う）/ `job stats`（`command-registry.ts:683`）/ `request new`（`command-registry.ts:334` → `request.ts:150`）。subdirectory から実行しても repo root 実行と同一挙動にする。

4. **歯（ratchet）**: architecture invariant test に「`src/` 内の `process.cwd()` 出現は allowlist 記載箇所に限る」を追加する。allowlist は現存する未転換箇所（本 request で修正しない command-registry の残余・core 各所・要件1(b) の正当使用）を列挙して seed し、既存 ratchet と同じ規律（削除のみ可）に従う。正当使用（役割 (a)(b)）は恒久 allowlist としてコメントで区別する。

5. **worktree 意味論の維持**: job worktree 内での実行は enclosing worktree の root を基点とする（現行 `resolveRepoRoot` の挙動を変えない）。

## スコープ外

- allowlist に残した未転換箇所の焼却（後続 request に分割）
- エラーメッセージ・hint 文言の整合性改善（別 request）
- CI での packaged smoke test（別 request）
- `resolveRepoRoot` 自体の実装変更

## 受け入れ基準

- [ ] **T1（doctor の subdir 同値）**: git repo の subdirectory から実行した `doctor` の check 結果（name / status / message の組）が repo root から実行した場合と同一であることを固定する。**破壊確認**: root 解決を無効化（cwd 直接使用に戻す）と本テストが落ちること。
- [ ] **T2（job stats の subdir 同値）**: archive 済み run を持つ fixture repo の subdirectory から実行した `job stats` が repo root 実行と同一の run 集合を返すことを固定する。
- [ ] **T3（request new の subdir 同値）**: subdirectory から実行した `request new` が repo root の `specrunner/drafts/<slug>/request.md` を作成し、subdirectory 配下に入れ子構造を作らないことを固定する。
- [ ] **T4（ユーザー入力相対パスの回帰防止）**: subdirectory から `request validate <相対パス>` を実行したとき、相対パスが invoker cwd 基準で解決されることを固定する（役割 (b) の維持）。
- [ ] **T5（歯）**: allowlist に無い `process.cwd()` を `src/` に追加すると invariant test が落ちることを固定する。
- [ ] **T6（repo 外 doctor の回帰防止）**: git repo 外で実行した `doctor` が crash せず完走し、repo 系 check を fail として報告することを固定する。
- [ ] **T7**: `typecheck && test` が green（本 request で意味が変わる cwd 前提テストの期待更新を除き、既存テストは無変更で green）。

## architect 評価済みの設計判断

- **dispatch での一括解決 + context 渡し**。→ 却下: per-command で `resolveRepoRoot` を呼ぶ規約の徹底（任意適用が今回の欠陥の構造そのものであり、規約は規模で必ず漏れる）。
- **ratchet allowlist で段階転換**。→ 却下: 全 `process.cwd()` の一括転換（変更範囲が全コマンドに及び、レビュー不能な PR になる。既存の arch-allowlist 規律と同型の漸進が確立している）。
- **cwd の役割 (b)（ユーザー入力相対パス）は維持**。→ 却下: すべてのパスを root 基準に統一（`request validate src/../drafts/x.md` のような invoker 相対の入力が壊れ、標準的な CLI の期待に反する）。
- **doctor は repo 外実行可を維持**。→ 却下: doctor にも repo 必須を課す（初回セットアップ途中のユーザーが最初に叩く診断コマンドが「repo が無い」の一言で死ぬのは診断の放棄）。
