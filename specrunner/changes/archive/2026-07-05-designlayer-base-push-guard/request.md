# designLayer 有効時に未 push の設計コミットを run 前に警告する

## Meta

- **type**: new-feature
- **slug**: designlayer-base-push-guard
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

job の worktree は `origin/<baseBranch>` を base に分岐する。designLayer の入口ゲート（`<command> check --request`）は preflight で **local checkout** に対して走るため、local にのみ存在する（origin へ未 push の）設計/bootstrap コミットがあると preflight は pass する。しかし worktree（origin base）はそれらのコミットを欠くため、worktree 内で走る request-review が request の引用する設計要素（`[[id]]` / ADR 等）を解決できず、pipeline 途中で escalation する。

利用者から見ると、preflight を通過したのに後段で「設計要素が見つからない」と落ちるため、原因（base が origin であること・設計コミットが未 push であること）を追いにくい。local が remote より **behind** の場合の informational warning は既にあるが、local が **ahead**（未 push コミットがある）ケースの警告は無い。

## 現状コードの前提

- `src/core/runtime/local.ts:395`: `const remoteBaseRef = \`origin/${baseBranch}\`;` — worktree はこの ref を base に分岐する。
- `src/core/runtime/local.ts:471-481`: local `baseBranch` が `remoteBaseRef` より **behind** のとき `git rev-list HEAD..${remoteBaseRef} --count` を用いて informational warning を出す。**ahead**（未 push）のケースは検出しない。
- `src/core/preflight.ts:103-105` → `src/core/design-layer/check-gate.ts:34-72`: designLayer enabled 時に `<designLayer.command> check --request <path>` を preflight の cwd（local checkout）で実行し、exitCode 0 を pass とする。base ref（origin/<base>）に対しては検証しない。

## 要件

1. **docs**: job worktree の base が `origin/<baseBranch>` であること、および designLayer 連携時は request が引用する設計要素を含むコミットを `origin/<baseBranch>` に **push してから run** すること、を明文化する。
2. **run 前の警告**: designLayer が enabled かつ local `<baseBranch>` が `origin/<baseBranch>` より ahead（未 push コミットがある）のとき、run 前（preflight 相当のタイミング）に明確な warning を出す。worktree が origin base で作られるため引用設計要素を欠く可能性がある旨と、push する対処を示す。

## スコープ外

- designLayer コマンド（aozu 等）側の resolution ロジック変更。designLayer は opaque command のまま扱う。
- base ref を local HEAD に変える案（再現性・clean base を壊す）。
- hard-fail 化（未 push コミットが設計と無関係な場合に正当な run を誤ブロックするため、本 request では非ブロッキング warning に留める。より厳格な gate は将来の別 request）。
- designLayer disabled 時の挙動（変更しない）。

## 受け入れ基準

- [ ] designLayer enabled かつ local `<baseBranch>` が `origin/<baseBranch>` より ahead のとき、run 前に未 push を示す warning（worktree が引用設計要素を欠く可能性 + push 手順）が出ることをテストで固定する。
- [ ] designLayer disabled のとき、または ahead が 0 のときは当該 warning が出ないことをテストで固定する。
- [ ] docs に「worktree の base = origin/<baseBranch>」と「designLayer 連携時は設計コミットを push してから run」の記述が追加される。
- [ ] 既存の behind-warning の挙動は不変（既存テスト無変更 green）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- 既存の behind-warning（`src/core/runtime/local.ts:471-481`）の対称として ahead（未 push）検出を追加する。`git rev-list ${remoteBaseRef}..${baseBranch} --count` で ahead 数を求め、designLayer enabled かつ ahead > 0 のときのみ warning を出す。
- 判定は非ブロッキング warning に留める。designLayer 有効時に限定することで、designLayer を使わないプロジェクトには影響を与えない。

**却下**

- hard-fail 化: 未 push コミットが設計と無関係なケースで正当な run を誤ブロックする。まず可視化（warning）で原因追跡を容易にするのが低リスク。
- designLayer コマンドを base ref 解決に対応させる: 外部ツールへの依存を深め、opaque command として扱う既存設計に反する。
