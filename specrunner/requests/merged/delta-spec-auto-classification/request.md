# delta spec の section header を agent から外し tool 自動分類に切替える

## Meta

- **type**: spec-change
- **slug**: delta-spec-auto-classification
- **base-branch**: main
- **adr**: true

## 背景

直近の事故 (= PR #323 spec-merge halt) を契機に、メタ保守 PR の連鎖を時系列で分析した結果、**過去の事故はすべて「LLM agent に format / structure / classification の判断を任せていること」を共通の根とする** ことが判明した:

| 事故 / 構造問題 | 個別 patch (= 実施済) | 構造的根 |
|---|---|---|
| #283 4 層防衛網突破 | PR #285 / #289 / #290 | LLM が delta spec 必要性を判断 |
| #289 authority spec 直接編集 | PR #294 / #322 (= AUTHORITY_SPEC_GUARD fragment) | LLM が prompt 規律を守る前提 |
| #299 request body の authority path 直接指定 | PR #324 (= prompt 規律 + review 検出) | LLM が format / path を判断 |
| 今回 #323 新規 capability に MODIFIED | (= まだ patch なし、#326 提案中) | LLM が section header を判断 |
| 5 件連続事故 (= #289 / #291 + active 3 件) | PR #294 / #324 で部分対応 | LLM が「authority path を書かない」を守る前提 |

各事故ごとに「prompt 強化」「reviewer に check 追加」「dsv に rule 追加」を積み上げてきたが、**LLM が確率的にルールを守らない以上、対症療法は無限に続く** (= ユーザー指摘「LLM は不確定性の塊」)。

本 request の目的は、最も事故頻度の高い領域 (= **delta spec の section header 判断**) を構造的に LLM から外して、**agent が判断する場面そのものを消す**ことで、今後の同型事故を物理的に発生不可にする。

## 思想

**LLM agent には semantic content (= 何を変えたいか) だけ書かせる。format / structure / classification は tool が決定する**。

本 request は上記思想の **第 1 弾** (= delta spec の section header 自動分類)。他の領域 (= request body の authority path / spec authority への直接 write 等) は別 request で順次対応する。

## 要件

### 1. 新 delta spec format の定義

agent が書く delta spec を以下の format に統一する:

```markdown
# Delta Spec: <Title>

## Requirements
### Requirement: <name>
<本文 + #### Scenario>

### Requirement: <name>
<本文 + #### Scenario>

## Removed
- "<requirement name 1>"
- "<requirement name 2>"

## Renamed
- "old name" → "new name"
```

agent の判断対象は「**変えたい Requirement**」「**消すもの**」「**rename するもの**」のみ。`ADDED` / `MODIFIED` / `REMOVED` / `RENAMED` の section header は agent が書かない。

### 2. tool 側の自動分類ロジック

`src/core/spec/delta-spec-merger.ts` で以下の処理を実装する:

1. `## Requirements` 配下の各 Requirement を baseline (= `specrunner/specs/<capability>/spec.md`) と突合
   - baseline に同名 Requirement あり → **MODIFIED 扱い** (= 本文置換)
   - baseline に同名 Requirement なし → **ADDED 扱い** (= 追加)
2. `## Removed` リスト → **REMOVED 扱い** (= baseline から削除)
3. `## Renamed` の old → new 適用後に MODIFIED 判定 (= 順序保証)
4. delta に書かれていない baseline Requirement → 保持

baseline 不在 (= 新規 capability) の場合は全 Requirement が ADDED 扱いに自動的になる (= 新規 capability に MODIFIED を書く事故が物理的に消える)。

### 3. dsv (= `canonical-spec-structure.ts`) の rule 更新

- **旧形式の section header** (= `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements`) を **検出して reject** (= HIGH violation) する
- **新形式の section header** (= `## Requirements` / `## Removed` / `## Renamed`) を **必須** とする

### 4. prompt fragment (= `src/prompts/fragments.ts`) の書き換え

- `DELTA_SPEC_FORMAT`: 旧 section header 4 種類の説明を削除、新形式の例文と規律に書き換え (= 「ADDED / MODIFIED の判断は agent しない、tool が決める」を明示)
- `AUTHORITY_SPEC_GUARD` の「書く側の規律」節 (= `src/prompts/fragments.ts` L29-35 周辺): 旧 section header (= ADDED / MODIFIED / REMOVED / RENAMED) を明示指示している箇所を「tool が ADDED / MODIFIED を決定する」方針に書き換える (= 同フラグメントを取り込む design / spec-fixer / code-fixer / implementer の全 system prompt 上で矛盾しないようにする)

### 5. design checklist (= `src/prompts/design-system.ts`) の更新

- 旧 section header に関する checklist 項目を削除
- 新形式の checklist 項目に書き換え (= 「Requirement 本文を書く」「Removed / Renamed があれば書く」のみ)

### 5.5. spec-review-system.ts の Baseline Consistency Check 更新

- `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_BASE` (= L76-98 周辺) の「Baseline Spec Consistency Check」節が旧 section header (= `## MODIFIED` / `## REMOVED` / `## RENAMED` / `## ADDED` の存在を条件判定) を前提としている
- 新形式 (= `## Requirements` / `## Removed` / `## Renamed`) に対応するよう更新するか、「このチェックは tool 側 (= delta-spec-merger) が baseline diff で担保するため、spec-review では別観点を見る」と明示宣言する (= 設計判断は design 段で決定)

### 6. test fixture / unit test の更新

`tests/` 配下の delta spec fixture (= 多数) を新形式で書き直す。既存の dsv / merger / e2e test を新形式に追随する。

### 7. `bun run typecheck && bun run test` が green

## スコープ外

- **既存 archive (= `specrunner/changes/archive/` 配下) の delta spec 移行**: 完了済 change の delta spec は触らない (= ユーザー明示指示、後方互換は不要)
- **baseline spec format の変更** (= `specrunner/specs/<capability>/spec.md` の構造、authority として維持)
- **思想の他領域への展開** (= request body の authority path / spec authority への直接 write 等、別 request で順次対応)
- **dsv の他 rule** (= no-specs-for-required-type、legacy-flat-* 等) の変更
- **AUTHORITY_SPEC_GUARD fragment 全体** (= PR #322 で完成済、本 request では「書く側の規律」節の section header 指示部分のみ更新、他の MUST NOT / 正規経路 / 見る側の規律は変更しない)

## アクティブ change への影響 (= 移行 note)

- 本 request マージ時点で active 配下に旧形式 delta spec を持つ change がある場合、dsv が更新後に旧形式を HIGH violation として reject するため、**手動で新形式に移行する必要がある**
- 本 request 着手前に active を空にする (= 全件 finish 済) ことで影響範囲を最小化する
- 本 request マージ後に新規 change が起票される時は最初から新形式で書かれる

## 受け入れ基準

- [ ] `delta-spec-merger.ts` が新形式の delta spec を読み、baseline と突合して ADDED / MODIFIED を自動分類する (= unit test で検証)
- [ ] 新規 capability (= baseline 不在) のとき、`## Requirements` 配下の Requirement が全て ADDED 扱いになる (= unit test で検証、PR #323 事故の再現性消失)
- [ ] `## Removed` リストの name が baseline から削除される (= unit test)
- [ ] `## Renamed` の old → new が MODIFIED 判定の前に適用される (= unit test)
- [ ] dsv が旧形式 section header (= `## ADDED Requirements` 等) を HIGH violation として reject する
- [ ] dsv が新形式 (= `## Requirements` / `## Removed` / `## Renamed`) を必須とする
- [ ] `DELTA_SPEC_FORMAT` fragment が新形式の例文と規律に書き換えられている (= string assertion test)
- [ ] `design-system.ts` の checklist が新形式に追随している (= string assertion test)
- [ ] `tests/` 配下の既存 delta spec fixture が全て新形式で書き直されている
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「LLM 不確定性に対する構造的解決」の思想と本 request の位置付けが記録されている

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
