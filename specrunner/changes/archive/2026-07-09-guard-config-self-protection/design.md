# Design: fast pipeline のガード構成データを自己保護する

## Context

fast pipeline の forbidden surfaces は `.specrunner/config.json` の
`pipeline.fast.forbiddenSurfaces` に per-repo 宣言される。config はガードの構成データ
（forbidden surfaces、verification の coverage 宣言）を保持するが、この config ファイル自身は
fast job の agent が編集可能な mutation surface の内側に置かれている。

現状のガード構成は 3 surface（`public-types` / `persisted-format` / `state-transitions`）を
宣言するが、config 自身を保護する surface は無い。このため:

1. **run を跨ぐ自己解除経路**: fast job が worktree 内で config から surface 宣言を削除しても、
   config 自身はどの forbidden surface にも一致しないため conformance は breach を検出しない。
   その PR が merge されると、以後の全 fast run が無防備になる。実行中の run 自体は preflight が
   main checkout 側の config を先読みするため安全であり、危険なのは merge 後の後続 run である。
2. **worktree 内 resume 経路**: `job resume` は cwd から repoRoot を解決して config を読む
   （`src/core/command/resume.ts` の `resolveRepoRoot(cwd)` → `loadConfig`）。job worktree 内の
   cwd から resume すると、agent が改変した worktree 側の config が guard 判定前に読まれ得る。

### 既存のガード資産（重要）

- `bin/specrunner.ts` には既存の worktree ガードがあり、`job start/resume/archive/prune` は
  `detectWorktree(process.cwd())` により「git worktree 内であれば」CLI dispatch 層で exit 2
  拒否される（`src/errors.ts` の `worktreeGuardError` / `WORKTREE_GUARD` → ARG_ERROR）。
  この既存ガードは汎用（任意の git worktree を対象）で、CLI dispatch 層に位置する。
- 本 change は、脆弱性が実在する層（resume の config 読み込み経路）に、specrunner 固有
  （`.git/specrunner-worktrees/` 配下か）の command 層ガードを追加する。両者は補完関係にあり、
  command 層ガードは呼び出し経路に依存せず invariant を保証し、command 単位でテスト可能である。

### スコープ内でのコード前提

- `src/core/pipeline/scope.ts` の `deriveScopeBreach` は forbidden surface の各 path glob を
  changed files（repo-relative）に対して `matchGlob` で照合する。full-path 一致のため
  surface path `.specrunner/config.json` は changed file `.specrunner/config.json` に一致する。
- `src/core/step/scope-check.ts` は checkpoint step（fast では conformance）でのみ scope 合成を行う。
- dogfooding テスト（`tests/unit/core/pipeline/resolve-scope.test.ts`）は実 config を読み、
  `surfaces.some((s) => s.id === ...)` の加算安全な形で surface 宣言を固定する。
- fixture テスト（`tests/unit/core/step/fast-scope-checkpoint.test.ts`）は StepExecutor +
  ConformanceStep を config 由来の permissionScope で駆動し breach 検出を固定する。

## Goals / Non-Goals

**Goals**:

- config 自身を fast pipeline の forbidden surface として宣言し、config への変更を conformance の
  既存 breach 検出経路で捕捉する（run を跨ぐ自己解除経路を塞ぐ）。
- worktree 内 cwd からの `job resume` を、config 読み込み前に command 層で機械的に拒否する
  （worktree 内 resume 経路を塞ぐ）。
- 上記 2 点を既存のテスト形式に従って固定する。

**Non-Goals**:

- standard / design-only pipeline への forbidden surface 宣言の追加。
- conformance / escalation / capability gate 機構本体の変更。
- resume 以外のコマンド（job start / archive 等）への cwd 検証の追加。
- config の hash 照合・署名などの改竄検知機構。
- 既存 CLI dispatch 層ガード（`detectWorktree`）の変更・置換。

## Decisions

### D1: config 自身を forbidden surface `guard-config` として宣言する

`.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` に
`{ "id": "guard-config", "paths": [".specrunner/config.json"] }` を追加する。

- **Rationale**: ガードの構成データが mutation surface の内側にある問題は、config 自身を保護対象に
  含めることで、既存の scope-breach 検出（changed files vs forbidden surfaces）にそのまま乗る。
  新しい検出機構を作らず、agent による surface 宣言の削除・改変も config 変更として breach になる。
  path は config 全体を対象にするため、coverage 宣言など config 内の他のガード設定も同時に保護される。
- **Alternatives considered**:
  - forbiddenSurfaces を registry 側ハードコードに戻す — per-repo 宣言（fast-scope-config の導入意図）
    の利点を失うため却下。
  - config の hash を job state に記録して resume 時に照合する — 並行 merge による正当な config 変更
    との区別に判断が必要になり escalation が増えるため却下。

### D2: worktree 内 resume は config 読み込み前に「拒否」する

`ResumeCommand.prepare()` の最上部（job state 解決前・config 読み込み前）で、起動 cwd の実パスが
specrunner の job worktree（`.git/specrunner-worktrees/` 配下）であるかを判定し、該当すれば非 0 exit
で拒否する。

