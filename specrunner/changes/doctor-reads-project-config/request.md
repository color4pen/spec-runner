# doctor が project-local 設定を読まず designLayer / runtime チェックを誤診断する

## Meta

- **type**: bug-fix
- **slug**: doctor-reads-project-config
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`specrunner doctor` は run 系コマンドと違い project-local の `.specrunner/config.json` を読まない。そのため project-local に置かれた `designLayer` / `runtime` / `github` / `verification` の設定が診断時に一切反映されない。

最も分かりやすい症状は designLayer 連携の誤診断である。project が `.specrunner/config.json` で `designLayer.enabled: true` を設定していても、doctor の `aozu-cli` チェックは `designLayer.enabled !== true` の分岐に入り「aozu CLI not required (design layer integration disabled)」を pass として返す。結果、aozu が PATH に無い設定不備を doctor が exit 0 で素通しし、実際の run は preflight の check-gate で初めて落ちる。**doctor が本来事前に止めるべき設定不備を検出できない fail-open** である。

同じ穴で `runtime` の project-local 上書きも無視される（doctor は user-global の runtime だけで診断する）ため、症状は designLayer 単独ではなく「doctor が project 設定を読んでいない」という根の問題。

## 現状コードの前提

- `src/cli/doctor.ts:99`: `rawConfig = await loadConfig()` を **repoRoot 引数なし**で呼ぶ。
- `src/config/store.ts:94`: `loadConfig(repoRoot?)` は `if (repoRoot)` の時だけ project-local `.specrunner/config.json` を読む。repoRoot が無ければ user-global config のみを解決する。
- `src/cli/doctor.ts:163`: `config: buildDoctorConfig(rawConfig, ...)` — 全チェックが参照する `ctx.config` はこの `rawConfig` を包む。従って穴は 1 箇所（line 99）で全チェックに波及する。
- `src/core/doctor/checks/runtime/aozu-cli.ts:13-19`: `ctx.config.get("designLayer.enabled") !== true` のとき「not required (disabled)」を status `pass` で返す。project-local の `designLayer` が読まれないため常にこの分岐に落ちる。
- `src/cli/doctor.ts:177`: `runtime = rawConfig?.runtime ?? "local"` も同じ穴で project-local の runtime 上書きを無視する。
- `src/cli/load-config-with-overlay.ts:18`: 既存 helper `loadConfigWithOverlay(cwd?)` が `resolveRepoRoot(cwd)` で repoRoot を解決して `loadConfig(repoRoot)` を呼ぶ（git repo 外なら user-global に fallback）。run 系はこれを使うが doctor は使っていない。

## 要件

1. **doctor が project-local overlay を反映した config で全チェックを走らせる。** `src/cli/doctor.ts:99` の `loadConfig()` 呼び出しを既存 helper `loadConfigWithOverlay()` に置き換え、`<repoRoot>/.specrunner/config.json` の overlay を反映させる。
2. **designLayer 誤診断の解消。** project-local で `designLayer.enabled: true` のとき、`aozu-cli` チェックが「disabled で pass」ではなく実際に aozu binary の存在検証に入る（未 install なら fail、install 済みなら pass）。
3. **既存の best-effort / fallback 挙動を維持する。** git repo 外（repoRoot 解決不可）では従来通り user-global のみで動作する。config 不在 / malformed 時の現行ハンドリング（`doctor.ts` の try/catch と `configLoadError` 伝播による `config-file-exists` チェックの ENOENT vs malformed 区別）を壊さない。

## スコープ外

- doctor 以外で `loadConfig()` を repoRoot なしで呼ぶ call-site の変更（本 request は doctor の診断の穴のみ対象）。
- config スキーマ・overlay の deep-merge 規則自体の変更。
- doctor の検証項目（チェック集合）の追加・再設計。config 解決の穴を塞ぐのみ。
- malformed な project-local config 時に診断を local check set へ降格する既存挙動の再設計（現行維持。別途）。

## 受け入れ基準

- [ ] project-local `.specrunner/config.json` に `designLayer.enabled: true` を置いた状態で doctor を走らせると、`aozu-cli` チェックが「disabled」ではなく binary 検証（未 install → fail / install 済み → pass）に入ることをテストで固定する。
- [ ] project-local に `runtime` 等の上書きを置くと doctor がそれを反映することをテストで固定する（designLayer 以外にも overlay が効くことの回帰確認）。
- [ ] git repo 外（repoRoot 解決不可）では user-global のみで従来通り動作し、config 不在時の best-effort（`configLoadError` 伝播）が維持されることをテストで固定する。
- [ ] `bun run build && bun run typecheck && bun run test && bun run lint` が green。

## architect 評価済みの設計判断

**採用**

- `doctor.ts:99` の `loadConfig()` を既存の `loadConfigWithOverlay()` に置換する。repoRoot 解決を doctor に再実装せず run 系と同一 helper に寄せることで、overlay のセマンティクスを単一 source に保つ。穴は config 参照の入口 1 箇所なので、ここを直せば全チェック（designLayer / runtime / github / verification）に一括で overlay が効く。

**却下**

- doctor 内で `resolveRepoRoot` を直接呼んで `loadConfig(repoRoot)` を組む案: `loadConfigWithOverlay` と同一処理の再実装になり drift 源になる。helper 再利用が最小。
- `aozu-cli` チェック側で project config を個別に読み直す案: 症状（designLayer）だけを塞ぎ、runtime / github / verification に残る同一の穴を放置する。根（doctor の config 解決）を直すべき。
