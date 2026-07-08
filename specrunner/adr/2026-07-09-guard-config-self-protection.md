# fast pipeline のガード構成データを自己保護する

**Date**: 2026-07-09
**Status**: accepted
**Related**:
- `specrunner/adr/2026-07-06-fast-forbidden-surfaces-repo-config.md`（forbidden surfaces を repo config に移した経緯 — 本 ADR が対処する脆弱性の起点）
- `specrunner/adr/2026-06-14-pipeline-scope-declaration-machine-escalation.md`（permissionScope / scope-check / conformance checkpoint 機構）
- `specrunner/adr/2026-06-07-no-worktree-execution-mode.md`（CLI dispatch 層の `detectWorktree` ガード）

## Context

`2026-07-06-fast-forbidden-surfaces-repo-config.md` で forbidden surfaces を `.specrunner/config.json` の per-repo 宣言に移した結果、ガードの構成データ自体が fast pipeline の agent が編集可能な mutation surface の内側に入った。

これにより 2 つの脆弱性経路が生じた:

**経路 1: run を跨ぐ自己解除**
fast job が worktree 内で `.specrunner/config.json` から surface 宣言を削除しても、config 自身はどの forbidden surface にも一致しないため conformance は breach を検出しない。その PR が merge されると以後の全 fast run が無防備になる。実行中の run 自体は preflight が main checkout 側の config を先読みするため安全であり、危険なのは merge 後の後続 run である。

**経路 2: worktree 内 resume による config 差し替え**
`job resume` は cwd から `resolveRepoRoot` → `loadConfig` で config を解決する。job worktree 内の cwd から resume すると、agent が改変した worktree 側の `.specrunner/config.json` が guard 判定前に読まれ得る。

既存の CLI dispatch 層ガード（`bin/specrunner.ts` の `detectWorktree`）は「任意の git worktree 内であれば `job start/resume/archive/prune` を exit 2 で拒否」する汎用ガードであり、この脆弱性は dispatch 層と一致しない層（resume の config 読み込み経路）に存在する。

## Decision

### D1: config 自身を forbidden surface `guard-config` として宣言する

`.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` に
`{ "id": "guard-config", "paths": [".specrunner/config.json"] }` を追加する。

これにより:
- fast job が config を変更した場合、既存の scope-breach 検出経路（changed files vs forbidden surfaces の glob 照合）がそのまま breach を検出する
- agent が surface 宣言を削除・改変しても、その変更自体が config 変更として breach になる（自己保護の閉包）
- config 全体が対象になるため、forbidden surfaces 以外のガード設定（verification coverage 等）も同時に保護される

**却下した代替案**:
- *registry 側ハードコードに戻す* — per-repo 宣言の利点（`2026-07-06` の導入意図）を失う。他 repo が自分の保護対象を宣言できなくなる
- *config の hash を job state に記録して resume 時に照合する* — 改変を検知できるが、並行 merge による正当な config 変更との区別に人間の判断が必要になり escalation が増える

### D2: worktree 内 resume は config 読み込み前に command 層で「拒否」する

`ResumeCommand.prepare()` の最上部（job state 解決前・config 読み込み前）で、起動 cwd の実パスが specrunner の job worktree（`.git/specrunner-worktrees/` 配下）であるかを判定し、該当すれば非 0 exit で拒否する。

- 判定はすべての副作用（config 読み込み・state 解決・state 遷移・永続化）より前に置く
- 機械的な条件（cwd 実パスの path segment 照合）のみで判断し、agent や運用者の判断場面を増やさない
- 通常 runbook（main checkout から resume）と整合し、案内文言でその旨を示す

**却下した代替案**:
- *worktree path から main root を導出して config を読み替える「リダイレクト」* — no-worktree mode やカスタム配置で分岐が増え、「どの config が読まれたか」が cwd に依存して不透明になる
- *既存 CLI dispatch 層ガード（`detectWorktree`）のみに委ねる* — dispatch 層の汎用ガードは脆弱性の実在層と一致しない。command を直接呼ぶ経路や将来のリファクタで保護が外れ得る。受け入れ基準（config 読み込み前に command 層で拒否）を command 単位のテストで固定するため、command 層ガードを追加する

### D3: 判定は specrunner 固有の path-segment 照合（`detectSpecrunnerWorktree`）で行う

新しい helper `detectSpecrunnerWorktree(cwd)` を `src/core/worktree/detection.ts` に置く。cwd を `fs.realpath` で正規化し、path segment に `.git` の直後に `specrunner-worktrees` が現れるかで判定する。該当時は `.git` の親を main checkout root として返す（エラー案内用）。

既存 `detectWorktree` との棲み分け:
- `detectWorktree` — 任意の git worktree（ユーザ自身の worktree を含む）を `.git` ファイル解析で検出する汎用述語。CLI dispatch 層の外側ガード
- `detectSpecrunnerWorktree` — `.git/specrunner-worktrees/` 配下という specrunner 固有の条件のみを対象とする最小述語。command 層の内側ガード

realpath 正規化により macOS の `/var`→`/private/var` 等の symlink でも安定判定する。

**却下した代替案**:
- *`detectWorktree` を再利用して戻り値で分岐* — 汎用検出（任意 worktree 拒否）と本要件（specrunner worktree のみ）が意味としてぶれる。worktree 検出ロジックを `detection.ts` に集約する整理とも一致する

### D4: exit code と案内は既存 `worktreeGuardError` を再利用する

拒否時は `worktreeGuardError("job resume", mainCheckoutPath)` のメッセージ（"This command cannot be run from inside a worktree."）と hint（"Run from the main worktree: cd \<path\>"）を出力し、exit 2（`ARG_ERROR` / `WORKTREE_GUARD`）で終了する。

