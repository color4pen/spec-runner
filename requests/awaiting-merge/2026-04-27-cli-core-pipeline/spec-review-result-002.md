# Spec Review Result: 2026-04-27-cli-core-pipeline — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 8.50 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving (+0.85 vs iter 1)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 9 | 0.30 | 2.70 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 9 | 0.20 | 1.80 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **8.50** |

> Total スコアが pass threshold を超え、CRITICAL: 0 / HIGH: 0 のため verdict は `approved`。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | openspec/changes/2026-04-27-cli-core-pipeline/specs/propose-pipeline/spec.md:87-103 | 失敗遷移テーブル（92-103）は `GITHUB_TOKEN_EXPIRED` に対応する history step を `branch-verified` のみに固定しているが、87-90 の Scenario 「GitHub API が 401 を返す（ブランチ or change folder 確認時）」は branch / change folder のどちらの 401 でも GITHUB_TOKEN_EXPIRED を返すと規定。change folder 確認段階で 401 を受けたとき、history に append される step 名（`branch-verified` か `change-folder-verified` か）が表と本文で不一致 | 失敗遷移テーブルの `GITHUB_TOKEN_EXPIRED` 行を 2 行に分けるか、history step 列を `branch-verified \| change-folder-verified` と明示する。あるいは Scenario 側で「branch verification 段階の 401 は `branch-verified` step、change folder verification 段階の 401 は `change-folder-verified` step に append する」を明文化する |
| 2 | LOW | completeness | openspec/changes/2026-04-27-cli-core-pipeline/specs/propose-pipeline/spec.md:12-15 | 「register_branch が呼ばれずに完了」Scenario が新設の失敗遷移テーブル（96-103 の BRANCH_NOT_REGISTERED 行）と独立して書かれており、history entry 名（`idle-end-turn-detected` を `error` で append）が Scenario 側に明記されていない | Scenario 12-15 の **THEN** に「history に `{ step: \"idle-end-turn-detected\", status: \"error\" }` が append される」を追記し、115-118 の同名 Scenario と内容を冗長にしないよう統合する |
| 3 | LOW | maintainability | openspec/changes/2026-04-27-cli-core-pipeline/design.md:446-454 | OQ1-OQ7 が `## Open Questions` として残るが、いずれも design.md 内で「Phase 1 では X、Phase 2 で Y」と decision が示されている（iter 1 LOW-9 の繰越）| `## Open Questions` を `## Resolved Questions` に改題するか、Decisions セクションに統合する。本当の open は「なし」と明記 |
| 4 | LOW | security | openspec/changes/2026-04-27-cli-core-pipeline/specs/github-device-flow-auth/spec.md | OAuth scope `repo` の選定根拠（private repo の clone+push に必要）と Phase 2 の GitHub App 化計画が spec 側に未反映（iter 1 LOW-10 の繰越）| spec.md 末尾に Notes セクションを追加し、`repo` scope の必要性 + Phase 2 で `contents:write` 等への絞り込み計画を併記する |
| 5 | LOW | feasibility | openspec/changes/2026-04-27-cli-core-pipeline/tasks.md:77 | 9.2 の canonical JSON 化ルール（キー順序、whitespace、配列順序）が未定義のまま（iter 1 LOW-11 の繰越）。SHA-256 の再現性が implementer 任せ | tasks.md 9.2 に「canonical JSON は (a) キーをアルファベット順 (b) whitespace なし (c) 配列順序は registry 登録順を維持」を追記、または specs/agent-environment-bootstrap に Requirement として固定する |
| 6 | LOW | maintainability | openspec/changes/2026-04-27-cli-core-pipeline/design.md:38-75 | Architecture Overview のディレクトリツリーが design.md にのみ存在し、canonical source であることの明示が無い（iter 1 LOW-12 の繰越）| design.md の該当節冒頭に `> Directory layout の canonical source は本セクション。spec 側は層名のみを参照する` を 1 行追加する |

## Iteration Comparison

### Improvements（iter 1 → iter 2）

