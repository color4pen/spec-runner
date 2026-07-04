# Design: package.json scripts integrity — 新規 script 追加を tampering としない

## Context

verification の phase fallback path には package.json scripts の改竄検知 gate がある。
`checkPackageJsonScriptsIntegrity`（`src/core/verification/runner.ts:177-245`）が
baseline（`git show origin/<baseBranch>:package.json` の scripts）と worktree の scripts を
`normalize`（key ソート後 JSON 文字列化、`:228-229`）して**丸ごと比較**し、不一致なら
`{ tampered: true, diff }` を返す（`:231-238`）。呼び出し側 `runVerificationPhases`（`:355-382`）は
`tampered` が真なら phase を一切実行せず `PACKAGE_JSON_SCRIPTS_TAMPERED` で verification を即
`failed` にする（`:361-381`）。

この gate の本来の目的は、実装 agent が**既存の検証 script**（`test` / `build` 等）を書き換えて
（例: `"test": "vitest run"` → `"test": "exit 0"`）検証を骨抜きにし偽の green を作ることの防止である。

現状の「丸ごと比較」は、baseline に無い script key の**新規追加**も差分として tampering 扱いにする。
greenfield（または baseline の package.json に scripts がほとんど無い状態）で最初の実装 job を回すと、
実装に必要な npm scripts（`dev` / `build` / `test` 等）を追加した時点で
`PACKAGE_JSON_SCRIPTS_TAMPERED` で失敗する。新規追加はこの gate が想定する脅威に当たらず、
かつ greenfield では必須の正当な作業であるため、初回実装がブロックされてしまう。

現状コードの確認済み事実:

- baseline が base branch に無い（`git show` 非 0）場合は `{ tampered: false }` で skip（`:207-210`）。
- worktree に package.json が無い場合も `{ tampered: false }` で skip（`:214-218`）。
- `baselineScripts = baselinePkg.scripts ?? {}`、`currentScripts = currentPkg.scripts ?? {}`（`:225-226`）。
  baseline / current に scripts が無い・空でも `{}` として比較される。
- JSON パース失敗時は `{ tampered: false }` で skip（build phase が拾う、`:241-244`）。
- この gate は phase fallback path（`runVerificationPhases`）のみで走る。
  `verification.commands` path（`runVerificationCommands`, `:282-346`）では呼ばれない。
- 既存テストは `tests/unit/core/verification/runner-integrity.test.ts`（TC-INT-01〜10）。

## Goals / Non-Goals

**Goals**:

- tampering 判定を「baseline に存在する script key の値変更・削除」に限定する。
  baseline に無い script key の新規追加は tampering としない。
- baseline の scripts が空（`{}` / scripts フィールド無し）でも、非空でも、新規 key の追加を許容し、
  verification が phase 実行へ進む。
- 既存の防御を維持する: 既存 key の**値変更**・既存 key の**削除**は従来通り `tampered: true`。
  baseline package.json が base branch に不在なら従来通り skip。
- 失敗時の diff メッセージが、tampering に当たる（変更/削除された）key のみを示す。

**Non-Goals**:

- 新規追加された検証 script の**内容の妥当性**検証（例: vacuous な `"test": "exit 0"` の検出）。
  これは code-review の責務であり、別途 #739 #5（silent-skip 偽 pass）で扱う。
- `verification.commands` path の挙動変更（本 gate は phase fallback path 専用）。
- `PACKAGE_JSON_SCRIPTS_TAMPERED` 以外の verification phase / errorCode。
- dependencies / devDependencies など scripts 以外の package.json フィールドの integrity。
- gate の config 化（allowlist / 無効化スイッチの導入）。

## Decisions

### D1: 比較を「全体一致」から「baseline 各 key の per-key 判定」へ変更する

`checkPackageJsonScriptsIntegrity` の比較部（`src/core/verification/runner.ts:228-240`）を、
`normalize` による丸ごと文字列比較から、baseline の各 key を走査する per-key 判定へ置き換える。

tampered = `∃ key ∈ baselineScripts` such that
- `key` が `currentScripts` に存在しない（**削除**）、または
- `currentScripts[key] !== baselineScripts[key]`（**値変更**）。

`currentScripts` にのみ存在する key（**追加**）は判定に含めない。該当 key が 1 つも無ければ
`{ tampered: false }`。`baselineScripts` / `currentScripts` の `?? {}` フォールバック（`:225-226`）、
git show 非 0 skip（`:207-210`）、package.json 不在 skip（`:214-218`）、JSON パース失敗 skip（`:241-244`）は
不変で維持する。

