# ADR-20260709: Worktree Job による Main Checkout 逃避書き込みの検出 backstop

## Status

Accepted (2026-07-09)

## Context

worktree mode の job では agent は job worktree 内でのみ作業する前提だが、claude-code adapter は
tool のパス制限を持たない（`permissionMode: "bypassPermissions"`、`canUseTool` 未使用）。
そのため Edit / Write / Bash いずれでも絶対パスで main checkout 側へ書き込める。

実際に、fast pipeline の run 中に agent が main checkout 側の `.specrunner/config.json` を直接編集する事象が
発生した。worktree 側 branch には同変更が正当に commit 済みであり、main 側への書き込みは「逃避書き込み」である。
この書き込みは既存のどの機構でも検出されず、後日 `git pull` 失敗で偶然発覚した。

既存の検査面がこの経路を観測できない理由:

- **conformance の scope 検査**（`scope-check.ts`）は worktree 内の branch diff（base…HEAD の changed files）だけを見る。
  main checkout への直接書き込みは branch diff に現れないため観測範囲外。
- **main checkout の clean 検査**（`local.ts:288-294`）は no-worktree mode の run 開始時にしか存在しない。

本 ADR は「制限をすり抜けた書き込みを検出する backstop 層」の設計判断を記録する。
adapter 側のパス制限（`canUseTool` / sandbox によるスコープ制限）は別 request で行い、
本層はその一次防御を補完する二次検出層として機能する。

## Decision

### 二層セキュリティモデル（防止層 + 検出 backstop 層）

adapter 側の書き込みスコープ制限（防止層）と、step 境界での逃避書き込み検出（検出 backstop 層）を
意図的に分離した独立した change として実装する。

防止層がすり抜けた書き込みを検出 backstop 層が捕捉する設計であり、両層は complementary である。
防止層がなくても検出層は機能し、検出層がなくても防止層は機能する。これにより変更単位を独立させ、
それぞれを単独で検証・改善できる。

### D1: 検出方式は「agent step 境界の before/after 状態比較」

agent step 実行の直前と直後（成功時）に main checkout 側監視対象 path のスナップショットを取り、
差分を検出する。タイミングは executor の `runAgentStep` 境界に置き、成功フローのみで実行される
（失敗・timeout 時は実行しない）。

**却下した代替案**:
- *fs.watch による常時監視*: プラットフォーム依存とリソースコストに対し、step 境界比較で検出時機として十分。
- *adapter 側でのパス制限のみ*: 別 request の責務。本層は「すり抜けた書き込みの検出」に限定する。

### D2: I/O は RuntimeStrategy seam に閉じ込め、判定は純関数モジュールに分離

新しい seam `snapshotMainCheckoutGuard(cwd, config)` を `RuntimeStrategy` port に **optional** で宣言し、
`RealRuntimeStrategy` では **required** として実装を強制する（`canDeriveChangedFiles` と同じパターン）。

差分判定・監視 path 解決・型は step 層の純関数モジュール `src/core/step/main-checkout-guard.ts` に置き、
executor が委譲する。snapshot DTO（`{ entries: { path; hash }[] }`）は port 層に置く。

これにより:
- test fake は `RuntimeStrategy` 型の optional を実装しないまま通る（無改修）。
- 実 runtime は compile 時に実装が強制される。
- managed runtime は常に `null` を返し「local worktree 前提の検査」であることが型で自己文書化される。

**却下した代替案**:
- *executor が `spawnFn` で直接 git を叩く（sibling module に I/O を持つ）*:
  managed / no-worktree の分岐を executor 側で抱えることになり、seam の一貫性を崩す。
  seam に寄せることで managed = null が自然に無効化され、module-boundary invariant（`core` は外部
  I/O に直接依存しない）を維持できる。

### D3: 監視対象 = forbiddenSurfaces（fast）globs + `.specrunner/**`、pipeline 非依存

監視 glob は `resolvePipelineForbiddenSurfaces(config, "fast")` の全 `paths` を flatten したものに
`.specrunner/**` を加え dedupe した集合とする。実際に走る pipeline に関わらずこの集合を監視する。

attended 運用では操作者が main checkout で並行編集するのが通常のため、全域比較は誤検出が常態化する。
ガード価値が最も高いのは自己解除経路（guard 構成データ）であり、そこに絞る。

`.specrunner/` 配下で非 ignore なのは `.specrunner/config.json` のみ（`.gitignore` の規則による）。
`git status --porcelain`（`--ignored` なし）は ignore ファイルを列挙しないため、job 自身の
liveness/logs 書き込み（`.specrunner/local/` 等）は自然に監視対象外になり自己誘発の誤検出が起きない。

**却下した代替案**:
- *`resolvePipelineForbiddenSurfaces(config, activePipelineId)` を使う*: fast 以外では `[]` を返し
  監視が消える。pipeline 非依存の要件に反する。

### D4: スナップショットは `git status --porcelain -z --no-renames` + content hash マップ

main checkout で `git status --porcelain -z --no-renames` を実行し、出力 path を監視 glob で
`matchGlob` フィルタし、残った各 path について作業ツリーの content を sha256 でハッシュ化した
マップ `{ path → hash | DELETED }` とする。before/after のマップ差分が変更集合。

