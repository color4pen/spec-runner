# 工程の役割と phase を記述子に一級化し、resume とエンジンの収束意味論をそこから導出する

## Meta

- **type**: spec-change
- **slug**: pipeline-roles-neutral-engine
- **base-branch**: main
- **adr**: true

## 背景

pipeline 構成は記述子（`PipelineDescriptor`）に集約されたが、「工程の役割」という同じ情報が依然 2 箇所に標準 pipeline 前提でハードコードされている。

- **再開側**: `resolve-step.ts` が `FIXER_TO_LOOP` / `REVIEWER_STEPS` / `isSpecPhase` / `STEP_MAPPING`（phase × role × step）で、どの工程が reviewer / fixer / creator かを標準前提で決め打ちしている。
- **エンジン側**: `Pipeline` 本体に収束意味論が焼き付いている（exhaustion 経路 / fixer bypass の "あと 1 回" 救済 / まとめ表示の `SPEC_REVIEW` 直書き / 既定判定の approved フォールバック）。

このため非標準の記述子は正しく再開・収束しない。役割（creator / reviewer / fixer / gate）と phase を記述子に一級で持たせ、再開とエンジンの両方をそこから導出することで、任意の記述子が正しく回るようにする。これが「任意の並びが正しく回る」ための核。

## 要件

1. `PipelineDescriptor` に工程の役割（creator / reviewer / fixer / gate）と phase を一級で持たせる。
2. 再開の役割導出（`resolve-step.ts` の `FIXER_TO_LOOP` / `REVIEWER_STEPS` / `isSpecPhase` / `STEP_MAPPING`）を記述子から導出する。standard 決め打ちと standard import を除去する。
3. `Pipeline` 本体に焼き付いた standard 固有の収束意味論を記述子駆動の一般則にする：exhaustion 経路 / fixer bypass（"あと 1 回" 救済）/ まとめ表示（`SPEC_REVIEW` 直書きの除去）。
4. 標準 pipeline の挙動（画面出力・打ち切り・救済・遷移）をバイト単位かつ意味的に不変に保つ。
5. 稼働中ジョブを含む既存 state ファイルが本変更後の再開で壊れない。
6. design-only など非標準記述子で再開が正しい工程に解決する。

## スコープ外

- 各工程の入出力契約・副作用クラスの宣言。
- 新しい記述子・進め方（preset 等）の追加。

## 受け入れ基準

- [ ] `PipelineDescriptor` が役割（creator / reviewer / fixer / gate）と phase を一級で持つ。
- [ ] `resolve-step` が記述子から役割を導出し、`FIXER_TO_LOOP` / `REVIEWER_STEPS` / `isSpecPhase` / `STEP_MAPPING` の standard 決め打ちと standard import が除去されている。
- [ ] `Pipeline` の standard 固有の収束意味論（exhaustion / fixer bypass / まとめ）が記述子駆動になり、本体に standard 固有の直書き（`SPEC_REVIEW` 等）が残っていない。
- [ ] 画面出力スナップショットがバイト単位で同一。
- [ ] 既存の打ち切り（`*_RETRIES_EXHAUSTED`）・fixer bypass・escalation の挙動が保存され、関連テストが green。
- [ ] design-only 記述子で再開が正しい工程に解決する（テストで担保）。
- [ ] 既存 state ファイル（稼働中ジョブ含む）が本変更後に再開で壊れない。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

- 再開の役割導出とエンジンの収束意味論は、同一の抽象（記述子が役割 / phase を一級に持ち、再開とエンジンが共にそこから導出する）の表裏。分離せず本 request で一体に設計する。役割 / phase の追加は既存記述子が想定済みの拡張点。
- creator 役（design / implementer）は fixer pair に現れないため、`loopFixerPairs` だけでは役割を導出できない。記述子に creator / reviewer / fixer / gate と phase を明示的に持たせる必要がある（`resolve-step` の `STEP_MAPPING` が要求する phase × role × step の 3 軸を満たす）。
- fixer bypass（"fixer が max に達したら reviewer を 1 回だけ再実行する"）は標準固有の救済で `Pipeline` 本体に焼き付いている。これを記述子のどのフィールドで一般表現するかが本変更の核心の設計判断であり、誤ると稼働中ジョブの再開互換が壊れる（最大リスク）。
- 結果未報告時の approved 既定値（verdict も completionVerdict も無い工程は成功扱いで次へ進む）は standard 固有でなく全パイプライン共通の既定であり、エンジンの汎用 convention として維持する。記述子駆動化の対象は standard 固有の収束意味論に限る。
- 回帰の歯：画面出力のバイト単位スナップショット ＋ 打ち切り / 救済 / escalation の挙動テスト ＋ 既存 state（in-flight 含む）の再開互換テスト。
- 互換性の機構：`JobState` スキーマは変更しない（役割 / phase は記述子側に持たせる）。在来ジョブは `pipelineId`（欠落時は `"standard"`）から標準記述子に解決し、その役割 / phase 値が従来の決め打ちと一致するため、再開ルーティングは不変。これが「既存 state が再開で壊れない」根拠。
- 本変更はリテラルを `Pipeline` 本体・`resolve-step` から記述子へ動かすため、ソースを文字列で読む既存テストが破綻する。tasks 段階で「ソース読み取り・リテラル assert に依存するテスト」を最初に全列挙し、記述子値の import + assert（ランタイムチェック）へ書き換える対象を網羅すること。
- 規模が spec-review の審査範囲を超える場合は、「役割 / phase の一級化 + 再開導出」と「エンジンの収束意味論の記述子駆動化」の 2 段への分割を spec-review の判断に委ねる。
