# ADR-20260704: package.json scripts integrity gate を per-key 判定に変更し、新規追加を tampering 対象外とする

## ステータス

accepted

## コンテキスト

verification の phase fallback path には `checkPackageJsonScriptsIntegrity`（`src/core/verification/runner.ts`）による package.json scripts の改竄検知 gate がある。変更前の実装は baseline（`git show origin/<baseBranch>:package.json` の scripts）と worktree の scripts を `normalize`（key ソート後 JSON 文字列化）して**丸ごと比較**し、不一致なら `{ tampered: true }` を返していた。

この gate の本来の目的は、実装 agent が**既存の検証 script**（`test` / `build` 等）を書き換えて（例: `"test": "vitest run"` → `"test": "exit 0"`）検証を骨抜きにし偽の green を作ることの防止である。

しかし「丸ごと比較」は、baseline に存在しない script key の**新規追加**も差分として tampering 扱いにする。greenfield（または baseline の `package.json` に scripts がほとんど無い状態）で最初の実装 job を回すと、実装に必要な npm scripts（`dev` / `build` / `test` 等）を追加した時点で `PACKAGE_JSON_SCRIPTS_TAMPERED` で verification が即失敗し、正当な初回実装がブロックされる問題が生じていた。

新規 script key の追加はこの gate が想定する脅威（既存検証 script の subvert）には当たらず、greenfield では必須の正当な作業である。

## 決定

### D1: 比較を「全体一致」から「baseline 各 key の per-key 判定」へ変更する

`checkPackageJsonScriptsIntegrity` の比較部を、`normalize` による丸ごと文字列比較から、baseline の各 key を走査する per-key 判定へ置き換える。

```
tampered = ∃ key ∈ baselineScripts such that
  - key が currentScripts に存在しない（削除）、または
  - currentScripts[key] !== baselineScripts[key]（値変更）
```

`currentScripts` にのみ存在する key（**追加**）は判定に含めない。該当 key が 1 つも無ければ `{ tampered: false }`。

以下の既存スキップ条件は不変で維持する。

- baseline `package.json` が base branch に不在（`git show` 非 0）→ `{ tampered: false }` でスキップ
- worktree に `package.json` が不在 → `{ tampered: false }` でスキップ
- JSON パース失敗 → `{ tampered: false }` でスキップ（build phase が拾う）

削除検出では `in` 演算子ではなく `Object.prototype.hasOwnProperty.call(currentScripts, key)` で own property を判定し、prototype プロパティ名（`toString` / `constructor` 等）との衝突による誤検出を防ぐ。

### D2: 脅威モデルを「既存の検証 script の subvert 防止」に明示的に限定する

gate の責務を「baseline に存在する検証 script の値変更・削除の防止」に限定する。新規 script の追加は greenfield / incremental 実装の正当な作業であり、その**内容の妥当性**（vacuous な `"test": "exit 0"` 等）は code-review が担保する。本 gate は追加内容を検証しない。

### D3: 失敗 diff は変更/削除された key のみを示す

tampering 検出時の diff メッセージを、tampering に当たる key（値変更・削除された baseline key）のみを対象に構築する。追加のみの場合は `tampered: false` を返すため diff は表示しない。表示は既存の `Baseline scripts:` / `Current scripts:` ラベル構造を維持し、その中身を該当 key に絞る。

## 検討した代替案

### Alternative 1: baseline scripts が空のときだけ全追加を許容する

- **Pros**: 実装が単純。greenfield（baseline に scripts が無い）での初回実装ブロックを解消できる。
- **Cons**: baseline に既存 script が 1 つでもある incremental な追加ケース（初回以降の実装で新 script を足す）を取りこぼす。baseline が空かどうかの分岐が追加され、判定ロジックが二経路になる。
- **Why not**: per-key 判定は baseline 空・非空いずれでも「baseline key の値変更・削除のみを捕捉し追加は素通し」という同じロジックで動作する。この代替案は問題の部分集合しか解決しない。

### Alternative 2: config で allowlist / gate 無効化スイッチを導入する

- **Pros**: プロジェクトごとの柔軟な調整が可能。gate を完全に無効化したいケースに対応できる。
- **Cons**: config 面が増え、脅威モデルが曖昧になる。「どの key は追加可能か」を明示的に列挙する allowlist は管理コストが高い。gate 自体を無効化できると、tampering 防御が実質的にオプトインになり安全側に倒れない。
- **Why not**: gate は既定で有効なまま per-key 判定にするのが最小かつ安全な変更である。config 化は今回の問題（追加の誤検知）を解決しつつ既存防御を維持するという要件を超えている。

### Alternative 3: 追加された script の内容を静的パターンで検査する

- **Pros**: baseline に無い script で vacuous な実装（`"test": "exit 0"` 等）が追加されるケースを本 gate で防御できる可能性がある。
- **Cons**: 静的なパターンマッチで vacuous かどうかを正確に判定するのは困難。gate の責務が「既存 script の subvert 防止」から「追加 script の内容妥当性検証」まで拡大し、責務肥大を招く。内容検査基準の維持コストが高い。
- **Why not**: 追加 script の内容妥当性は意味的レビュー（code-review）の領域であり、本 gate の責務外である（D2）。code-review（#739 #5 silent-skip 偽 pass）に委ねることで責務境界を明確に保てる。

## 影響

- baseline に存在しない script key を追加しても `PACKAGE_JSON_SCRIPTS_TAMPERED` にならず、verification が phase 実行へ進む（baseline scripts 空・非空の両ケース）
- baseline に存在する script key の値変更・削除は従来通り `tampered: true` で検知される
- baseline `package.json` が base branch に不在のときは従来通りスキップ
- 本 gate は phase fallback path（`runVerificationPhases`）専用であり、`verification.commands` path には影響しない
- 新規追加された script の内容妥当性は本 gate の責務外となり、code-review に委任する（明示的な責務境界の確立）

## 参照

- Request: `specrunner/changes/pkg-scripts-additions-allowed/request.md`
- Design: `specrunner/changes/pkg-scripts-additions-allowed/design.md`
- Spec: `specrunner/changes/pkg-scripts-additions-allowed/spec.md`
- Implementation: `src/core/verification/runner.ts`
- Tests: `tests/unit/core/verification/runner-integrity.test.ts`