hash を用いる理由: porcelain の XY 文字だけの比較は「既に dirty な監視ファイルへの追記」を見逃す。
content hash なら before/after で同一 path の中身差分まで決定的に捕捉できる。

**却下した代替案**:
- *porcelain 文字列の集合比較のみ*:
  - Pros: 実装が軽く、hash 計算が不要。
  - Cons: `step 開始時点で既に dirty な監視ファイルへの追記` という経路で変更を見逃す。before/after
    ともに `M` ステータスが返るため XY 文字が変わらず、要件「内容変更の検出」を満たさない。
- *pathspec で `git status` をスコープする*:
  - Pros: status の出力を最初から監視 glob に絞れ、後段フィルタが不要になる。
  - Cons: glob 構文を git pathspec magic に変換する処理が煩雑。whole-repo status + `matchGlob` フィルタ
    の方が既存 glob 意味論と一致し単純。挙動不変な範囲での任意最適化としては採用し得るが、初期実装の
    複雑化に見合わない。

### D5: 検出時は escalation（awaiting-resume + resumePoint）、auto-revert しない

drift 検出時は timeout escalation と同型で `awaiting-resume` へ遷移し、`resumePoint`（step / reason）を書き、
検出 path + 変更種別を state に記録して run を停止する。`finalizeStepArtifacts`（commit）へは進まない。

main checkout への書き込みは操作者自身の正当な編集の可能性があり、機械では帰属を判定できない。
判断は人間に返す。

CLI 出力には: 検出された path と変更種別・「操作者自身の main checkout 並行編集の可能性」・
`specrunner job resume <slug>` で継続できる案内を含める。

**却下した代替案**:
- *自動 revert*: 操作者の正当な編集を破壊し得る。
- *警告のみで継続*: 逃避書き込みが未確認のまま PR まで進む。

### D6: `snapshotMainCheckoutGuard` seam は never-throw（fail-open backstop 契約）

`snapshotMainCheckoutGuard` は git/fs エラー時に例外を投げず `null` を返す。
before または after のいずれかが `null` の場合、executor は当該境界の検出を skip して run を継続する。

git の一過性エラーは逃避書き込みの証拠ではない。本層は backstop（一次防御は別 request の adapter 制限）
であり、エラー時の見逃しは許容される。この fail-open 契約は `captureHeadSha` / `digestArtifacts` /
`listChangedFiles` の既存 seam 群と同一のポリシーである。

**却下した代替案**:
- *git エラー時に例外を伝播させ run を停止する（fail-closed）*:
  - Pros: 検出を確実にし「見逃し」がない。
  - Cons: 一過性の git エラー（ファイルシステムの一時的なロック等）が spurious escalation を引き起こし、
    逃避書き込みと無関係の理由で run が止まる。本層は backstop であり、一次防御（別 request）が実装
    されるまでの補完的な機構に過ぎない。fail-closed にすることで得る安全性の向上は、誤検出コストを
    正当化しない。

## Consequences

### Positive

- adapter 側のパス制限が実装される前でも、逃避書き込みを step 境界で検出できる（backstop として独立して機能する）。
- 監視対象を forbiddenSurfaces + `.specrunner/` に絞ることで、attended 運用での誤検出を構造的に防ぐ。
- I/O を seam に閉じ込めることで、managed / no-worktree mode では null で自然に無効化され、検査ロジックは副作用なしに純関数でテストできる。
- fail-open 契約により一過性 git エラーが spurious escalation を引き起こさない。

### Negative / Trade-offs

- step 中に操作者が監視対象 path を並行編集すると escalation する（帰属を機械判定できない）。
  CLI 出力に可能性を明示し、`job resume` で継続できる案内を含めることで緩和する。
- `mainCheckoutDrift` フィールドを JobState（persisted-format）に追加する。optional + 不在許容
  validation により後方互換を維持するが、schema の永続フォーマットが拡張される。
- step ごとに `git status` 2 回 + 少数ファイルの hash という追加コストが発生する。
  監視 glob 一致の少数 path のみハッシュ対象であり、managed / no-worktree では null で即 skip のため実用上無視できる。

### Known Gaps

- adapter 側の書き込みスコープ制限（`canUseTool` / sandbox によるパス制限）は別 request で実装する。
  本層はその防止機構が実装されるまでの唯一の検出手段でもある。
- cli step（pr-create 等、agent を実行しない step）は対象外。逃避書き込みは agent tool 実行に起因するため許容。
- 監視対象外 path への逃避書き込みは検出されない。全域監視の誤検出コストを勘案した上での意図的な設計。

## References

- Request: `specrunner/changes/main-checkout-write-detection/request.md`
- Design: `specrunner/changes/main-checkout-write-detection/design.md`
- Spec: `specrunner/changes/main-checkout-write-detection/spec.md`
- Review: `specrunner/changes/main-checkout-write-detection/review-feedback-001.md` (approved, 9.90/10)
- Related: ADR-20260505-agent-runner-port-and-local-runtime（RuntimeStrategy seam パターンの起源）
- Related: ADR-20260429-module-architecture-style（hexagonal-lite + module-boundary 原則）
