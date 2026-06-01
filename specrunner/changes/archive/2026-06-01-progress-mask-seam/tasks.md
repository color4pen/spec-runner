# Tasks: progress.ts の出力を mask seam 経由にし B-7 を cli へ拡張する

## T-01: progress.ts の全 process.stderr.write を maskSensitive wrap する

- [x] `src/cli/progress.ts` に `import { maskSensitive } from "../logger/stdout.js";` を追加する
- [x] 全 16 箇所の `process.stderr.write(...)` の引数を `maskSensitive(...)` でラップする
  - pure ANSI 制御（`"\r\x1b[K"` 等）も含め、全箇所を一律ラップする（design D3: identity 関数として振る舞うため例外分岐不要）
- [x] 出力内容が変わらないことを確認する（maskSensitive は非 secret 文字列に対して identity）

**Acceptance Criteria**:
- `src/cli/progress.ts` 内の全 `process.stderr.write` 呼び出しの引数が `maskSensitive(...)` でラップされている
- `bun run build && bun run typecheck` が green

## T-02: B-7 test の scan scope を src/cli/ に拡張する

- [x] `tests/unit/architecture/core-invariants.test.ts` の B-7 describe block を更新する
  - test 名を scope 拡張を反映した名前に更新する（例: `"B-7: core/ and cli/ must not write to process.stdout/stderr directly"`）
  - `src/cli/` に対しても `grepE` を実行し、結果を `src/core/` の結果とマージする
  - `__tests__/` を含む行は既存通り除外する
- [x] `maskSensitive` seam exemption を追加する: `m.content.includes("maskSensitive")` を含む行を候補から除外する（design D2: B-6 の `stripSecrets` exemption と同構造）
- [x] docstring を更新し、cli/ 拡張と seam exemption の説明を追加する

**Acceptance Criteria**:
- B-7 test が `src/core/` と `src/cli/` の両方を走査する
- `maskSensitive` を含む行が seam 準拠として除外される
- `bun run test` が green（T-01 の maskSensitive wrap が適用済みであること前提）

## T-03: cli/ の B-7 違反を grep で再確認し allowlist を更新する（該当があれば）

- [x] 実装前に `grep -rEn 'process\.(stdout|stderr)\.write\s*\(' src/cli/` を実行し、progress.ts 以外の違反を確認する
- [x] 違反が存在する場合: `tests/unit/architecture/arch-allowlist.ts` に B-7 entry を追加して凍結する（request 要件 #3: grep authoritative）
- [x] 違反が存在しない場合: allowlist 変更なし（設計時点の grep では progress.ts のみ）

**Acceptance Criteria**:
- `src/cli/` の全 `process.(stdout|stderr).write` 呼び出しが maskSensitive wrap 済み、または allowlist に記録済み
- `bun run test` が green

## T-04: 全体 verification

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が全て green であることを確認する

**Acceptance Criteria**:
- プロジェクト標準 verification が green
- 進捗表示の見た目（ANSI 制御含む）が不変であること（maskSensitive は非 secret 入力に対して identity）
