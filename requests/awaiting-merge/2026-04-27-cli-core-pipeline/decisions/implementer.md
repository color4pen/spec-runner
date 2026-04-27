# Implementer Decisions

## 2026-04-27

- vitest を devDependency として追加する :: bun test は bun:* API を内包するリスクがあり、constraints.md で bun:* 禁止のため vitest を選択する
- tsconfig.json の rootDir を "." に変更する :: tests/ ディレクトリがルート配下に来るため rootDir を src/ 限定にできない
- moduleResolution を "Bundler" にする :: tasks.md 1.2 の指定通り。Node20 での ESM 解決との互換性を持たせる
- src/util/atomic-write.ts を共通ヘルパーとして抽出する :: module-analysis R1 の通り config/store.ts と state/store.ts の両方で使うため
- src/util/xdg.ts を共通ヘルパーとして抽出する :: module-analysis R2 の通り XDG_CONFIG_HOME / XDG_DATA_HOME を 2 箇所で解決するのを防ぐ
- isProposeComplete 述語を completion.ts に 1 関数として置く :: module-analysis S3 の通り SSE loop と poll loop が同じ判定ロジックを使う
- core/preflight.ts を作成し fail-fast バリデーションを集約する :: module-analysis S5 推奨に従う。cli/run.ts の責務を薄く保つ
- state/store.ts では pure transform (appendHistoryEntry) と I/O (persistJobState) を分離する :: module-analysis S2 推奨に従いテスタビリティを確保する
- GitHub Device Flow の pollAccessToken は sleepMs 関数を注入可能にする :: テストでの時間短縮のため。実装では Node setTimeout を使う
- SSE stream は AbortController で管理し、ポーリング完了時にキャンセルする :: TC-028 要件の通り
