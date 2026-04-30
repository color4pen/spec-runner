# Spec Review Result: cli-doctor-command — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 6.65 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (初回)
- **agents**: architect
- **retries**: 0/2
- **blocking_findings**: CRITICAL: 0, HIGH: 1

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 7 | 0.30 | 2.10 |
| consistency | 5 | 0.25 | 1.25 |
| feasibility | 7 | 0.20 | 1.40 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 7 | 0.10 | 0.70 |
| **Total** | | | **6.65** |

### スコアの根拠（カテゴリ別）

- **completeness (7)**: 7 カテゴリ × 18 check の網羅は十分。Acceptance criteria も e2e / regression を含む。Windows サポート / jobs dir 不在ケースの仕様化に小さな抜けあり。
- **consistency (5)**: ADR filename 規約違反（HIGH）と request.md L152 の delta spec path 表記揺れ（MEDIUM）の 2 件で減点。既知の learned-patterns（L910/L937）に明記された反復パターンであり厳しめに評価。
- **feasibility (7)**: 設計判断（D1〜D9）は port パターンと整合し、外部依存も明示。ADR 作成の役割分担（tasks.md 13.1 vs Step 7 adr-create skill）に小さな曖昧さ。
- **security (8)**: 認証 check（Anthropic / GitHub）に 5s timeout、scope 検証、warn 退避が明記されている。レート消費最小化の根拠も記述あり。
- **maintainability (7)**: D7 timeout 仕様の本文 / Risks 分散、exit code 2 の発火層分担、port 拡張 vs fetch 直叩きの未決定、の 3 点で読みやすさに改善余地。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | consistency | openspec/changes/cli-doctor-command/design.md:109; openspec/changes/cli-doctor-command/tasks.md:86; openspec-workflow/requests/active/cli-doctor-command/request.md:151 | ADR filename を `{NNN}-external-dependency-policy.md` と指定しているが、project の命名規約は `openspec-workflow/adr/README.md` L7 で `ADR-YYYYMMDD-<タイトル>.md` と定められており、既存 ADR 全件もこれに従う。learned-patterns.md L910/L937 で同じ失敗パターンが記録されており、再発に該当する。 | design.md D5 / tasks.md 13.1 の ADR path を `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md` に変更する。request.md は author（color4pen）に修正依頼するか、spec-review 側でメモを残し implementer 段階で適用する旨を tasks.md に追記する。 |
| 2 | MEDIUM | consistency | openspec-workflow/requests/active/cli-doctor-command/request.md:152 | acceptance criteria が delta spec path を `openspec/changes/cli-doctor-command/specs/cli/spec.md` と表記しているが、実際の capability 名は既存 `openspec/specs/cli-commands/` に従い `specs/cli-commands/spec.md` であるべき（proposal.md L40 では正しく `specs/cli-commands/spec.md` と記載されている）。 | request.md L152 を `openspec/changes/cli-doctor-command/specs/cli-commands/spec.md` に修正、または delta 側の任意の path 表記揺れを許容しない注記を design.md に追加する。 |
| 3 | MEDIUM | feasibility | openspec/changes/cli-doctor-command/tasks.md:86 | tasks.md 13.1 が implementer に「ADR を生成」させる体裁になっているが、workflow option で `adr` が enabled のため Step 7（adr-create skill）が ADR を別途生成する。同一 ADR の二重生成 / 上書きが発生し得る。 | tasks.md 13.1 を「ADR の元になる decision rationale を design.md / decisions/ に整備し、Step 7 の adr-create skill が参照可能な形で残す」に変更する。implementer が ADR file を直接書かない方針を design.md にも明記する。 |
| 4 | LOW | maintainability | openspec/changes/cli-doctor-command/design.md:144-148; openspec/changes/cli-doctor-command/design.md:160-167 | D7 で network check の timeout を 5s と定めているが、Risks セクションで「openspec check のみ 30s に緩める」と例外が記述されており、timeout 仕様が 2 箇所に分散している。読み手が一意に把握できない。 | D7 内に「default 5s、ただし openspec check のみ 30s（npx 初回 download 対策）」の表を含める。Risks の対応する bullet は D7 への参照に置換する。 |
| 5 | LOW | maintainability | openspec/changes/cli-doctor-command/specs/cli-commands/spec.md:55-58; openspec/changes/cli-doctor-command/design.md:60-67 | exit code 2（crash）を誰が emit するかが層分担として曖昧。現行 `bin/specrunner.ts` の `main().catch` は exit 1 を返すのみ。doctor 専用の crash → exit 2 経路が `runDoctor` 内で完結するか `bin/specrunner.ts` で doctor case 限定の catch を持つかを spec で明示すべき。 | spec の Scenario「doctor 自身が予期せぬ例外で crash する」に「`bin/specrunner.ts` の doctor case が `runDoctor` を try/catch し、catch 経路で exit 2 を発する」旨を 1 行追加する。または D9 / D3 で同等の責務記述を追加する。 |
| 6 | LOW | completeness | openspec/changes/cli-doctor-command/design.md:9-26; openspec/changes/cli-doctor-command/design.md:163 | Windows サポートの扱いが Risks セクションに「MVP は darwin / linux のみ」とのみ記述されており、Goals / Non-Goals および spec Scenario に明示がない。 | Non-Goals に「Windows でのフル動作サポート（permission 0600 check は warn / skip 扱い）」を追加。spec の `config` カテゴリ Requirement にも platform 注記を 1 行追加する。 |
| 7 | LOW | completeness | openspec/changes/cli-doctor-command/design.md:151-153 | D8 で jobs dir 不在時に「pass（必要時に作る）」とあるが、storage 未初期化状態を pass で隠すのは情報損失。warn + hint（`Run 'specrunner ps' once to initialize storage.` 等）が CI 利用観点で有用。 | D8 を「dir 不在時は warn を返し、親 dir の書き込み権が無ければ fail」に修正、または現行案を維持する場合は「pass で隠す」判断の根拠を 1-2 行追記する。spec にも該当 Scenario を追加する。 |
| 8 | LOW | maintainability | openspec/changes/cli-doctor-command/tasks.md:80 | 12.1 が「既存 GitHubClient port に method 追加 or fetch 直叩き」と未決のまま。fetch 直叩きを採ると core が HTTP 詳細を直接持つことになり、port パターン（design.md Context）と矛盾する。 | tasks.md 12.1 を「`GitHubClient` port に `verifyTokenScopes(): Promise<{ status: number; scopes: string[] }>` 等の method を追加し、auth/github-token-valid.ts は port 経由でのみ呼ぶ」に確定。design.md D6 の対応箇所も同様に更新する。 |

## Iteration Comparison

（iteration 1 のため対象外）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.65 | needs-fix | 初回。HIGH 1（ADR filename 規約違反） + MEDIUM 2 + LOW 5 |

## Convergence

- **trend**: — (初回)
- **recommendation**: continue（spec-fixer による修正後に再レビュー）

## Summary

CLI subcommand 設計は port パターンとの整合・LLM 不在の deterministic 検証方針・exit code 規約のいずれも筋が通っており、設計判断（D1〜D9）の代替案検討も丁寧。承認ブロック要因は ADR filename 規約違反（HIGH 1 件、learned-patterns に登録済みの反復パターン）と、delta spec path 表記揺れ・implementer による ADR 二重生成リスクの MEDIUM 2 件。これらは spec-fixer が design.md / tasks.md 上で修正可能。LOW 5 件は読みやすさと境界明示の改善で、修正と同時に取り込めば iteration 2 で 7.0+ 到達は妥当。

