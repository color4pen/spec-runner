# unpushable-path 判定と scoped residual check が stagingExcludePatterns を見ず、「絶対に commit されない path」をブロック・破壊する

## Meta

- **type**: bug-fix
- **slug**: exclusion-aware-publish-prediction
- **base-branch**: main
- **adr**: false

> 2026-08-29 改訂: オーナー裁定（コメント 2 件目、1 件目の提案は同コメントで撤回済み）を反映し、ユーザー契約の明文化・design/review への除外 scope 一貫適用・untracked 除外物の非破壊契約・docs 更新を要件に追加。

## 問題

`pipeline.stagingExcludePatterns` は「一致した path は stage されない＝commit に載らない＝push されない」ことを保証する repo 宣言である。しかし、この宣言を参照すべき 2 つの判定機構がいずれも参照しておらず、除外設定の意味論（「push される集合に入り得ない path はブロック対象にならない」）が成立していない。

### 問題 1: unpushable-path 判定（Layer 1 / Layer 2）が除外前の生の path 集合で判定する

`matchUnpushablePaths` の判定入力に `stagingExcludePatterns` が渡る箇所はゼロ（実測、2026-08-28 時点の main）:

- `src/core/step/commit-push.ts` L519-533 — `commitAndPush` の Layer 2 backstop。mixed reset 直後・staging 前に `collectPublishablePaths`（生の `git status` untracked 含む + 未 push commit の和集合）で判定し、一致で即 `UnpushablePathBlockedError` を throw。除外の解決・適用（`resolveStagingExcludePatterns` / `applyStagingExclusions`）は throw より**後**の guarded staging 段（L665-666）にしかない。
- `src/core/step/commit-push.ts` L1004-1023 — `commitScopedPaths`（並列 review round の coordinator commit）の Layer 2。同様に除外非適用。
- `src/core/runtime/local.ts` L1609-1624 — Layer 1 の violation 検出（`validateStepOutputs` の unpushable-path 分岐）。同様に生の `collectPublishablePaths`。

その結果、`stagingExcludePatterns: [".github/workflows/**"]` を設定しても、worktree の dirty な workflow ファイル（除外により**絶対に stage されない＝絶対に push されない**）が `UNPUSHABLE_PATH_BLOCKED` halt を引き起こす。「push が publish する集合の予測」としては、worktree 由来の path に除外を適用しないのは予測の誤りである。

さらに guarded mode は除外 path を復元しない（stage しないだけ）ため dirt は worktree に残り、resume 側に unpushable 系の preflight / 掃除は存在しない。halt → resume → 同じ dirt → 即再 halt の**恒久 wedge** になり、operator が worktree を手で掃除するまで job が進めない。

### 問題 2: scoped mode の residual check も除外を見ず、除外 dirt を破壊する

`commitAndPush` の scoped 分岐（guarded は implementer / code-fixer / adr-gen の 3 step のみ。**それ以外の全 step が scoped**）の residual check（`src/core/step/commit-push.ts` L568-591 → `findScopedCommitViolations` = declared + managed 以外の全 dirty path を違反扱い）も `stagingExcludePatterns` を参照しない。

guarded step が除外で worktree に残した dirt は、次の scoped step の commit で quarantine → `restoreViolatedPaths` により**破壊**（untracked は `clean -f`、tracked は `checkout HEAD`）→ `WRITE_SCOPE_VIOLATION` halt になる。つまり問題 1 だけを直しても、除外された変更は直後の scoped step で halt + 復元されるため、除外運用は依然成立しない。

導入設計（`specrunner/changes/archive/2026-08-01-guarded-staging-artifact-containment/design.md`）は除外を guarded 限定・「.gitignore が第一防衛線」としており、除外宣言の意味論が判定側に届いていないのが根本原因。

## 期待する動作（ユーザー契約）

> `stagingExcludePatterns` に一致する path は、spec-runner の delivery・完了判定・ブロック判定の対象外となる。stage / commit / push されず、その path を理由に job を halt しない。

具体的には:

1. unpushable-path 判定（Layer 1 / Layer 2 の全 call site）でブロック対象にならない
2. scoped residual check で違反・quarantine・restore の対象にならず、worktree に無害な dirt として保持されたまま処理が継続する
3. design から PR 作成まで、同じ delivery scope（除外 scope）が正本として一貫適用される — 一致 path が commit に存在しないことを未実装・design 乖離として扱わない

## 要件

