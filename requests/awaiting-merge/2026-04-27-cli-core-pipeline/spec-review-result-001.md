# Spec Review Result: 2026-04-27-cli-core-pipeline — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.4 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect, spec-reviewer, security-reviewer
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 2

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 7 | 0.25 | 1.75 |
| feasibility | 9 | 0.20 | 1.80 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 8 | 0.10 | 0.80 |
| **Total** | | | **7.65** |

> Total スコアは pass threshold を超えているが、HIGH 指摘が 2 件あるため verdict は `needs-fix`（review-standards.md の自動判定ルール）。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | openspec/changes/2026-04-27-cli-core-pipeline/specs/propose-pipeline/spec.md:58-71 | request.md の受け入れ基準「ブランチ上に change folder の存在が確認できる」に対し、spec の検証は GitHub API でのブランチ存在確認（200/404）に留まり、change folder（`openspec/changes/<slug>/`）自体の存在検証が要件化されていない。proposal.md Impact では「GitHub API（リポジトリ存在確認・change folder の検証）」と書かれており spec とずれている | `Requirement: 完了後にブランチ存在を GitHub API で検証する` を `ブランチおよび change folder 存在を GitHub API で検証する` に拡張し、`GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` の 200/404 判定 Scenario を追加する。change folder 不在は warning か fail かを明示する |
| 2 | HIGH | consistency | openspec/changes/2026-04-27-cli-core-pipeline/specs/job-state-store/spec.md:19 vs specs/session-completion-detection/spec.md:59-66 | `job-state-store` の `status` enum は `"terminated"` を含むが、`session-completion-detection` では Anthropic 側の `terminated` 観測時に `state.status を failed としてマークする` と規定。state.status に `terminated` がセットされる経路が仕様上存在せず、enum 値がデッドコード化している（読み込み時のバリデーションでも到達不能）| 2 案いずれかで統一する: (a) `session-completion-detection` を「Anthropic 側 terminated 観測時に state.status を `terminated` にセット」に修正し、`failed` との意味的な使い分け（CLI 側失敗 vs サーバ側 termination）を明文化する。(b) `job-state-store` の status enum から `"terminated"` を削除し、Anthropic 側 terminated は `failed` + `error.code = SESSION_TERMINATED` で表現する規約とする |
| 3 | MEDIUM | security | openspec/changes/2026-04-27-cli-core-pipeline/specs/cli-config-store/spec.md:19-29, design.md:228-234 | 既存 config が緩い permission（0644 等）で配置されている場合、`Warning` を出して読み込み続行する仕様。`specrunner ps` のような read-only 経路では permission が 0644 のまま残り続ける窓が存在する。design.md D5 は「書き込み時に 0600 に修正」と書くが、ps は書き込みしない | spec を補強: (a) 緩い permission を検出したら ps でも `chmod 0600` で正規化する、または (b) 緩い permission の場合は read を refuse して `specrunner init --fix-permissions` を促す、のいずれかを Scenario として明記する。最低限、ps 経路で permission が修正されないことが意図的であるかを Notes で明示する |
| 4 | MEDIUM | consistency | openspec/changes/2026-04-27-cli-core-pipeline/specs/cli-commands/spec.md:65-102 vs specs/cli-config-store/spec.md:31-43 | `specrunner run` の fail-fast バリデーション順序が design.md D8 と spec で完全には対応していない。design.md D8 は「config 存在 → apiKey/agentId/environmentId/githubToken → cwd が git repo → origin が GitHub → request.md パース可能」の順序を明示するが、specs/cli-commands の Scenarios は順不同で書かれており、エラーメッセージの選択順序が実装で揺れる懸念 | specs/cli-commands に Requirement として「fail-fast バリデーションの順序」を 1 つ追加し、上記 5 段階の順序を SHALL で固定する。Scenario は順序ごとの「先に失敗する条件」を表現する |
| 5 | MEDIUM | completeness | openspec/changes/2026-04-27-cli-core-pipeline/specs/cli-commands/spec.md:104-122 | `specrunner ps` の出力フォーマットが「JOB_ID 8 文字短縮、AGE 人間可読」までしか規定されておらず、ソート順、列幅、複数行に渡る BRANCH 名の扱い、TTY/非 TTY 時の挙動が未定義。implementer 判断のばらつきリスク | Requirement に「ソート順は createdAt 降順（新しいジョブが上）」「BRANCH は 40 文字で truncate」「非 TTY 時は固定列幅で出力」程度を明示する。あるいは「Phase 1 ではフォーマット詳細は実装に委ね、列ヘッダのみを SHALL とする」と Notes で明記する |
| 6 | MEDIUM | completeness | openspec/changes/2026-04-27-cli-core-pipeline/specs/session-completion-detection/spec.md:31-43 | `Requirement: SSE ループは idle+end_turn を観測したら必ず break する` は SSE 側の break を規定するが、session-completion-detection の Requirement「ポーリング主、SSE 補助」と組み合わせると、ポーリング側で先に idle+end_turn を観測した場合に SSE ループへ break を伝播する仕様（cancel signal）が明示されていない | `Requirement: SSE ループは idle+end_turn を観測したら必ず break する` に Scenario を追加: 「ポーリング側で idle+end_turn を先に観測した場合、CLI は MUST SSE 接続を `AbortSignal` で中断する」を SHALL レベルで明文化。design.md D1 の break-after-completion ガードを spec 側にも反映する |
| 7 | MEDIUM | completeness | openspec/changes/2026-04-27-cli-core-pipeline/specs/propose-pipeline/spec.md:1-10, specs/session-completion-detection/spec.md:59-66 | 状態マシン `init → session-create → events-stream-connected → initial-message-sent → running → register-branch-received? → idle-end-turn-detected → branch-verified → success` に対して、`terminated` 観測 / `SESSION_TIMEOUT` / `BRANCH_NOT_REGISTERED` の失敗遷移先が状態マシン図で省略されており、history への entry 名が specs を跨いで統一されていない（例: `session-terminated` は spec で言及なし）| specs/propose-pipeline の状態マシン Requirement に「失敗遷移」セクションを追加し、`SESSION_TIMEOUT` `SESSION_TERMINATED` `BRANCH_NOT_REGISTERED` `GITHUB_TOKEN_EXPIRED` 各エラーで history に append する step 名と最終 status を表で固定する |
| 8 | LOW | consistency | openspec/changes/2026-04-27-cli-core-pipeline/specs/cli-config-store/spec.md:40-43 | `Scenario: 部分的な init 後に login` という見出しだが、内容は「init 後 login 未実行の状態で run を実行する」を扱っており、シナリオ名と内容が一致していない | Scenario 名を `Scenario: login 未実行の状態で run を実行する` に修正する |
| 9 | LOW | maintainability | openspec/changes/2026-04-27-cli-core-pipeline/design.md:446-454 | OQ1〜OQ7 が `## Open Questions` として 7 件残るが、すべて design.md 内で「Phase 1 では X、将来 Y」と方針が示されており、open ではなく decisions に格上げ可能 | Open Questions セクションを Decisions セクションに統合し、明確な決定事項として記載する。本当の open は「なし」とする |
| 10 | LOW | security | openspec/changes/2026-04-27-cli-core-pipeline/specs/github-device-flow-auth/spec.md | GitHub OAuth scope が `repo` で固定されている根拠（private repo の clone+push に必要）は design.md に書かれているが、spec 側にはなく、scope 最小化レビュー時の根拠が分散 | specs/github-device-flow-auth に「scope 選定根拠」を Notes として追加し、`repo` の必要性と、将来 GitHub App 化で `contents: write` 等に絞る Phase 2 計画を併記する |
| 11 | LOW | feasibility | openspec/changes/2026-04-27-cli-core-pipeline/tasks.md:74-78 | タスク 9.1-9.4（Agent 定義の差分検知 + definitionHash）が独立セクション化されているが、`canonical JSON` の正規化ルール（キー順序、whitespace、配列順序）が未定義。SHA-256 ハッシュは入力差で変わるため、再現性の担保が implementer 任せ | tasks.md 9.2 に「canonical JSON は (a) キーをアルファベット順 (b) whitespace なし (c) 配列順序は registry 登録順を維持 で構築する」を追記。または specs/agent-environment-bootstrap に Requirement として追加する |
| 12 | LOW | maintainability | openspec/changes/2026-04-27-cli-core-pipeline/design.md:38-75 | architecture overview のディレクトリツリーが design.md にのみ書かれており、spec には反映されていない。ディレクトリ構成変更時に同期漏れリスク | proposal.md または design.md の Architecture Overview を canonical source とすることを Notes で明記し、spec 側は層名のみ言及する規約を確認する。または現状維持で `note: directory layout は design.md を唯一の正とする` を proposal.md に追加する |

