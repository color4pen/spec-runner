# Spec Review Result: cli-doctor-command — Iteration 2

## Verdict

- **verdict**: approved
- **score**: 8.10 / 10.0 (pass threshold: 7.0)
- **iteration**: 2 / 2
- **trend**: improving
- **agents**: architect
- **retries**: 1/2
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| completeness | 8 | 0.30 | 2.40 |
| consistency | 8 | 0.25 | 2.00 |
| feasibility | 8 | 0.20 | 1.60 |
| security | 8 | 0.15 | 1.20 |
| maintainability | 9 | 0.10 | 0.90 |
| **Total** | | | **8.10** |

### スコアの根拠（カテゴリ別）

- **completeness (8, +1)**: jobs dir 不在 / 親 dir 不可の 2 シナリオが spec に追加され、Windows サポートの境界が Non-Goals + spec 注記に明示された。e2e / regression を含む acceptance criteria は維持。残余は実環境 e2e の運用面（dogfooding 後の確認）のみ。
- **consistency (8, +3)**: HIGH だった ADR filename 規約違反（design.md L116, L129、tasks.md L86）はすべて `ADR-20260430-external-dependency-policy.md` に修正済み。delta spec path も design.md「Path Note」セクション (L9-11) で `cli-commands` を正として明記。残るは proposal.md L41 の `{NNN}` 表記揺れ 1 件のみ（authoritative file は修正済みなので LOW）。
- **feasibility (8, +1)**: ADR 生成の役割分担（implementer は ADR file を書かず Step 7 の adr-create が生成）が design.md D5 後段（L129）と tasks.md 13.1 で明記。port パターンも `verifyTokenScopes` method 追加で確定し、fetch 直叩きの曖昧さが解消。
- **security (8, ±0)**: 既に高評価。GitHub auth の port 経由化により、HTTP 詳細の漏れ箇所が明確になり security 観点でも軽微な改善あり。
- **maintainability (9, +2)**: D7 timeout 表 (L160-167) が一元化され、Risks セクションは D7 への参照に置換。exit code 2 の発火層が D3 + D9 + spec の crash シナリオで一貫して記述され、読み手が責務境界を一読で把握できる。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | openspec/changes/cli-doctor-command/proposal.md:41 | Impact セクションの ADR 生成パスが `openspec-workflow/adr/{NNN}-external-dependency-policy.md` のままで、design.md / tasks.md で確定した `ADR-20260430-external-dependency-policy.md` と表記揺れがある。proposal.md は author（color4pen）の所有領域に近く、また adr-create skill の入力として参照されないため authoritative ではないが、user-facing なドキュメント整合性として残置されている。 | proposal.md L41 を `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md` に揃える。spec-fixer の追加修正、または author に委ねる場合は本 finding を informational として記録するのみで approve 可能。 |
| 2 | LOW | maintainability | openspec/changes/cli-doctor-command/design.md:11 | Path Note セクションが `request.md L152` と参照しているが、L152 の現行内容は実装メタ情報であり、cli/spec.md 表記揺れは L151-152 周辺の実 path 記述である。読み手が L152 をピンポイントで参照すると要点が分かりづらい。 | Path Note の参照を「`request.md` の acceptance criteria 内の delta spec path 表記」と論理参照にするか、L 番号を実箇所に合わせ直す。LOW 改善のみ。 |
| 3 | LOW | completeness | openspec/changes/cli-doctor-command/specs/cli-commands/spec.md:31 | config category Requirement の表で「permission 0600（darwin / linux のみ。Windows では warn / skip 扱い）」と記述されているが、warn と skip のどちらを採るかが Scenario レベルでは未確定（D8 のような分岐表が存在しない）。実装者が条件分岐を書く際に再確認が必要になる可能性。 | spec の同要件に「Windows 環境では check 自体を skip して `pass` を返し、message に `permission check skipped on Windows` を含める」または「`warn` を返す」のいずれかを Scenario として追加する。MVP は darwin/linux のみのため、informational として残置でも実装阻害はしない。 |

## Iteration Comparison

### Improvements

- HIGH（ADR filename 規約違反）が 3 箇所すべて修正された（design.md D5 本文 + Note、tasks.md 13.1）。
- MEDIUM（delta spec path 表記揺れ）は design.md「Path Note」セクションで一元的に明記され、implementer の混乱要因が除去された。
- MEDIUM（implementer による ADR 二重生成リスク）は tasks.md 13.1 が「decision rationale 整備のみ」に書き換えられ、Step 7 adr-create との責務境界が明文化された。
- LOW（D7 timeout 分散）は D7 内の表 (L160-167) に一元化され、Risks の重複 bullet が D7 への参照に置換された。
- LOW（exit code 2 の発火層曖昧）は D3 後段 (L79)・D9 後段 (L190)・spec の crash シナリオ (L57-58) で `bin/specrunner.ts` の doctor case 専用 try/catch から発火することが一貫して記述された。
- LOW（Windows サポート未明示）は Non-Goals (L31) と spec config 要件の表 (L31) に platform 注記が追加された。
- LOW（jobs dir 不在を pass で隠す）は D8 (L171-184) が「dir 不在 = warn / 親 dir 不可なら fail」に書き換えられ、spec にも Scenario が 2 件追加された (L167-175)。
- LOW（GitHubClient port vs fetch 直叩き未決）は tasks.md 12.1 (L80) と design.md D6 (L143) で `verifyTokenScopes` method 追加に確定された。

### Regressions

- なし（前回の must-fix 修正が他項目を悪化させた形跡なし）。

### Unchanged Issues

- proposal.md L41 の ADR filename 表記が `{NNN}-external-dependency-policy.md` のまま残置（前回 finding #1 の派生だが、authoritative file ではないため iter-1 では指摘対象外だった。iter-2 で初検出）。

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.65 | needs-fix | 初回。HIGH 1（ADR filename 規約違反） + MEDIUM 2 + LOW 5 |
| 2 | 8.10 | approved | HIGH 0 / MEDIUM 0 / LOW 3。Δ +1.45（improving）。ADR filename・delta spec path・ADR 二重生成リスク・timeout 分散・exit 2 層分担・Windows 境界・jobs dir warn・port method 確定の 8 項目すべて修正 |

## Convergence

- **trend**: improving（前回 6.65 → 今回 8.10、Δ +1.45 > 0.3）
- **recommendation**: approved（pass threshold 7.0 を上回り、CRITICAL: 0 / HIGH: 0、blocking finding なし）

## Summary

iteration 1 で指摘された全 8 件（HIGH 1 + MEDIUM 2 + LOW 5）すべてに対応済みで、特に承認ブロック要因だった ADR filename 規約違反（learned-patterns L910/L937 に登録された反復パターン）は design.md / tasks.md の authoritative 記述で完全に修正された。残置の LOW 3 件は user-facing ドキュメントの表記揺れ・参照精度・platform 注記の細部にとどまり、いずれも実装阻害要因ではない。Total 8.10 で pass threshold (7.0) を大きく上回り、improving trend (+1.45) で安定した収束。verdict は approved。次ステップ（implementer フェーズ）に進めて問題なし。proposal.md L41 の `{NNN}` 表記は author 修正または follow-up commit で揃える運用が望ましい。