1. `collectPublishablePaths` の **worktree 由来の成分（`git status`）にのみ**除外を適用する。**未 push commit 由来の成分には適用しない** — commit 済みの path は push で実際に publish されるため、除外で免除してはならない。collector を worktree 成分と unpushed-commit 成分に分離し、3 つの判定 call site（`commit-push.ts` L524 / L1014、`local.ts` L1615）すべてで一貫させる。
2. scoped residual check（`findScopedCommitViolations` の呼び出し経路）で、除外 pattern に一致する dirty path を violation から除く。quarantine / restore の対象にもしない。
3. write-scope（protected canon）違反検査は現行どおり**除外より前**の全 path に対して行う — 除外が scope enforcement を迂回できない現行不変（guarded staging の実装済み保証）を全経路で維持する。
4. **design への除外 scope 注入**: 有効な `stagingExcludePatterns` を design step の context に正規化した形で注入し、designer が一致 path を spec-runner の deliverable として計画しないようにする。request 上そのpath への変更が必要に見える場合も、設定上 spec-runner の担当外であることを design に明記させる。raw config 全体ではなく、正規化 block でよい:

   ```md
   ## Delivery exclusions

   The following paths are outside spec-runner's delivery scope and must not be required in the synthesized commits:

   - .github/workflows/**
   ```

5. **review / conformance / 完了判定への一貫適用**: code-review・custom reviewer・conformance にも同じ除外 scope を渡し、一致 path が commit に存在しないことを未実装・design 乖離として扱わない。design から PR 作成まで同じ delivery scope を正本として使う。
6. **除外された未追跡ファイルの扱い**: guarded step が除外対象の未追跡ファイルを生成した場合、stage / commit しない・residual violation にしない・quarantine しない・`git clean` で削除しない・worktree に保持したまま後続 step へ進む。job worktree 撤去時に現行ライフサイクルどおり一緒に消える。**別理由で halt / resume した場合も、worktree が継続している限り除外対象を reconcile で破壊しない**。
7. prompt 内の事前警告（`push-capability.ts` L228 の `predictedTouchedFiles` matching）にも同じ除外を適用する（agent を誤誘導しないため）。
8. **docs 契約の更新**: 現行の「GUARDED steps only」を次のように整理する — staging への適用は guarded step / 除外 scope の効力（unpushable 判定・scoped residual・design/review の delivery scope）は pipeline 全体。`docs/configuration.md` 等の該当箇所を本 issue の受け入れ対象に含める。
9. 除外 pattern の解決は既存の `resolveStagingExcludePatterns(deps.config)` を単一の解決点として再利用し、新しい設定面・abstraction 層は作らない。

## 受け入れ基準

- [ ] `stagingExcludePatterns: [".github/workflows/**"]` 設定下で、dirty な `.github/workflows/x.yml` があっても `commitAndPush`（guarded / scoped 両分岐）・`commitScopedPaths` が `UNPUSHABLE_PATH_BLOCKED` を投げない（unit test で固定）
- [ ] 同設定下で Layer 1（`validateStepOutputs`）が unpushable-path violation を報告しない
- [ ] **未 push commit に含まれる**一致 path は、除外設定に関係なく従来どおり `UNPUSHABLE_PATH_BLOCKED` になる（除外は worktree 成分のみ）。mixed reset された agent self-commit（worktree 成分に戻る）は除外対象として扱われることをテストで固定する
- [ ] scoped step の commit で、除外 pattern に一致する dirty path が `WRITE_SCOPE_VIOLATION` にならず、quarantine / restore / `git clean` もされない
- [ ] E2E ストーリー:

  ```text
  GIVEN stagingExcludePatterns に vendor/** が設定されている
  AND guarded step が vendor/generated.js を未追跡で生成する
  WHEN guarded commit → verification → scoped review → PR作成まで進む
  THEN vendor/generated.js はcommitされない
  AND worktree内では保持される
  AND unpushable / residual violationにならない
  AND jobはhaltせず完了する
  ```

- [ ] design step の context に Delivery exclusions block が注入され、review / conformance が一致 path の commit 不在を未実装として扱わない（それぞれ test で固定）
- [ ] halt → resume を挟んでも、worktree が継続している限り除外対象 path が reconcile で破壊されない
- [ ] 除外 pattern に一致**しない**宣言外 dirty path は従来どおり residual violation になる（非退行）
- [ ] 除外 pattern が protected canon path に一致しても write-scope 違反検査は迂回されない（非退行）
- [ ] `docs/configuration.md` の `stagingExcludePatterns` 記述が新契約（staging 適用 = guarded / 効力 = pipeline 全体）に更新されている
- [ ] typecheck / test / architecture tests が green

## スコープ外

- 除外された変更を job worktree 撤去後も保全する仕組み（撤去で消える現行ライフサイクルのまま）
- `.github/workflows/**` push 制約そのものの解消（GitHub 側の仕様）
- pushCapability の検出条件（`detectPushCapability`）の変更
- glob matcher の統合

## 関連

- #1078: push capability preflight（Layer 1/2 の導入）
- #1086: fixer への unpushable-path 2 層適用（Layer 2 の一本化。判定入力は本 issue の対象外だった）
- `specrunner/changes/archive/2026-08-01-guarded-staging-artifact-containment/`: stagingExcludePatterns の導入設計（guarded 限定・scoped 非適用の経緯）
- `src/git/push-capability.ts` L121-193（`collectPublishablePaths` — worktree 成分と commit 成分の合流点）
- `src/core/step/write-scope.ts` L163-171（`findScopedCommitViolations`）