# archive-openspec.ts の `--skip-specs` 自動判定を openspec nested convention に合わせる

## Meta

- **slug**: archive-skip-specs-nested-detect
- **type**: spec-change
- **date**: 2026-05-03
- **author**: color4pen
- **related**: GitHub issue #65, PR #64 (drift 露出), PR #66 (drift recovery)

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

`src/core/finish/archive-openspec.ts` の `--skip-specs` auto-detect は **flat `.md` 検出** で実装されているが、openspec の delta spec convention は **nested (`specs/<spec-name>/spec.md`)**。`fs.readdir(specsPath)` の immediate children に `.md` で終わるエントリがあるかで判定しているため、nested 構造では children が directory 名のみになり常に `hasSpecFiles=false` → `--skip-specs` 誤付与 → delta が base spec に反映されない drift が systemic に発生する。

これは bug ではなく **spec の改定が必要な change**。`openspec/specs/cli-finish-command/spec.md` の archive Requirement の Scenario が flat 検出を WHEN に書いており、code は spec 通りに動作している。spec 自体が openspec convention とズレている。

PR #64（specrunner-dir-rename）が最初の `specrunner finish` 実行で drift を露出させ、PR #66 で retroactive に手動 drift recovery 済み。今後 `specrunner finish` 経由で archive する全 change が同じ問題を踏むため、優先度は中〜高。過去の dogfood は openspec-workflow plugin（2-PR モデル）経由で archive されていたため、この問題の影響を受けていない。

## 目的

`specrunner finish` の archive 操作において、openspec の nested delta spec convention（`specs/<spec-name>/spec.md`）を正しく検出し、delta が存在する場合は `--skip-specs` を付与せずに base spec へ反映されるようにする。spec / 実装 / test を同時に整合させる。

## 要件

1. **spec 改定** — `openspec/specs/cli-finish-command/spec.md` の archive Requirement の検出規則を nested convention 前提に変更する。
   - `delta spec ありで archive` Scenario の WHEN を `openspec/changes/<slug>/specs/<spec-name>/spec.md` が 1 つ以上存在する条件に書き直す。
   - `delta spec 無しで archive`（`--skip-specs` 付与）の Scenario も対応する nested 不在条件に揃える。
   - flat fallback を残す場合、その挙動も Requirement に明記する（残さない場合はその旨を明記）。

2. **実装変更** — `src/core/finish/archive-openspec.ts` の auto-detect を nested 検出に変更する。
   - `specs/` 配下の immediate children のうち directory のものを列挙し、各 directory 内に `spec.md` が存在するかを判定する。1 つでも存在すれば `hasSpecFiles=true`。
   - flat fallback は spec の決定に従う（残す場合は immediate `.md` 検出も併用）。
   - 失敗時のエラー種別・終了コード・stdout / stderr 出力は既存挙動を変えない（後方互換）。

3. **test 更新** — `tests/finish-archive-openspec.test.ts` の TC-024 / TC-025 fixture を nested 構造に書き換え、追加 TC を入れる。
   - 「nested layout (`specs/<name>/spec.md`) で `--skip-specs` 無し archive」の TC を追加。
   - 「flat layout (`specs/*.md`) で fallback 動作」の TC を追加（fallback を残す場合）または「flat layout は検出されない」TC（残さない場合）。
   - 既存の `--skip-specs` 付与 TC は `specs/` 不在 / 空 directory のケースに整理する。

4. **ADR** — 検出ロジックを nested convention に合わせる判断と、flat fallback を残す / 残さない理由を ADR に残す。

## 受け入れ基準

- [ ] `openspec/specs/cli-finish-command/spec.md` の archive Requirement の Scenario が nested convention 前提に更新されている
- [ ] `src/core/finish/archive-openspec.ts` の auto-detect が `specs/<spec-name>/spec.md` を検出する
- [ ] `tests/finish-archive-openspec.test.ts` の TC-024 / TC-025 が nested fixture で pass する
- [ ] nested layout で `--skip-specs` が付与されず archive される TC が追加されている
- [ ] flat fallback の取り扱いが TC でカバーされている（残す場合は fallback 動作、残さない場合は flat layout が検出されないことを assert）
- [ ] `bun run typecheck` / `bun run lint` / `bun test` が全 pass
- [ ] ADR が `openspec-workflow/adr/` 配下に追加されている
- [ ] PR #66 の手動 drift recovery と同じ不整合が今後発生しないことが、E2E（実際に nested delta を持つ change を `specrunner finish` で archive した場合に `--skip-specs` が付与されない）で確認できる

## 補足

- 過去 archive の retrospective drift recovery（PR #66 で対応した範囲以外に未検出の drift があるか）は **本 request のスコープ外**。必要なら別 issue / change として起票する。
- `openspec-workflow` plugin 経由の旧 archive は `--skip-specs` を付けない archive だったため drift を起こしていない。本 change はあくまで `specrunner finish` の archive ロジックの問題に閉じる。
- Requirement の文言変更は base spec を直接書き換えず、delta spec として `openspec/changes/archive-skip-specs-nested-detect/specs/cli-finish-command/spec.md` に MODIFIED Requirement で記述する（self-referential: 本 request 自体が nested delta を生成し、本 change の archive 時に新ロジックの初の自己検証になる）。
