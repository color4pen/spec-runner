# config の zod schema と手書き interface の乖離を typecheck で検出する

## Meta

- **type**: chore
- **slug**: config-schema-type-parity
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

config の検証は zod schema（`configSchema`）に一本化されたが、型定義は手書き interface のまま並走しており、schema にフィールドを足して interface を忘れる（または逆）という乖離が静かに起き得る。この乖離は実行時にも typecheck でも検出されない。型の問題は型システム自身に守らせる — schema から導出した型と手書き interface の等価性をコンパイル時に検査し、乖離のクラスを「起き得る事故」から「typecheck エラー」に変える。

## 現状コードの前提

- `configSchema` は zod/v4-mini で定義され export されている（`src/config/schema.ts:418`）
- 手書き interface は同ファイルに 15 個存在し、`SpecRunnerConfig`（`src/config/schema.ts:202`）が頂点
- `validateConfig` は zod 構造検証の後、unknown フィールドを保持するため raw を `SpecRunnerConfig` に cast して返す（`src/config/schema.ts:796`）— schema に載らない通過フィールドが存在し得る設計

## 要件

1. 型レベルの等価性アサーションを追加する: `z.infer<typeof configSchema>` と `SpecRunnerConfig` の双方向の代入可能性（Equal 型）をコンパイル時に検査する静的アサーションを、テスト配下または schema.ts 隣接の専用ファイルに置く。typecheck（`tsc --noEmit`）が乖離で失敗すること
2. 通過フィールド（schema に意図的に載せていないフィールド）が存在して完全等価が成立しない場合は、完全等価を弱めるのではなく、(a) 通過フィールドを optional として schema に載せる、または (b) 「schema 由来部分」と「通過部分」を型レベルで分離して由来部分の等価を検査する、のいずれかで対応する。検査をフィールド単位の部分一致に緩めない
3. トップレベルだけでなく、乖離リスクのある下位 interface（StepExecutionConfig 等、schema に対応物を持つもの）にも同様のアサーションを置く
4. ランタイムコードに変更を加えない（型レベルのみ。dist の出力が変わらないこと）

## スコープ外

- z.infer による interface の置き換え（型定義の一本化そのもの）
- schema / interface へのフィールド追加・仕様変更
- config 以外（report-result 等）の schema への同様の検査の展開

## 受け入れ基準

- [ ] schema にのみフィールドを足すと typecheck が失敗する（検証手順を PR に記載）
- [ ] interface にのみフィールドを足すと typecheck が失敗する
- [ ] 現状のコードで typecheck / test / build がすべて green
- [ ] dist 出力に差分がない（型レベルのみの変更）

## architect 評価済みの設計判断

- rules（agent への助言）ではなく機械強制を選ぶ。乖離は不注意ではなく「合っているつもり」で起きるため、書き手向けの注意書きでは防げない。B 不変条件と同じく、構造の整合は typecheck の赤で守る
- z.infer への全面移行（情報源の物理的一本化）は採らない。通過フィールドと JSDoc の置き場所という実害のある論点を伴うため、等価性検査によって乖離検出が構造化された時点で移行の緊急性は消える