- **Rationale**: 判定は機械的（cwd 実パスの path segment 照合）で、agent や運用者の判断場面を
  増やさない。通常 runbook（main checkout から resume）とも整合する。脆弱性が実在する層に直接
  ガードを置くことで、呼び出し経路に依存しない invariant となり command 単位でテストできる。
  prepare() 最上部に置くことで、config 読み込みだけでなく worktree 側 state の読み込み・
  state 遷移（running 化・永続化）よりも前に拒否でき、副作用ゼロで終了する。
- **Alternatives considered**:
  - worktree path から main root を導出して config を読み替える「リダイレクト」案 — no-worktree
    mode やカスタム配置で分岐が増え、どの config が読まれたかが cwd に依存して不透明になるため却下。
  - 既存 CLI dispatch 層ガード（`detectWorktree`）のみに委ねる — dispatch 層の汎用ガードは
    脆弱性の実在層と一致せず、command を直接呼ぶ経路や将来のリファクタで保護が外れ得る。命令の
    受け入れ基準（config 読み込み前に command 層で拒否）を command 単位で固定するため、追加する。

### D3: 判定は specrunner 固有の path-segment 照合で行う

判定ロジックは新しい helper（例: `detectSpecrunnerWorktree(cwd)`）として
`src/core/worktree/detection.ts` に置く。cwd を `fs.realpath` で正規化し、path segment に `.git` の
直後 `specrunner-worktrees` が現れるかで判定する。該当時は `.git` の親を main checkout root として
併せて返す（エラー案内用）。

- **Rationale**: 既存 `detectWorktree` は「任意の git worktree」を `.git` ファイル解析で検出する
  汎用関数で、ユーザ自身の worktree も拒否対象にする。本ガードは architect 決定どおり
  `.git/specrunner-worktrees/` 配下という specrunner 固有の条件のみを対象とし、`.git` ファイル
  パースに依存しない最小の述語にする。worktree 検出ロジックは detection.ts に集約する。
  実パス正規化により、symlink（macOS の `/var`→`/private/var` 等）や相対 cwd でも安定判定する。
- **Alternatives considered**:
  - `detectWorktree` を再利用し戻り値で分岐 — 汎用検出（任意 worktree 拒否）と本要件（specrunner
    worktree のみ）が一致せず、意味がぶれるため却下。

### D4: exit code と案内は既存 `worktreeGuardError` を再利用する

拒否時は `worktreeGuardError("job resume", mainCheckoutPath)` のメッセージ／hint を出力し、
`prepare()` からは exit 2（ARG_ERROR）で中断する（`ResumeCommand.execute()` が拾う内部
`PrepareError(2, ...)` を用いる）。

- **Rationale**: メッセージ（"cannot be run from inside a worktree"）と hint（"Run from the main
  worktree: cd <path>"）が既存 CLI dispatch 層ガードと一致し、exit 2 も既存 WORKTREE_GUARD と揃う。
  新しい error code は不要。hint が main checkout からの再実行案内を満たす。

## Risks / Trade-offs

- **[Risk] テストが worktree 内で実行され、resume ガードが既存テストを誤爆させる**（本 change の
  検証自体もこの worktree で走る）→ **Mitigation**: 既存 resume テストは全て `cwd: tempDir`
  （mkdtemp のパス、`.git/specrunner-worktrees/` 配下でない）を明示注入しており、ガードは no-op。
  新規テストは tempDir 配下に実在する `.git/specrunner-worktrees/<slug>-<id>` ディレクトリを作成し
  そこを cwd に渡す。
- **[Risk] realpath の prefix 差（macOS の `/private` 付与）で main-path の完全一致 assert が壊れる**
  → **Mitigation**: 新規テストは案内文言のパターン（"cannot be run from inside a worktree" と
  "Run from the main worktree"）を assert し、main-path の完全一致には依存しない。
- **[Risk] surface 追加で既存 dogfooding テストが壊れる** → **Mitigation**: 実 config を読むテストは
  `.some(...)` の加算安全形。`toHaveLength(3)` の 2 箇所はローカル fixture（`makeConfigWithSurfaces`）
  に対する assert で、実 config の surface 数に依存しない。
- **[Risk] CLI dispatch 層ガードと重複して見え、dead code と誤認される** → **Mitigation**: design で
  補完関係（dispatch 層＝汎用外側、command 層＝specrunner 固有・脆弱性実在層）を明記し、command
  単位のテストで固定する。
- **[Trade-off] config path を `.specrunner/config.json` に固定** — user global config
  （`~/.config/specrunner/config.json`）は surface 対象外だが、fast job の worktree 内に存在せず
  changed files にも現れないため保護不要。project local config のみが agent 編集可能な対象である。

## Open Questions

なし（architect 評価済みの設計判断で確定。standard / design-only への拡張、hash 照合、他コマンドへの
cwd 検証は明示的にスコープ外）。
