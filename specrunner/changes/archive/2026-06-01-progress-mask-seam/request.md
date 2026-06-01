# progress.ts の出力を mask seam 経由にし B-7 を cli へ拡張する

## Meta

- **type**: refactoring
- **slug**: progress-mask-seam
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

B-7（stdout / stderr / log への出力は `maskSensitive` seam〔`logger/stdout`〕経由。seam の外で raw `process.stdout/stderr.write` を呼ばない。ANSI 制御は例外）は full ratchet で **core/ には enforce 済みだが、`cli/` は scan 対象外**（ratchet は core scoped）。

その結果、`src/cli/progress.ts` が **raw `process.stderr.write` で mask seam を bypass** している（`model.md` §5 の「B-7 cli gap」）。`p.reason`（error 文字列）等に secret が生で乗る tail risk がある。

## 要件

1. `cli/progress.ts` の raw `process.stderr.write`（16 箇所程度）を **logger の mask seam（`maskSensitive` 経由の logger 関数、または mask でラップ）に統一**する。**例外は ANSI 制御コード（`\r` `\x1b[K` 等）の*制御文字そのもの*に限る** —— 行内のコンテンツ（step 名・elapsed・ツール名等）は `maskSensitive` を通す（制御＝例外、コンテンツ＝mask 対象。既存 B-7 と同じ扱い）。
2. **B-7 enforcement を `cli/` にも広げる**: `core-invariants.test.ts` の B-7 scan の対象に `src/cli/` を追加する。
3. cli/ に progress.ts 以外の B-7 違反が grep で検出されたら、**全件 allowlist に凍結**（grep authoritative。私の列挙に依存しない）。

## スコープ外

- 他 invariant（B-3 / B-8 / single-mutator）。
- `cli/` 以外（adapter 等）への B-7 拡張は別 change。
- **振る舞い変更**（出力内容は同じ。mask seam を通すだけ。ANSI 制御は維持）。

## 受け入れ基準

- [ ] `src/cli/` に mask seam の外の raw `process.(stdout|stderr).write` が無い（ANSI 制御除く。残る場合は allowlist 済み）—— B-7 が cli/ を覆って green
- [ ] `progress.ts` の出力が `maskSensitive` を通る
- [ ] 進捗表示の見た目（ANSI 制御含む）が不変
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **B-7 を core scoped → cli へ拡張**: 出力経路の secret 漏れ tail risk（progress の reason/error 文字列）を塞ぐ。
- **grep authoritative**: cli/ の B-7 違反は scan で全件確定し allowlist 化（#482/#483 の教訓。私の列挙に依存しない）。
- **ANSI 制御は値でない**: mask の例外として明示（既存 B-7 と整合）。
