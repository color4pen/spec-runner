# request review の責務分離と default 出力に findings を含める

## Meta

- **type**: spec-change
- **slug**: request-review-system-refinement
- **base-branch**: main
- **date**: 2026-05-15
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

`specrunner request review` の architect レビューが 2 つの構造的な問題を持つ：

### 問題 1: review prompt が design フェーズの責務に侵食している（issue #232）

`src/prompts/request-review-system.ts` の現状の prompt 構成:

- Step 3 (Design Evaluation): コンポーネント責任配置・API 契約の整合性を評価
- Step 4 (Trade-off Analysis): 設計判断の代替案を提示

これらは本来 design agent が後続フェーズで行う仕事で、request review の範囲を超える。結果として:

- 「StepExecutor vs Pipeline の責任境界が未定義」のような実装設計の指摘が HIGH で出る
- HIGH が 1 件でも存在すると verdict が `needs-discussion` に確定（L148）
- request を修正しても design 詳細の指摘が HIGH で出続け、approve に到達しない

fixer-session-continuity の request では 4 周 review を回した。managed-command-extraction の request では 3 周 review が走り、3 周目は implementer punch list レベルの指摘が出た。pipeline コスト面でも実害が大きい。

### 問題 2: default 出力に findings が含まれない（issue #237）

`specrunner request review <slug>` の human-readable 出力は現状 summary のみで、findings リストは出力されない。例：

```
MEDIUM findings が 4 件あり、いずれも実装者が把握していれば解決可能だが、特に
resolveResumeStep の step 名直渡し未定義（#2）と job rm のフラグ非対称（#3）は
設計判断が必要。
```

summary が `#2`, `#3` のような番号で findings を参照するが、本体が出ない。ユーザーは `--json` で再実行しないと指摘内容を確認できない。

## 目的

両問題を同時に解消する。review の責務を request 粒度の検証に絞り、default 出力で findings を直接読めるようにする。

## 要件

### Review prompt の責務分離（#232）

1. `src/prompts/request-review-system.ts` を以下の指針で書き直す:
   - **request 粒度の検証に絞る**: ゴール明確性 / 受け入れ基準の検証可能性 / scope の妥当性 / 外部依存（SDK / API 制約）の漏れ
   - **design 領域の指摘を出さない**: コンポーネント責任配置 / API 契約 / 内部設計の trade-off は design phase の責務
   - Step 3 / Step 4 を削除または「scope 検証 / 外部制約検証」にリネーム

2. severity 判定基準に scope 制約を追加する:
   - **HIGH** = request 自体の欠陥（ゴール不明、受け入れ基準不在、外部制約の検証漏れ）
   - **MEDIUM** = scope の曖昧さ、推奨される追記
   - **LOW** = 表現の改善余地
   - 実装設計の指摘（クラス境界、責務分割、エラーハンドリング戦略等）は severity 判定対象外、見送る or design agent に委ねる旨を prompt で明示

3. verdict 判定の閾値を見直す:
   - HIGH が 0 件 = `approved`
   - HIGH が 1 件以上 = `needs-discussion`
   - MEDIUM のみ = `approved`（情報提供として findings を出す）
   - 現状の「HIGH 1 件で needs-discussion 確定」は維持しつつ、HIGH の出方が prompt 改善で減ることで自然に収束する

### Default 出力に findings を含める（#237）

4. `src/core/command/request-review.ts` の human-readable formatter を以下に変更する:
   - 出力に **verdict / summary / finding 全件** を含める
   - 各 finding は **stable な番号**（`#1`, `#2`, ...）を付与し、summary 内の参照と一致させる
   - 各 finding に表示する項目:
     - severity (HIGH / MEDIUM / LOW)
     - title or short label
     - location / file path（あれば）
     - 詳細説明
     - 推奨アクション（あれば）

5. `--json` モードの出力は不変（既存 caller の互換維持）

6. findings がない場合は「No findings.」とだけ表示する

### Reviewer の出力構造化

7. `src/core/request/reviewer.ts` の reviewer 結果型に finding 番号を明示する（既に番号が parse 結果に含まれる場合は no-op）

8. summary 文中の `#N` 参照が finding number と一意に対応することを保証する（reviewer prompt 側で番号付与を強制する）

## スコープ外

- code-review / spec-review prompt の見直し（別 prompt で別 issue）
- review iteration の上限変更（#236 で別途対応）
- design / implementer フェーズの責務再定義（本 request は review の責務縮小のみ）

## 受け入れ基準

- [ ] `src/prompts/request-review-system.ts` から design 領域（クラス境界 / API 契約 / 内部実装 trade-off）の評価指示が削除されている
- [ ] severity 判定基準に scope 制約が明示されている（HIGH = request 自体の欠陥に限定）
- [ ] 同じ request に対する review iteration 数が prompt 改善前より減る（定性的、本 request の review 自体で検証）
- [ ] `specrunner request review <slug>` の default 出力に finding 全件が表示される
- [ ] summary 中の `#N` 参照が finding number と一致する
- [ ] `--json` モードの出力は不変
- [ ] findings がない場合は「No findings.」とだけ表示される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **review の責務を request 粒度に絞る**。design / implementer フェーズには専用 agent が後続するので、request review がそれらに侵食すると review が永久 loop に入る。issue #232 の観測データ（4 周回しても approve に到達しない）が証拠

- **severity 判定基準に scope 制約**を入れる。「実装設計の指摘」を HIGH 対象から外すことで、verdict 判定の閾値（HIGH 1 件で needs-discussion）を維持しつつ収束性を上げる

- **default 出力に findings を含める**理由は user friction の削減。`--json` 必須は IDE 連携やスクリプト用途には適切だが、対話セッションでの review には冗長。default が human-readable で full content を返すべき

- **summary 中の `#N` 参照と finding number の一致**を仕様化する。reviewer prompt 側で番号付与を強制し、formatter 側は番号をそのまま表示するだけ。両者の同期は prompt 側で担保する

- **`--json` 出力の互換維持**は必須。既存 caller（IDE 連携、CI 等）の breaking change を避ける

- **review prompt の修正と output formatter の修正は独立**だが、同じ review system に閉じるので 1 request に bundle する。PR ごとの diff は両 file 領域に跨るが、責務的には密接