## Iteration Comparison

（iteration 1 のため省略）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.65 | needs-fix | initial review (HIGH: 2, MEDIUM: 5, LOW: 5) |

## Convergence

- **trend**: — (初回)
- **recommendation**: spec-fixer で HIGH 2 件を修正後、再レビュー

### 停滞検出ルール

- iteration 2 で `plateaued` になった場合、`escalation` を検討する

## Summary

CLI ファースト転換後の最初のリリースとして、10 個の delta spec capability に分割された設計は完成度が高く、Bug 1 再発防止のための `defineCustomTool` colocate factory + tool registry 単一参照、polling primary + SSE secondary、atomic write、prompt injection の XML タグ防御など、constraints.md / review-lessons.md からの学びが構造的に反映されている。feasibility は 9/10 で、tasks.md の 10 セクション 50+ サブタスクが design.md の Decisions と 1:1 対応しており実装に進める水準。

ただし以下 2 件の HIGH 指摘がマージブロッカーとして残る:

1. **change folder 検証の欠落** — request.md 受け入れ基準と spec の verification ロジックがずれている。受け入れ基準を満たすには `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}` の 200/404 判定が必要だが、現 spec は branch 存在確認まで。
2. **state.status enum と terminated 扱いの矛盾** — `job-state-store` で `terminated` を許容するが、`session-completion-detection` で terminated 観測時に `failed` をセットする規定があり、`terminated` enum 値が到達不能になる。

このほか MEDIUM 5 件（permission 修正経路の不在、fail-fast 順序、ps 出力フォーマット、ポーリング → SSE break 伝播、状態マシン失敗遷移）と LOW 5 件（Scenario 名修正、Open Questions 整理、scope 根拠、canonical JSON 正規化、ディレクトリツリーの canonical 化）。

spec-fixer による HIGH 2 件の修正と MEDIUM の同時対応が望ましい。LOW は次イテレーションで対応すれば approved に到達できる見込み。
