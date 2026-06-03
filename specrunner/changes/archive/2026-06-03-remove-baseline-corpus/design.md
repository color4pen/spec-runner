# Design: remove-baseline-corpus

## Context

ADR-20260602（spec-model）D4 により baseline corpus は authority から外れた。#508 で書き込み経路（spec-merge）、#510 で pipeline 読み手（design / spec-review / delta-spec-validation）を撤去済み。

残っているのは以下の 3 層:

1. **corpus 本体** — `specrunner/specs/` 配下の全ディレクトリ（凍結状態）
2. **読み手コード** — `dynamic-context.ts` の `collectSpecIndex` / `SpecIndexEntry`、`design-system.ts` の Baseline Specs テーブル注入
3. **guard コード** — `commit-push.ts` の `findAuthoritySpecViolations`、prompt 内の baseline read-only / authority path 禁止 guidance、`request.ts` template のコメント、`request-review-system.ts` の baseline-path-intent チェック

守る対象（corpus）が消えるため guard も不要になる。3 層を一括撤去する。

## Goals / Non-Goals

**Goals**:

- `specrunner/specs/` corpus を完全削除する
- baseline path helper（`baselineSpecPath` / `specsDirRel` / `SPECS_DIR`）を撤去する
- baseline を読む残存コード（specIndex 収集・注入）を撤去する
- baseline を守る guard（commit-push 違反検出、prompt guidance）を撤去する
- 上記に伴うテスト修正で typecheck / test を green に保つ

**Non-Goals**:

- `architecture/` 内の `specrunner/specs/` 参照更新（人手で行う）

## Decisions

### D1: corpus を監査記録として残さず削除する

ADR D4 は「監査記録への縮小」を述べるが、git history が監査記録を兼ねるため、ファイルとして残す理由がない。削除する。

**Rationale**: 凍結ファイルが残ると「読んでよいのか」の曖昧さが残り、将来の guard 復活圧力になる。git history で十分。

**Alternatives**: corpus を `archive/` に移動して保持 → git history で代替可能なため不採用。

### D2: DynamicContext から specIndex フィールドを削除する

`DynamicContext.specIndex` は baseline corpus を読んで prompt に注入するためのフィールド。corpus 削除後は常に空配列を返すだけの dead code になる。フィールドごと削除する。

**Rationale**: optional にして残すと、消費側が `if (specIndex)` 分岐を持ち続ける。完全削除が最も明快。

**Alternatives**: フィールドを残して常に `[]` を返す → dead field を残す意味がないため不採用。

### D3: findAuthoritySpecViolations を完全削除する

guard 対象（`specrunner/specs/`）が消えるため、違反検出ロジック自体が不要。`commit-push.ts` から関数と呼び出し箇所を削除し、`AUTHORITY_SPEC_PREFIX` 定数も削除する。

**Rationale**: guard が残ると「何を守っているのか」が不明瞭になり、将来の誤解を招く。

**Alternatives**: 関数を残して no-op にする → 意味のないコードパスが残るため不採用。

### D4: prompt から baseline 関連 guidance を一括削除する

対象: `rules.ts`、`code-fixer-system.ts`、`design-system.ts`、`request-generate-system.ts`、`request-review-system.ts`、`request.ts` template。baseline read-only / authority path 禁止のガイダンスを削除する。

**Rationale**: 守る対象が存在しないのに禁止ルールを記述すると agent の attention を無駄に消費する。

## Risks / Trade-offs

- [Risk] テスト内の specIndex 参照箇所が多い → 全箇所を機械的に修正する必要がある
  - Mitigation: Grep で網羅的に洗い出し済み。変更量は多いが各修正は機械的（フィールド削除・テスト削除）
- [Risk] prompt 変更が agent 挙動に影響する可能性
  - Mitigation: 削除するのは存在しないパスへの禁止ルールのみ。agent が取れるアクションに変化なし

## Open Questions

なし
