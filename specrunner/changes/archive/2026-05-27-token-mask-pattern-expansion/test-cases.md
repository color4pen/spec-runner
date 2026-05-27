# Test Cases: token-mask-pattern-expansion

## Overview

`MASK_PATTERNS` に `ghu_*`, `ghs_*`, `github_pat_*` を追加し、既存の `gh[opr]_*` を統合した 3 パターン構成への変更を検証する。

---

## Category: 新規トークン マスク

### TC-01: ghu_ トークンがマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準
- **Category**: 新規トークン マスク

**GIVEN** `maskSensitive` に `"token: ghu_AbCdEfGhIjKlMnOpQrStUv"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"token: ghu_..."` であること

---

### TC-02: ghs_ トークンがマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準
- **Category**: 新規トークン マスク

**GIVEN** `maskSensitive` に `"ghs_ABCDEF0123456789"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"ghs_..."` であること

---

### TC-03: github_pat_ トークンがマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準
- **Category**: 新規トークン マスク

**GIVEN** `maskSensitive` に `"github_pat_AbCdEfGhIj0123456789_suffix"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"github_..."` であること（`_` が 2 つあるため `github_` が prefix として抽出される）

---

### TC-04: github_pat_ のアンダースコアを含む suffix がマスクされる

- **Priority**: must
- **Source**: design.md D2（`[A-Za-z0-9_]+` で `_` を含む）
- **Category**: 新規トークン マスク

**GIVEN** `maskSensitive` に `"github_pat_abc_def_ghi"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"github_..."` であること（`_` を含む suffix 全体がマスクされる）

---

## Category: 既存トークン 後退互換

### TC-05: gho_ トークンが引き続きマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準（既存マスク継続）
- **Category**: 既存トークン 後退互換

**GIVEN** `maskSensitive` に `"gho_XyZ1234567890"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"gho_..."` であること

---

### TC-06: ghp_ トークンが引き続きマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準（既存マスク継続）
- **Category**: 既存トークン 後退互換

**GIVEN** `maskSensitive` に `"ghp_ABCDEF123456"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"ghp_..."` であること

---

### TC-07: ghr_ トークンが引き続きマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準（既存マスク継続）
- **Category**: 既存トークン 後退互換

**GIVEN** `maskSensitive` に `"ghr_abcdef123456"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"ghr_..."` であること

---

### TC-08: sk-ant- トークンが引き続きマスクされる

- **Priority**: must
- **Source**: request.md 受け入れ基準（既存マスク継続）; design.md D3
- **Category**: 既存トークン 後退互換

**GIVEN** `maskSensitive` に `"sk-ant-api03-abcdefghij0123456789"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"sk-..."` であること（`-` が区切り文字のため `sk-` が prefix）

---

## Category: パターン構造

### TC-09: MASK_PATTERNS が 3 要素であること

- **Priority**: must
- **Source**: request.md 受け入れ基準（3 パターン以下）; tasks.md T-01 Acceptance
- **Category**: パターン構造

**GIVEN** `stdout.ts` の `MASK_PATTERNS` 定義を読み取る  
**WHEN** 要素数を確認する  
**THEN** `MASK_PATTERNS.length === 3` であること

---

### TC-10: gh[oprsu]_ パターンが MASK_PATTERNS に含まれる

- **Priority**: must
- **Source**: tasks.md T-01 Acceptance
- **Category**: パターン構造

**GIVEN** `stdout.ts` の `MASK_PATTERNS` 定義  
**WHEN** パターン内容を確認する  
**THEN** `/\b(gh[oprsu])_[A-Za-z0-9]+/g` が含まれること

---

### TC-11: github_pat_ パターンが MASK_PATTERNS に含まれる

- **Priority**: must
- **Source**: tasks.md T-01 Acceptance
- **Category**: パターン構造

**GIVEN** `stdout.ts` の `MASK_PATTERNS` 定義  
**WHEN** パターン内容を確認する  
**THEN** `/\bgithub_pat_[A-Za-z0-9_]+/g` が含まれること

---

### TC-12: sk-ant- パターンが MASK_PATTERNS に残っている

- **Priority**: must
- **Source**: tasks.md T-01 Acceptance
- **Category**: パターン構造

**GIVEN** `stdout.ts` の `MASK_PATTERNS` 定義  
**WHEN** パターン内容を確認する  
**THEN** `/\bsk-ant-[A-Za-z0-9_-]+/g` が含まれること

---

### TC-13: maskSensitive 関数に差分がない

- **Priority**: must
- **Source**: tasks.md T-01 Acceptance; request.md スコープ外
- **Category**: パターン構造

