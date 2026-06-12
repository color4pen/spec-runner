# findingRef 検証が実在ディレクトリを不存在と誤判定し、needs-fix を escalation に強制する

## Meta

- **type**: bug-fix
- **slug**: finding-ref-directory-eisdir
- **base-branch**: main
- **adr**: false

## 背景

inbox-reject-dedup の run（job 02d89876、2026-06-12）で、code-review が high/fixable の正当な指摘（must TC のテスト欠落）を報告したにもかかわらず、verdict が needs-fix ではなく escalation になり pipeline が停止した。

指摘は「テストが存在しない」という**不在系**のため、reviewer は finding の file に置き場所のディレクトリ `tests/unit/adapter/github/`（worktree に実在）を引用した。findingRef 検証はこれを不存在と誤判定し、幻覚ガードの規定により verdict を escalation に強制した。本来この finding は needs-fix → code-fixer がテストを追加して収束する経路だった。

## 現状コードの前提

- `src/core/runtime/local.ts:614-634` — `verifyFindingRefs` は `fs.readFile(absPath, "utf-8")` の成否で存在判定しており、**実在するディレクトリは EISDIR を投げて ENOENT と同じ catch に落ちる**（不存在扱い）
- `src/core/step/executor.ts:646-657` — verdict 影響 findings（critical/high または decision-needed）の ref が 1 件でも nonExistent なら `verdict = "escalation"` に強制
- `src/core/step/judge-verdict.ts:32-40` — 本件 findings は全て fixable（high 1 / medium 1 / low 1）で、導出単体なら needs-fix
- 実証ログ: `.specrunner/logs/02d89876-5535-4994-af6e-ab11a4293576.log`（code-review の verdict:parsed = escalation、findings は全 fixable）。worktree に `tests/unit/adapter/github/` ディレクトリは実在
- managed 側の同等実装: `src/core/runtime/managed.ts` の verifyFindingRefs も対象か確認が必要

## 要件

1. `verifyFindingRefs` の存在判定を「path が実在すること」（stat 等）に修正し、実在ディレクトリを存在として扱う。`line` の検証はファイルの場合のみ適用する（ディレクトリ + line 指定は不正 ref として従来通り弾いてよい）
2. local / managed 両 runtime の実装で挙動を一致させる
3. 幻覚ガード本来の目的（存在しないパスの引用を escalation に強制）は不変

## スコープ外

- 不在系 finding の引用規約の prompt 強化（reviewer がディレクトリでなくファイルを引くべきか）は本修正で不要になる想定。必要なら別途
- findingRef 検証の対象範囲（verdict 影響 findings のみ）の変更

## 受け入れ基準

- [ ] 実在ディレクトリを file に持つ finding が nonExistent 扱いされないことをテストで固定する
- [ ] 存在しないパス・実在ファイルの行数超過 line が従来通り nonExistent になることをテストで固定する（退行なし）
- [ ] ディレクトリ + line 指定の扱いがテストで固定される
- [ ] `typecheck && test` が green

## 関連

- 実証: job 02d89876（inbox-reject-dedup）の code-review escalation。引用指導の --prompt 付きで resume 済み
- #644（observations-channel）— 同夜に観測した「正当な機構が想定外の入力形で人間ゲートを誤発火させる」同型パターンの 2 例目