CLI dispatch 層ガードと同一の exit code・メッセージ体系を使うことで、ユーザーが受け取るエラー体験を一貫させる。

## Alternatives Considered

### A1: forbiddenSurfaces を registry 側ハードコードに戻す

config への外出し（`2026-07-06`）以前の状態に戻し、spec-runner 固有の 3 面を `FAST_DESCRIPTOR.permissionScope.forbidden` にリテラルで再宣言する。

- **Pros**: config が編集される脆弱性を根本から避けられる
- **Cons**: per-repo 宣言（`2026-07-06` の導入意図）を失う。他の repo で fast を使う場合、保護対象を自分で宣言できなくなる。製品コードへの dogfooding 設定漏れが再発する
- **Why not**: 却下。config の自己宣言（D1）で同じ保護が得られ、per-repo 宣言の利点を維持できる

### A2: config の hash を job state に記録して resume 時に照合する

job 開始時の `.specrunner/config.json` のハッシュを job state に保存し、resume 時に現在の config と照合する。差異があれば resume を拒否または escalation する。

- **Pros**: config の改変を resume 時に検知できる。config が変更された事実を正確に捕捉できる
- **Cons**: 並行 merge による正当な config 変更（他 PR が先に main に入った場合など）との区別に人間の判断が必要になり escalation が増える。「どの変更が改ざんで、どれが正当か」を機械的に判定できない
- **Why not**: 却下。D2 の機械的 cwd 判定（worktree 内なら拒否）の方が判断場面を作らない。hash 照合は検知精度は高いが運用コストが増える

### A3: worktree path から main root を導出して config を読み替える（リダイレクト）

worktree cwd から `.git/specrunner-worktrees/` のパターンで main checkout root を逆算し、main 側の `.specrunner/config.json` を読み込む。

- **Pros**: resume 操作が worktree 内から透過的に続行できる。ユーザーが cwd を意識する必要がない
- **Cons**: no-worktree mode やカスタム worktree 配置で分岐が増える。「どの config が読まれたか」が cwd に依存して不透明になる。逆算ロジックが壊れたとき worktree 側の改変 config が無言で読まれる
- **Why not**: 却下。「どの config が読まれたか」が自明でなくなることは本脆弱性の性質上受け入れられない。拒否 + 明示案内（D2）の方が透明性が高い

### A4: 既存 CLI dispatch 層ガード（`detectWorktree`）のみに委ねる

追加の command 層ガードを実装せず、`bin/specrunner.ts` の既存 `detectWorktree` が `job resume` を worktree 内で拒否することに依存する。

- **Pros**: 追加コードが不要。既存ガードを再利用できる
- **Cons**: dispatch 層の汎用ガードは脆弱性の実在層（resume の config 読み込み経路）と異なる層にある。command を直接呼ぶ経路や将来のリファクタで保護が外れ得る。command 単位の受け入れ基準（config 読み込み前に拒否）をテストで固定できない
- **Why not**: 却下。command 層に specrunner 固有のガードを置くことで、呼び出し経路によらない invariant が保証され、テストで独立して固定できる（D2・D3）

### A5: `detectWorktree` を再利用して戻り値で分岐する

既存の `detectWorktree` を呼び出し、戻り値（worktree 内かどうか）を使って specrunner worktree か否かを判定する。

- **Pros**: 新しい helper 関数が不要。コードの追加が最小
- **Cons**: `detectWorktree` は「任意の git worktree」を対象とする汎用述語であり、本要件（specrunner 固有の `.git/specrunner-worktrees/` 配下のみ）と一致しない。ユーザー自身の git worktree から resume した場合も誤ってブロックする可能性がある
- **Why not**: 却下。`detectSpecrunnerWorktree` として specrunner 固有の述語を分離し、worktree 検出ロジックを `detection.ts` に集約する（D3）

## Consequences

### Positive

- fast pipeline のガード構成が自己保護の閉包を持つ。agent が config から surface 宣言を削除しても breach として検出されるため、「run を跨ぐ自己解除経路」が塞がれる
- resume の config 読み込み経路への worktree ガードが command 層に存在し、呼び出し経路によらず invariant が保証される。テストも command 単位で固定できる
- 既存の scope-breach 検出機構（`deriveScopeBreach` / ConformanceStep）・既存の `worktreeGuardError` 体系・既存の dogfooding テスト形式をすべてそのまま利用し、新しい検出機構を追加しない

### Negative / Known Debt

- CLI dispatch 層（`detectWorktree` 汎用ガード）と command 層（`detectSpecrunnerWorktree` 固有ガード）の二層が共存する。後述の補完関係が周知されないと dead code と誤認されるリスクがある。本 ADR と design.md に補完関係を明記することで対処する
- `job resume` のみがこの command 層ガードを持ち、`job start / archive` 等は対象外（スコープ外）。将来、resume 以外のコマンドへの cwd 検証が必要になった場合、`detection.ts` の `detectSpecrunnerWorktree` を再利用できる
- config の inline 文言（`src/core/command/resume.ts`）が `worktreeGuardError` の文言と一部乖離しており、将来の文言統一時に漏れ場所になり得る（non-blocking; review-002 F-1 で記録済み）

## References

- Request: `specrunner/changes/guard-config-self-protection/request.md`
- Design: `specrunner/changes/guard-config-self-protection/design.md`
- Extends: `specrunner/adr/2026-07-06-fast-forbidden-surfaces-repo-config.md`（D1-D6 の forbidden surfaces 設計。本 ADR は config 自身の自己保護という閉包要件を追加する）
