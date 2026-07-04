# package.json scripts integrity — 新規 script の追加を tampering としない

## Meta

- **type**: spec-change
- **slug**: pkg-scripts-additions-allowed
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

greenfield（または baseline の `package.json` に scripts がほとんど無い状態）で最初の実装 job を回すと、実装が必要な npm scripts（`dev` / `build` / `test` 等）を追加した時点で verification が `PACKAGE_JSON_SCRIPTS_TAMPERED` で失敗する。

この integrity gate の本来の目的は、実装 agent が**既存の検証 script**（`test` / `build` 等）を書き換えて（例: `"test": "vitest run"` → `"test": "exit 0"`）検証を骨抜きにし偽の green を作ることの防止である。baseline に存在しない script key の**新規追加**はこの脅威に当たらず、かつ greenfield では必須の作業である。現状は追加も「差分」として tampering 扱いになるため、正当な初回実装がブロックされる。

## 現状コードの前提

- `src/core/verification/runner.ts:177-245` `checkPackageJsonScriptsIntegrity`: baseline（`git show origin/<baseBranch>:package.json` の scripts）と worktree の scripts を `normalize`（key ソート後 JSON 文字列化）して**丸ごと比較**し、不一致なら `{ tampered: true }` を返す（`:231-238`）。
- `src/core/verification/runner.ts:208-210`: baseline の `package.json` 自体が base branch に無い（`git show` が非 0）場合は `{ tampered: false }` で check を skip する。
- `src/core/verification/runner.ts:225-226`: `baselineScripts = baselinePkg.scripts ?? {}`、`currentScripts = currentPkg.scripts ?? {}`。baseline に scripts が無い/空でも `{}` として比較される。
- `src/core/verification/runner.ts:361-381`: `tampered` が真なら phase を一切実行せず `PACKAGE_JSON_SCRIPTS_TAMPERED` で verification を即 `failed` にする。
- この gate は phase fallback path（`runVerificationPhases`）のみで走る。`verification.commands` path（`runVerificationCommands`, `:282-`）では呼ばれない。

## 要件

1. **tampering 判定を「baseline に存在する script key の値変更・削除」に限定する。** baseline に無い script key の新規追加は tampering としない。
2. **baseline の scripts が空（`{}` または scripts フィールド無し）でも、新規 key の追加を許容し**、verification が phase 実行へ進む。
3. **既存挙動を維持する**: baseline `package.json` が base branch に不在なら従来通り skip（`{ tampered: false }`）。既存 script key の値が変更された／既存 key が削除された場合は従来通り `tampered: true`。

## スコープ外

- 新規追加された検証 script の**内容の妥当性**検証（例: vacuous な `"test": "exit 0"` の検出）。これは code-review の領域であり、別途 #739 #5（silent-skip 偽 pass）で扱う。
- `verification.commands` path の挙動（本 gate は phase fallback path 専用）。
- `PACKAGE_JSON_SCRIPTS_TAMPERED` 以外の verification phase / errorCode。
- dependencies / devDependencies など scripts 以外の package.json フィールドの integrity（現状 gate 対象外、本 request でも対象外）。

## 受け入れ基準

- [ ] baseline に存在しない script key を追加しても `tampered` にならず、verification が phase 実行に進むことをテストで固定する（baseline scripts 空・非空の両ケース）。
- [ ] baseline に存在する script key の**値を変更**すると従来通り `tampered: true` になることをテストで固定する。
- [ ] baseline に存在する script key を**削除**すると `tampered: true` になることをテストで固定する。
- [ ] baseline `package.json` が base branch に不在のとき従来通り check を skip することを、既存テスト無変更 green もしくは新規テストで確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- `checkPackageJsonScriptsIntegrity` の比較を「全体一致」から「**baseline の各 key について、current に同じ値で存在するか**」の per-key 判定へ変更する。tampered = `∃ key ∈ baselineScripts` such that `currentScripts[key] !== baselineScripts[key]`（値変更）または `key ∉ currentScripts`（削除）。`currentScripts` にのみ存在する key（追加）は無視する。
- 脅威モデルを「既存の検証 script の subvert 防止」に限定して明示する。新規 script の追加は greenfield の正当な作業であり、その内容妥当性は code-review が担保する（本 gate の責務外）。
- 失敗時の diff メッセージは、変更/削除された key を示すように整える（追加のみの場合は tampering ではないので表示しない）。

**却下**

- 「baseline scripts が空のときだけ全追加を許容」（Option A）: baseline に既存 script が1つでもある incremental な追加ケース（初回以降の実装で新 script を足す）を取りこぼす。per-key 判定が正しい。
- 「config で allowlist / gate 無効化」: config 面が増え、脅威モデルが曖昧になる。gate は既定で有効なまま per-key 判定にするのが最小かつ安全。
