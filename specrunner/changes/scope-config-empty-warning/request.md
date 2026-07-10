# permissionScope 宣言 pipeline で forbidden surfaces が未設定のとき job start に warning を出す

## Meta

- **type**: new-feature
- **slug**: scope-config-empty-warning
- **base-branch**: main
- **adr**: false

## 背景

fast pipeline は `permissionScope` を宣言するが、forbidden surfaces は repo config（`pipeline.fast.forbiddenSurfaces`）から実行時に解決される（#746）。config 未設定の repo では resolved forbidden が空になり、scope breach 検出は**一切発火しない**。registry のコメントにも「Empty forbidden = no protected surfaces declared for this repo = no breach detection」と明記された意図的な設計だが、利用者からは「fast profile には scope 制限がある」と見え、保護されていないのに保護されていると誤認するギャップがある。scoped pipeline を実際に使う瞬間に、検出が実質無効であることを明示する warning を出す。

## 現状コードの前提

- `src/core/pipeline/registry.ts:150-161` — FAST_DESCRIPTOR は `permissionScope: { checkpoint: "conformance", forbidden: [] }` を宣言。forbidden は静的には空で、実行時に config から注入される
- `src/core/pipeline/resolve-scope.ts:31-49` — `applyScopeConfig(base, config)` が pure 変換として forbidden を解決する。`base.permissionScope === undefined` なら base をそのまま返す（standard / design-only はこちら）
- `src/config/schema.ts:1285-1293` — `resolvePipelineForbiddenSurfaces(config, pipelineId)` が唯一の resolver。fast 以外は常に `[]`、fast は `config.pipeline?.fast?.forbiddenSurfaces ?? []`（キー欠落と空配列を区別しない）
- `src/core/pipeline/run.ts:94` — `buildPipelineForJob()` 内で `applyScopeConfig` が呼ばれる。この関数は job start と resume の双方から、また 1 run 中に複数回呼ばれうる
- `src/logger/stdout.ts:200` — `logWarn(message)` が warning 出力の慣例

## 要件

1. `permissionScope` を宣言する descriptor（現状は fast のみ、将来の scoped profile も同様）に対し、config 解決後の forbidden が空である場合、job 実行の準備段階で warning を 1 回出力する。文言には「scope breach 検出が実質無効であること」と「`pipeline.<id>.forbiddenSurfaces` を設定すれば有効化されること」を含める
2. warning は pipeline id に依存しない一般形で判定する（`descriptor.permissionScope !== undefined && forbidden.length === 0`）。fast という名前への分岐を新設しない
3. `permissionScope` を宣言しない descriptor（standard / design-only）では warning を出さない（挙動不変）
4. forbidden が 1 件以上解決される場合は warning を出さない（挙動不変）
5. 1 回の run で warning が重複出力されない（`buildPipelineForJob` が複数回呼ばれても run 準備の 1 回に留める。実装位置・抑止方式は design 判断。`applyScopeConfig` の pure 変換契約は維持すること）

## スコープ外

- doctor への同種チェックの追加
- 「明示的な空配列 = 意図的 opt-out」を区別する config 語彙の新設（warning の抑止は surface を 1 件以上設定することで行う）
- breach 検出ロジック・checkpoint・descriptor 本体の変更
- inbox / unattended 経路での通知形式の変更（stdout の warning のみ）

## 受け入れ基準

- [ ] permissionScope 宣言 + forbidden 空の job start で warning が出力されることをテストで固定する
- [ ] forbidden が 1 件以上設定されている場合に warning が出ないことをテストで固定する
- [ ] permissionScope なしの pipeline（standard）で warning が出ないことをテストで固定する
- [ ] 1 run 中に warning が 1 回に留まることをテストで固定する
- [ ] `applyScopeConfig` の既存契約（permissionScope なし → 同一参照で返す）が不変であることを既存テストで確認する
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 判定を「permissionScope の宣言 + 解決後 forbidden 空」の一般形にする — #746 の「scope は descriptor の permissionScope から導出し、profile 名に結び付けない」という既存設計と整合する
- **採用**: warning のみで実行は止めない — forbidden 未設定は正当な構成（repo 固有の保護面は repo が決める）であり、fail-closed にすると新規 repo の fast 導入を阻害する。ここでの目的は誤認の解消であって強制ではない
- **却下**: doctor check としての実装 — doctor は環境診断であり「どの pipeline を使うか」を知らない。scoped pipeline を実際に使う run 準備時が、誤認を解く唯一確実なタイミング。doctor への追加は必要になったら別 request
- **却下**: config に明示 opt-out フラグを足す案 — 語彙の追加に見合う需要がない。surface を設定すれば warning は消える
