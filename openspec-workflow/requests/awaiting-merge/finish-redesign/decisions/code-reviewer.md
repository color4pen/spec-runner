# code-reviewer decisions — finish-redesign iter1

- code-reviewer / security-reviewer / pattern-reviewer を 1 セッションで統合実行する :: 開発者が手作業で同等の確認を 3 並列 subagent で投げ直すよりも、context が温い状態で 1 度に走らせた方が re-fetch コストが小さい
- merge-feature-pr.ts と pr-state.ts を「dead code」として HIGH 指摘 :: src/ から import が無く orchestrator は内部 mergeFeaturePrPhase3 に再実装。残置すると 2-PR モデル時代の設計意図が混入し、次の implementer が誤って参照する。spec.md C3 の「createArchivePr / pushAndCreateArchivePr / prepareArchiveBranch / checkArchivePrAlreadyMerged を削除」の精神に反する
- escalation.ts の getRecommendedAction を MEDIUM 指摘 :: jobId-based resume command と --cleanup-only 言及が含まれ、新しい slug-first / 1-PR モデルから drift。production からは未参照（merge-feature-pr.ts のみが使う dead chain）
- FinishFlags.cleanupOnly を MEDIUM 指摘 :: types.ts:65 で `@deprecated` JSDoc は付いているが型定義に残存。CLI 側からは渡されないので機能影響は無いが、新規実装者が flag 体系を読み取る妨げになる
- archive-openspec.ts の resumeCommand に jobId をそのまま使っている点を MEDIUM 指摘 :: orchestrator から渡される jobId は state.jobId（UUID）。spec.md は「再実行コマンドは specrunner finish <slug>」を前提としており、archive 失敗時のメッセージで `specrunner finish <UUID>` が表示されると user は --job flag を再度学習しないと入力不能。orchestrator/preflight/move-requests-dir 側は target.slug を渡しているので一貫性も崩れている
- security 観点での新規 attack surface 評価 :: subprocess 呼び出しは全て args 配列形式（shell=false）で injection 余地は低い。slug は state file 由来で外部入力ではないが、register_branch tool 経由で agent が制御可能。preflight check 6 (openspec validate) と check 7 (which) で slug を引数として渡す箇所は arg array で渡しているのでシェル展開はされない。LOW 観点として slug の文字種制約は明文化されていない（schema レベル）が、実害は限定的
- pattern-reviewer 観点 :: review-lessons.md からの再発検出は specific には無し。learned-patterns.md に「slug dual derivation」の記載があり、本 PR がまさにそれを構造的に解消しているので positive trend として扱う
- testing カテゴリ評価 :: test-cases.md must=29 のうち TC-101〜TC-110、TC-119〜TC-129、TC-139 等が adversarial test として実装済み。Coverage は HIGH。verification 全 PASS（721/721）。Score 8
- correctness 観点で 1 つ MEDIUM :: orchestrator.ts:200 の `git checkout main` は cwd が worktree の場合に main worktree と衝突するリスクがある。worktree 配下の finish では main を別 worktree が保持していることが多く checkout 失敗で escalation 経由 abort する可能性がある。spec の Phase 4 仕様では `git checkout main + git pull --ff-only` と明記されているのでコードは正しいが、worktree-aware にすべきかは follow-up

# code-reviewer decisions — finish-redesign iter2

- iter1 HIGH/MEDIUM 指摘の解消状況を git status / git diff で機械的に確認する :: code-fixer のセルフレポートに依存せず、ファイル削除と差分内容で convergence を判定する方が author-bias を排除できる
- HIGH #1 (merge-feature-pr.ts) と MEDIUM #2 (pr-state.ts) は src/ tree から削除 + 対応 test ファイル削除を確認 :: rg で残存参照検索 → src/ 内 0 hit、tests/finish-escalation.test.ts のみ "merge-feature-pr" を文字列リテラルとして使用（formatEscalation の入力テスト用）。dead code chain は完全に消えた
- MEDIUM #3 (archive-openspec.ts の jobId→slug) を解消済みと判定 :: archive-openspec.ts の resumeCommand / recommendedAction は全て `specrunner finish ${slug}` に統一。move-requests-dir.ts も同様
- MEDIUM #4 (FinishFlags.cleanupOnly) を解消済みと判定 :: types.ts には dryRun のみ残存、cleanupOnly field は削除
- MEDIUM #5 (Phase 4 worktree-aware) を解消済みと判定 :: orchestrator.ts:194-241 で `git rev-parse --abbrev-ref HEAD` で main 判定し、linked worktree からは checkout/pull を skip + warning
- MEDIUM #6 (getRecommendedAction) を解消済みと判定 :: escalation.ts は formatEscalation のみ残存
- LOW #7 (idempotency.ts コメント) を解消済みと判定 :: TC-046/TC-057 の言及が削除され TC-126 のみに更新
- LOW #8 (module-analysis.md 補注) を解消済みと判定 :: 冒頭に削除済み記載の補注が追加
- LOW #9 (test files) を解消済みと判定 :: tests/finish-merge-feature-pr.test.ts と tests/finish-pr-state.test.ts を削除
- LOW #10 (slug schema-level validation) は follow-up としてそのまま残す :: iter1 で「実害なし、follow-up」と判定済み
- 新規発見: tests/finish-escalation.test.ts:14-26 の test data に "merge-feature-pr" 文字列が残っている :: もはや code 側に存在しない step 名なので test data として misleading。LOW で指摘
- 全体スコア再計算 :: HIGH 1 + MEDIUM 5 + LOW 3 が解消、退行なし、新規 LOW 1 件のみ。CRITICAL/HIGH ゼロで pass threshold 7.0 を超える
- verdict は approved :: blocking findings ゼロ、trend は improving
