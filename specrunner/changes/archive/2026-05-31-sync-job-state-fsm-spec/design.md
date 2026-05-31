# Design: sync-job-state-fsm-spec

## Context

job-state-store capability spec の `JobStatus` 列挙が 5 値（`running | success | failed | terminated | archived`）のまま stale になっている。一方コード（`src/state/schema.ts`）は 7 値（`running | awaiting-resume | awaiting-merge | failed | terminated | archived | canceled`）であり、`architecture/domain-model.md` も同じ 7 値で正典化済み。

具体的な乖離:
- `success` はコード上存在せず、load 時に `awaiting-merge` へ remap される legacy 値
- `awaiting-resume`・`awaiting-merge`・`canceled` が spec に欠落
- canonical 遷移が `success → archived`（spec）vs `awaiting-merge → archived`（コード）
- "legacy success loads without migration" Scenario がコードの remap 挙動（`success` → `awaiting-merge`）と矛盾

## Goals / Non-Goals

**Goals**:
- delta spec で baseline の `Requirement: JobStatus includes archived as a terminal status` を supersede し、7 値 enum・正しい遷移・正しい legacy remap を反映する
- `SPEC_REVIEW_RETRIES_EXHAUSTED` シナリオの stale な `success` 参照を `awaiting-merge` に訂正する
- active/terminal 区分と VALID_TRANSITIONS の許可遷移を spec に明記する

**Non-Goals**:
- コード変更（コードが正典。spec をコードに合わせる）
- `architecture/domain-model.md` の編集（対応済み）
- 単一 mutator 不変（`transitionJob` 経由強制）の実装

## Decisions

### D1: delta spec で baseline Requirement を丸ごと置換する

baseline の `Requirement: JobStatus includes archived as a terminal status`（L345-365）は 5 値 enum・`success → archived` canonical・「legacy success loads without migration」を含む。これを delta spec の同名 Requirement で **MODIFIED**（header 一致 → tool が自動分類）として全面書き換えする。

**Rationale**: 部分パッチでは 5 値 enum の宣言文が残り、7 値との矛盾が解消しない。Requirement 単位の置換が delta spec の正規手段。

**Alternatives considered**:
- Removed + 新 Requirement 追加 → header が変わるため既存の参照が壊れるリスク。同名 MODIFIED の方が安全。

### D2: `SPEC_REVIEW_RETRIES_EXHAUSTED` シナリオも MODIFIED で訂正する

baseline の `Requirement: state.error.code = SPEC_REVIEW_RETRIES_EXHAUSTED は retry 上限到達を示す` の Scenario L77 が `state.status は success` と書いているが、コード上 pipeline 完走後の status は `awaiting-merge`（`success` は load 時に remap される）。同 Requirement を delta spec に含めて Scenario を訂正する。

**Rationale**: status 値の訂正は当該 Scenario のみだが、Requirement 単位でしか MODIFIED できないため Requirement ごと delta spec に含める。本文の normative 記述は変更なし。

### D3: VALID_TRANSITIONS 遷移表を spec に含める

`domain-model.md` と `lifecycle.ts` に存在する許可遷移表を spec の Requirement 本文にも記載する。これにより spec 単体で状態機械が完結し、3 authority が同一内容を持つ。

**Rationale**: spec が「7 値です」とだけ書いて遷移を省略すると、spec-review が遷移の正しさを検証できない。

**Alternatives considered**:
- domain-model.md への参照だけ書く → spec が self-contained でなくなり、spec-review 時に外部ファイル参照が必要になる。

## Risks / Trade-offs

- [Risk] delta spec の Requirement header が baseline と 1 文字でもずれると ADDED 扱いになり、baseline に旧 Requirement が残る → **Mitigation**: baseline の header を Read で確認済み。正確にコピーする。
- [Risk] VALID_TRANSITIONS 表を 3 箇所（lifecycle.ts / domain-model.md / spec）で管理する冗長性 → **Mitigation**: spec-change のたびに 3 authority の整合を確認するのがこの project の運用。本 change 自体がその証左。

## Open Questions

なし（architect 判断済み）。
