# Spec Review Result

- **verdict**: approved

## Summary

セキュリティ上の脆弱性（symlink dereference による任意ファイルの PR への混入）を正確に特定し、適切な設計で対処している。spec・design・tasks の一貫性が高く、実装に進んで問題ない。

## Findings

### ✅ 脅威モデルが正確

`fs.cp` のデフォルトが symlink を follow することを起点に、draft ディレクトリに symlink を置くと機密ファイルが change folder → PR に流出するという経路を正確に説明している。

### ✅ `fs.cp` の全呼び出し箇所を網羅

`src/` 内の `fs.cp` は grep でも 3 箇所のみ（`local.ts:221`, `managed.ts:109`, `copy-artifacts.ts:55`）と確認済み。スコープ外に設定されたテストファイル（`draft-move.test.ts:42`）も妥当な除外理由がある。

### ✅ `dereference: false` より reject を選んだ根拠が明確

symlink をそのままコピーすると change folder に壊れた symlink が混入し後続処理が問題を引き起こす。reject が正しい選択。

### ✅ try/catch 外への配置が正しく設計されている

`copyDraftUsageToChangeFolder` の既存 catch が「全例外を silent no-op」として扱う点を踏まえ、`rejectSymlink` を外側に配置する判断（D4）は正確。tasks.md の Notes にも明記されている。

### ✅ ENOENT のパススルーが適切

usage.json が存在しない場合は正常ケースなので、`rejectSymlink` が ENOENT を無視して後続の `fs.cp` に委ねる設計は正しい。

### ℹ️ TOCTOU 競合（許容範囲）

`lstat` → `fs.cp` の間に symlink が差し替えられる TOCTOU 競合は原理上存在する。ただし本ツールはシングルユーザーのローカル CLI であり、現実的なリスクは低い。完全に排除したければ `O_NOFOLLOW` 相当が必要だが、Node.js/Bun の `fs` API では直接サポートがなく、現在のリスクレベルに対して過剰な対策になる。spec に明示的な記載はないが、設計判断として許容範囲内と判断する。

### ℹ️ `rejectSymlink` の export が必要な理由の自明性

tasks.md で「local.ts / managed.ts が `rejectSymlink` を import するため export が必要」と説明されているが、design.md の D2 では「残り 2 箇所も `copyDraftUsageToChangeFolder` を import しているファイルなので同じモジュールから export するのが自然」と補足している。一貫しており問題なし。
