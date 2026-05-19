# Design: Delta Spec Auto-Classification

## Context

直近の事故分析（PR #283, #289, #299, #323）から、**delta spec の section header 判断を LLM agent に任せていること**が事故の構造的根であると判明した。LLM は確率的にルールを守らない以上、prompt 強化・reviewer check 追加・dsv rule 追加を積み上げる対症療法は無限に続く。

現状の delta spec format は `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` の 4 種のセクションヘッダーを agent が選択する。この判断には baseline spec との突合が必要だが、agent は間違える（例: 新規 capability に MODIFIED を書く = PR #323）。

## Goals

- delta spec の ADDED / MODIFIED 分類を agent の判断から物理的に除去する
- agent は semantic content（何を変えたいか）のみを書く
- tool（`delta-spec-merger.ts`）が baseline と突合して自動分類する
- 旧形式を dsv で reject し、新形式以外が通らない状態にする

## Non-Goals

- 既存 archive の delta spec 移行（完了済 change は触らない）
- baseline spec format の変更
- 思想の他領域への展開（authority path / spec 直接 write 等 — 別 request）
- AUTHORITY_SPEC_GUARD fragment 全体の書き直し（「書く側の規律」節の section header 部分のみ更新）

## Decisions

### D1: 新 delta spec format — agent は ADDED/MODIFIED の区別を書かない

agent が書く delta spec を以下に統一する:

```markdown
# Delta Spec: <Title>

## Requirements
### Requirement: <name>
<本文 + #### Scenario>

## Removed
- "<requirement name>"

## Renamed
- "old name" → "new name"
```

`## Requirements` 配下の Requirement は、tool が baseline 突合で ADDED / MODIFIED を自動判定する。agent は「変えたいもの / 追加したいもの」を一律 `## Requirements` に書くだけ。

**Alternatives considered**:
- A) agent に `## New` / `## Changed` の区別を書かせる → 結局 agent が判断するため事故は再発する。却下。
- B) JSON 形式に変更 → agent の markdown 生成能力が低下し、semantic content の品質も下がる。却下。

### D2: auto-classification ロジックの配置 — `parseDeltaSpec` を書き換え

`src/core/finish/spec-merge.ts` の `parseDeltaSpec()` を新形式に対応させ、`classifyDeltaSpec()` 関数を新設する:

1. `parseDeltaSpec()`: 新形式を parse → `{ requirements: RequirementBlock[], removed: string[], renamed: RenameEntry[] }`
2. `classifyDeltaSpec()`: parse 結果 + baseline を受け取り → 旧 `DeltaSpec` 型 (`{ added, modified, removed }`) を返す
   - baseline に同名あり → modified
   - baseline に同名なし → added
   - renamed: old → new 適用後に modified 判定

これにより `applyMerge()` は変更不要（入力の `DeltaSpec` 型は同じ）。

**Alternatives considered**:
- `applyMerge()` 自体を新形式で直接処理 → 既存の REMOVED→MODIFIED→ADDED 順序保証ロジックが壊れるリスク。下流は変えずに上流で吸収する方が安全。

### D3: DeltaSpec 型の分離 — ParsedDelta と ClassifiedDelta

型安全のため中間表現を分ける:

```typescript
// parseDeltaSpec() の出力（新形式）
interface ParsedDelta {
  requirements: RequirementBlock[];  // ADDED/MODIFIED 未分類
  removed: string[];                 // name のリスト
  renamed: RenameEntry[];            // { from: string, to: string }
}

// classifyDeltaSpec() の出力（= 旧 DeltaSpec 互換）
interface DeltaSpec {
  added: RequirementBlock[];
  modified: RequirementBlock[];
  removed: RequirementBlock[];  // RequirementBlock に変換（content は空でよい）
}
```

`DeltaSpec` 型は export 済みで `applyMerge` / `checkBaselineHeaderConsistency` / `validateDeltaSpec` が依存。互換を維持する。

### D4: Removed セクションの形式変更 — name リストのみ

旧形式では `## REMOVED Requirements` 配下に `### Requirement:` ブロック（本文付き）を書かせていた。新形式では `## Removed` にリスト形式で name のみ記載する。理由:

- 削除対象に本文を書かせる意味がない（baseline から消すだけ）
- agent の判断量を最小化する思想に合致
- `classifyDeltaSpec()` で name → `RequirementBlock` 変換時、content は最小限（header line のみ）にする

### D5: Renamed の処理順序 — rename → classify

`classifyDeltaSpec()` 内で以下の順序を保証する:

1. `renamed` エントリの `from` → `to` を baseline 上で適用（header の rename）
2. rename 後の baseline に対して `requirements` を突合し ADDED / MODIFIED を判定

これにより「rename して中身も変更する」ケースが自然に MODIFIED として処理される。

### D6: dsv rule 更新 — 旧形式を reject、新形式を require

`canonical-spec-structure.ts` の section header 検証を更新:

- 旧: `/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/m` にマッチすれば OK
- 新: `## Requirements` が必須。`## ADDED Requirements` 等の旧形式が存在すれば HIGH violation
- `## Removed` / `## Renamed` はオプション（存在する場合のみ parse）

### D7: spec-review の Baseline Consistency Check — tool 側に委譲

`spec-review-system.ts` の Baseline Consistency Check（L76-98）は旧形式の section header 存在を前提としている。新形式では section header から ADDED/MODIFIED の区別が消えるため、以下の方針:

- spec-review では「delta spec に書かれた Requirement が baseline と矛盾しないか」の観点は残す（agent が Read tool で baseline を引いて確認する指示は維持）
- ただし「MODIFIED header が baseline に存在するか」等の **分類前提のチェック** は tool 側（`classifyDeltaSpec` → `checkBaselineHeaderConsistency`）が `specrunner finish` 時に担保するため、spec-review からは削除
- spec-review は「semantic な仕様品質」「delta spec の記述が十分か」に集中する

## Risks / Trade-offs

### [Risk] 旧形式 delta spec を持つ active change が dsv で reject される
- **Mitigation**: request.md の「移行 note」の通り、マージ前に active を空にする。マージ後は新形式のみ。

### [Risk] RENAMED の parse が複雑（`"old" → "new"` の形式）
- **Mitigation**: 正規表現で `"(.+?)"\s*→\s*"(.+?)"` を parse。test でカバー。

### [Risk] `classifyDeltaSpec()` は baseline 読み込みが必要 — finish 以外の呼び出し元
- **Mitigation**: 現在 `parseDeltaSpec` を呼ぶのは `mergeSpecsForChange` のみ（finish コマンド）。dsv は section header の存在チェックのみで parse しない。影響範囲は限定的。

## Open Questions

なし（request.md で設計判断は網羅済み）。
