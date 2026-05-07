# Spec Review Result — propose-delta-spec-file-layout

- **iteration**: 1
- **date**: 2026-05-07
- **verdict**: approved

## Summary

変更は request の要件を網羅しており、proposal / design / tasks / delta spec の整合性も取れている。CRITICAL・HIGH の指摘なし。新規 capability のエッジケースに関する completeness gap が 1 件あるが、tasks.md で正しく補完されており実装には支障がないため承認。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | specs/propose-session/spec.md:34-35 | "Delta spec files use correct directory structure" scenario が `<capability-name>` を既存ディレクトリ限定としているが、新規 capability の場合（proposal.md の New Capabilities で宣言した名前を使用）のケースが欠落。tasks.md 1.1 には記載あり | scenario の THEN に「新規 capability の場合は proposal.md の New Capabilities で宣言した名前を使用する」の但し書きを追加 |
| 2 | LOW | consistency | specs/propose-session/spec.md | Delta Spec Format Rules の Requirement 内容は prompt (`propose-system.ts`) の既存ルールと整合しているが、prompt 側のルール 3（RENAMED Requirements の FROM/TO 記法）の詳細が scenario に含まれていない | 情報提供のみ。prompt はルール詳細を担い、spec は振る舞い仕様を担うため二重記述は不要 |

## Checklist

- [x] proposal.md の Why / What Changes / Capabilities / Impact が揃っている
- [x] design.md の Goals が request の要件をカバーしている
- [x] design.md の Non-Goals が適切にスコープを絞っている
- [x] design.md の Decisions に代替案と却下理由がある
- [x] tasks.md が request の受け入れ基準を全て網羅している
- [x] delta spec のファイル配置が `specs/<capability-name>/spec.md` 形式
- [x] delta spec の capability-name (`propose-session`) が `openspec/specs/` 配下に存在する
- [x] delta spec が `## ADDED Requirements` を使用（新規 Requirement のため正しい）
- [x] 全 `### Requirement:` に `#### Scenario:` が 1 つ以上ある
- [x] proposal.md の Modified Capabilities と delta spec の対象が一致