| iter1 # | Severity | 内容 | 対応 |
|---------|---------|------|------|
| 1 | HIGH | change folder 検証の欠落 | **解消**: propose-pipeline/spec.md:58-86 に branch + change folder の 2 段階検証 Requirement と 4 つの Scenario（200/404/401）を追加 |
| 2 | HIGH | state.status enum と terminated 矛盾 | **解消**: job-state-store/spec.md:19 で status enum から `"terminated"` を削除し `running \| success \| failed` に統一。session-completion-detection の既存規定（terminated 観測 → failed + SESSION_TERMINATED）と整合 |
| 3 | MEDIUM | ps 経路の permission 修正不在 | **解消**: cli-config-store/spec.md:31 に Notes を追加し、read-only 経路で chmod を行わないことが意図的設計である旨を明示 |
| 4 | MEDIUM | fail-fast バリデーション順序 | **解消**: cli-commands/spec.md:65-89 に「5 段階を **この順序で**」の Requirement と 3 つの順序検証 Scenario を追加 |
| 5 | MEDIUM | ps 出力フォーマット未定義 | **解消**: cli-commands/spec.md:129-148 にソート順（createdAt 降順）、JOB_ID 8 文字、BRANCH 40 文字 truncate（37 + `...`）、AGE 人間可読、TTY/非 TTY 別挙動を明文化 |
| 6 | MEDIUM | ポーリング → SSE break 伝播 | **解消**: session-completion-detection/spec.md:31-43 に AbortSignal による SSE 中断 Scenario を追加 |
| 7 | MEDIUM | 状態マシンの失敗遷移省略 | **解消**: propose-pipeline/spec.md:92-123 に失敗遷移テーブル（6 条件）と 4 つの失敗 Scenario を追加 |
| 8 | LOW | Scenario 名と内容の不一致 | **解消**: cli-config-store/spec.md:42 で「部分的な init 後に login」→「login 未実行の状態で run を実行する」に rename |

### Regressions

なし。iter 1 の指摘修正によって新たな仕様退行は発生していない。

### Unchanged Issues

| iter1 # | Severity | 内容 | 状態 |
|---------|---------|------|------|
| 9 | LOW | Open Questions が decisions 化されていない | 未対応（iter 2 #3 として継続） |
| 10 | LOW | OAuth scope 根拠が spec 側に無い | 未対応（iter 2 #4 として継続） |
| 11 | LOW | canonical JSON 正規化ルール未定義 | 未対応（iter 2 #5 として継続） |
| 12 | LOW | ディレクトリツリーの canonical 化 | 未対応（iter 2 #6 として継続） |

> spec-fixer の判断記録（`requests/active/2026-04-27-cli-core-pipeline/decisions/spec-fixer.md`）では HIGH 1-2 と MEDIUM 3-7、LOW 8 のみが修正対象として選択されており、LOW 9-12 は意図的に繰越。承認阻止条件（CRITICAL ≥ 1 または HIGH ≥ 1）には抵触しないため、approved 判定の妨げにはならない。

### New Issues（iter 2 で初出）

| iter2 # | Severity | 内容 |
|---------|---------|------|
| 1 | MEDIUM | GITHUB_TOKEN_EXPIRED の history step が table と Scenario で不一致（change folder 401 時の append 先が不明） — 失敗遷移テーブル追加に伴う副次的な不整合 |

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.65 | needs-fix | initial review (HIGH: 2, MEDIUM: 5, LOW: 5) |
| 2 | 8.50 | approved | HIGH 2 件解消、MEDIUM 5 件解消、新規 MEDIUM 1 件、LOW 4 件繰越 + 1 件新規（HIGH: 0, MEDIUM: 1, LOW: 5）|

## Convergence

- **trend**: improving（+0.85）
- **recommendation**: approved として次フェーズ（implement）へ進む。残 MEDIUM 1 件 + LOW 5 件は implement フェーズで code-fixer / 仕様微修正として対応するか、次イテレーション 1 周のみで spec-fixer に投げるか選択可

### 停滞検出ルール

- iter 1 → iter 2 で +0.85 の改善のため `improving`。停滞検出には該当しない

## Summary

iter 1 で指摘された HIGH 2 件（change folder 検証欠落、terminated enum の矛盾）は spec-fixer によって構造的に解消された。change folder verification は GitHub Contents API 200/404/401 を網羅する 4 Scenario として追加され、terminated は state status enum から削除して `failed + SESSION_TERMINATED` 表現に一本化されている。MEDIUM 5 件（ps permission Notes、fail-fast 順序、ps 出力フォーマット、SSE 中断、状態マシン失敗遷移）も対応済みで、特に状態マシン失敗遷移は 6 エラー条件 × history step × state.status × error.code の表として正規化されている点が高評価。

副次的な指摘として、GITHUB_TOKEN_EXPIRED の history step 名が失敗遷移テーブルと branch / change folder 双方の 401 Scenario の間で不一致になっている（MEDIUM-1）。これは approved を阻害しないが、implement 時に history entry の step 名選択で実装ぶれが起きるため、code-review 前に微修正されることが望ましい。

LOW 4 件（Open Questions 整理、OAuth scope 根拠、canonical JSON 正規化、ディレクトリツリーの canonical 化）は spec-fixer が iter 1 で意図的に繰越した項目であり、承認阻止には該当しない。

verdict は **approved**。次フェーズ（implement）へ進める。