- **Rationale**: gate の脅威モデルは「既存の検証 script の subvert 防止」である（D2）。
  per-key 判定は baseline に存在する検証 script の値変更・削除だけを捕捉し、追加は素通しするため、
  脅威モデルに正確に一致する。baseline scripts が空でも非空でも、追加は常に許容され incremental な
  追加ケース（初回以降の実装で新 script を足す）も取りこぼさない。
- **Alternatives considered**:
  - Option A「baseline scripts が空のときだけ全追加を許容」 → 却下。baseline に既存 script が 1 つでもある
    incremental な追加を取りこぼす。per-key 判定が正しい。
  - config で allowlist / gate 無効化 → 却下。config 面が増え脅威モデルが曖昧になる。
    gate は既定で有効なまま per-key 判定にするのが最小かつ安全。

### D2: 脅威モデルを「既存の検証 script の subvert 防止」に明示的に限定する

gate の責務を「baseline に存在する検証 script（`test` / `build` 等）の値変更・削除の防止」に限定する。
新規 script の追加は greenfield / incremental 実装の正当な作業であり、その**内容の妥当性**
（vacuous な `"test": "exit 0"` 等）は code-review が担保する。本 gate は追加内容を検証しない。

- **Rationale**: 追加された script の中身の善し悪しは静的な baseline 突合では判定できず、
  意味的レビュー（code-review）の領域である。gate に内容妥当性まで持たせると責務が肥大し、
  greenfield を機械的にブロックする現状の問題を再生産する。責務境界を明示することで、
  「追加を許容すると偽 green を通すのでは」という懸念を code-review 側（#739 #5）へ正しく委譲する。
- **Alternatives considered**:
  - 追加 script も内容パターンで検査する → 却下。本 request のスコープ外であり、
    静的検査で vacuous 判定は困難。code-review の責務に委ねる。

### D3: 失敗 diff は変更/削除された key のみを示し、既存の表示ラベルを維持する

tampering 検出時の diff メッセージ（現状 `:231-237`）を、tampering に当たる key
（値変更・削除された baseline key）のみを対象に構築する。追加のみの場合は tampering ではないため
何も表示しない（そもそも `tampered: false` を返す）。表示は既存の `Baseline scripts:` /
`Current scripts:` ラベル構造を維持し、その中身を**該当 key に絞る**（baseline 側は該当 key の
baseline 値、current 側は該当 key の current 値。削除 key は current 側に現れない）。

- **Rationale**: diff を該当 key に絞ることで、なぜ tampering と判定されたかが読み手に明確になり、
  無関係な追加 key がノイズとして混ざらない。既存テスト
  `runner-integrity.test.ts` TC-INT-08 は `Baseline scripts:` / `Current scripts:` ラベルと
  変更後の値文字列の存在を検査しているため、ラベル構造を保ち該当 key に current 値を含めることで、
  既存テストを**無変更で green** に保てる。
- **Alternatives considered**:
  - 全 scripts を従来通り表示する → 却下。tampering に無関係な追加 key まで diff に出て、
    「追加は tampering でない」という新方針と表示が矛盾する。
  - まったく新しいメッセージ書式にする → 却下。既存テストのラベル検査を壊す必要が生じ、
    メリットが無い。

## Risks / Trade-offs

- [Risk] 追加された script が実質的に検証を骨抜きにする（baseline に `test` が無い greenfield で
  `"test": "exit 0"` を新規追加）→ **Mitigation**: これは「追加内容の妥当性」の問題であり本 gate の
  責務外（D2）。code-review（#739 #5）が担保する。gate は「既存検証 script の subvert 防止」に責務を
  限定するのが設計意図であり、ここで内容検査まで抱えると greenfield ブロック問題を再生産する。
- [Risk] script key が prototype プロパティ名（`toString` / `constructor` 等）と衝突し、削除検出で
  誤って「存在する」と判定される → **Mitigation**: 削除検出は `in` 演算子ではなく
  `Object.prototype.hasOwnProperty.call(currentScripts, key)` で own property を判定し、
  継承プロパティによる誤検出を避ける。
- [Risk] per-key 判定への置換で既存の value-change / deletion 防御が弱まる → **Mitigation**:
  値変更（TC-INT-01 系）・削除の tampered 固定テストと、既存 TC-INT-01〜10 の無変更 green で回帰を固定する
  （tasks T-02）。

## Open Questions

- なし。
