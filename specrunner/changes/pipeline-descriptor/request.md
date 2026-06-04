# pipeline 構成を PipelineDescriptor + registry に集約し、pipelineId で選択する

## Meta

- **type**: spec-change
- **slug**: pipeline-descriptor
- **base-branch**: main
- **adr**: true

## 背景

pipeline 構成（工程の並び・遷移・繰り返し組）は現在 `run.ts` の step Map と `types.ts` の `STANDARD_*` 定数にベタ書きで、構成が 1 種類に固定されている。一方 `Pipeline` クラスは steps / transitions / loops をコンストラクタ引数で受ける作りになっており、構成を外から差し替える素地は既にある。

複数の pipeline 定義を扱う土台として、構成を 1 つのデータ（記述子）に集約し、registry から `pipelineId` で選べるようにする。`pipelineId` は state に記録・解決（`getPipelineId`）できる状態に既になっている。本変更は標準 pipeline について挙動を変えない畳み込みが主体。

## 要件

1. `PipelineDescriptor` 型を定義する（id / steps / transitions / loopName(s) / loopFixerPairs / startStep / maxIterations）。
2. registry（id → descriptor）を導入し、現行の `STANDARD_*` を `STANDARD_DESCRIPTOR` 1 インスタンスに畳む。
3. run と resume の pipeline 構築を、job の `pipelineId`（`getPipelineId` で解決）で registry から記述子を引いて組む形に置き換える。
4. design だけの小 pipeline（`runDesignPipeline` 相当）を `pipelineId = "design-only"`（`kernel/pipeline-ids.ts` の `PIPELINE_IDS` に追加）として registry の 2 番目の登録物にし、registry 経由で構築する。
5. 標準 pipeline の実行・再開・画面出力を変えない。

## スコープ外

- 工程の役割（creator / reviewer / fixer / gate）・phase を記述子に一級で持たせること、および resume の役割導出（`resolve-step` のハードコード）の一般化。
- `Pipeline` 本体に焼き付いた収束意味論（exhaustion 経路 / fixer bypass / まとめ表示 / 既定判定）の剥がし。
- 各工程の入出力契約の宣言。

## 受け入れ基準

- [ ] `PipelineDescriptor` 型と registry が導入され、`STANDARD_*` が `STANDARD_DESCRIPTOR` に畳まれている。
- [ ] run / resume が `pipelineId` で記述子を引いて Pipeline を構築する。
- [ ] design-only pipeline が registry 経由で構築・動作する（登録物が 2 つ）。
- [ ] design-only 記述子の id が `"design-only"` として `PIPELINE_IDS` に登録されている。
- [ ] `resolve-step` が import する `STANDARD_*`（特に `STANDARD_LOOP_FIXER_PAIRS`）が re-export 等で存続し、`resolve-step` 未変更のまま typecheck が通る。
- [ ] 画面出力スナップショットがバイト単位で同一。
- [ ] `STANDARD_*` の具体値を直接 assert していたテストが記述子参照に張り替え済み。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

- 「`pipelineId` で記述子を選択する」配線を本 request に含める。同一性フィールドの追加と起動時記録は前段で完了済みのため、選択ロジックはここで初めて意味を持つ。
- 記述子は将来、工程の役割（creator / reviewer / fixer / gate）と phaseMap を一級で追加する前提で設計するが、本 request ではそれらを含めず、現行の loopName(s) / loopFixerPairs までに留める。
- resume の役割導出の一般化（`resolve-step` のハードコード除去）は本 request では行わない。記述子に役割を持たせる変更と一体で設計すべきため。
- そのため `resolve-step` 等が import する `STANDARD_*`（特に `STANDARD_LOOP_FIXER_PAIRS`）は、descriptor へ畳んだ後も re-export として存続させ、`resolve-step` 本体は変更しない（typecheck を割らないための制約）。
- design-only 記述子の id は `"design-only"` とし、`kernel/pipeline-ids.ts` の `PIPELINE_IDS` に追加する（anonymous descriptor にはしない）。
- `Pipeline` は既に steps / transitions / loops を constructor 引数で受けるため、本変更は定数を記述子型に束ね registry に入れる畳み込みが主で、エンジン本体（`runInternal`）は変更しない。
- 標準 pipeline の挙動不変は、画面出力のバイト単位スナップショットを回帰の歯として担保する。