**GIVEN** `src/logger/stdout.ts` の `maskSensitive` 関数  
**WHEN** 変更前後の diff を確認する  
**THEN** `maskSensitive` 関数本体（`MASK_PATTERNS` の参照以外）に変更がないこと

---

## Category: 境界値・エッジケース

### TC-14: 単語境界 (\b) が機能すること — prefix のみの文字列はマスクされない

- **Priority**: should
- **Source**: design.md D1（`\b` による境界）
- **Category**: 境界値・エッジケース

**GIVEN** `maskSensitive` に `"xghu_AbCdEfGh"` を渡す（先頭に別の文字が付く）  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"xghu_AbCdEfGh"` のままであること（`\b` により一致しない）

---

### TC-15: 複数トークンが同一文字列に含まれる場合、すべてマスクされる

- **Priority**: should
- **Source**: 多層防御観点
- **Category**: 境界値・エッジケース

**GIVEN** `maskSensitive` に `"ghu_token1 ghs_token2 github_pat_token3"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"ghu_... ghs_... github_..."` であること（3 種すべてマスク）

---

### TC-16: 既存 gh[opr]_ と新規 gh[su]_ が混在する場合、すべてマスクされる

- **Priority**: should
- **Source**: 統合パターン `/\b(gh[oprsu])_/g` の動作確認
- **Category**: 境界値・エッジケース

**GIVEN** `maskSensitive` に `"gho_AAA ghp_BBB ghr_CCC ghs_DDD ghu_EEE"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"gho_... ghp_... ghr_... ghs_... ghu_..."` であること

---

### TC-17: トークンを含まない文字列は変更されない

- **Priority**: should
- **Source**: 誤検知防止
- **Category**: 境界値・エッジケース

**GIVEN** `maskSensitive` に `"normal log message without tokens"` を渡す  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"normal log message without tokens"` のまま変更されないこと

---

### TC-18: 空文字列を渡しても例外が発生しない

- **Priority**: should
- **Source**: ロバストネス
- **Category**: 境界値・エッジケース

**GIVEN** `maskSensitive` に `""` を渡す  
**WHEN** 関数が実行される  
**THEN** 例外なく `""` が返ること

---

### TC-19: ghi_ のような未定義 prefix はマスクされない

- **Priority**: could
- **Source**: character class `[oprsu]` の範囲確認
- **Category**: 境界値・エッジケース

**GIVEN** `maskSensitive` に `"ghi_AbCdEfGh"` を渡す（`i` は `[oprsu]` に含まれない）  
**WHEN** 関数が実行される  
**THEN** 戻り値が `"ghi_AbCdEfGh"` のままであること（マスクされない）

---

## Category: Delta Spec

### TC-20: delta spec が存在する

- **Priority**: must
- **Source**: tasks.md T-02 Acceptance
- **Category**: Delta Spec

**GIVEN** `specrunner/changes/token-mask-pattern-expansion/specs/cli-commands/spec.md` のパス  
**WHEN** ファイルの存在を確認する  
**THEN** ファイルが存在すること

---

### TC-21: delta spec に新規マスクパターンの列挙が含まれる

- **Priority**: must
- **Source**: tasks.md T-02 Acceptance
- **Category**: Delta Spec

**GIVEN** delta spec ファイル `specrunner/changes/token-mask-pattern-expansion/specs/cli-commands/spec.md`  
**WHEN** 内容を確認する  
**THEN** `ghs_`, `ghu_`, `github_pat_` の 3 つが列挙されていること

---

### TC-22: delta spec の Requirement header が baseline と一致する

- **Priority**: must
- **Source**: tasks.md T-02 Acceptance
- **Category**: Delta Spec

**GIVEN** delta spec ファイルの `### Requirement:` header  
**WHEN** baseline `cli-commands` spec の同 header と比較する  
**THEN** header 文字列が完全一致すること

---

### TC-23: delta spec に Scenario が最低 1 つ含まれる

- **Priority**: must
- **Source**: tasks.md T-02 Acceptance
- **Category**: Delta Spec

**GIVEN** delta spec ファイル  
**WHEN** `Scenario` キーワードを検索する  
**THEN** 1 つ以上の Scenario 定義が存在すること

---

## Category: ビルド・型チェック

### TC-24: bun run typecheck が成功する

- **Priority**: must
- **Source**: tasks.md T-01 Acceptance, T-03 Acceptance
- **Category**: ビルド・型チェック

**GIVEN** T-01 の変更が適用された状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code が 0 であること（型エラーなし）

---

### TC-25: bun run test が成功する

- **Priority**: must
- **Source**: tasks.md T-03 Acceptance
- **Category**: ビルド・型チェック

**GIVEN** T-01 および T-02 の変更が適用された状態  
**WHEN** `bun run test` を実行する  
**THEN** exit code が 0 であること（テスト全 pass）
