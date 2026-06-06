# `.specrunner/jobs/` を完全撤去する

## Meta

- **type**: spec-change
- **slug**: retire-jobs-dir
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`decouple-jobs-dir-reads`（R1）・`decouple-jobs-dir-writes`（local の write 脱却）・`managed-slug-keyed-state`（managed の slug キー化）が完了すると、local / managed いずれの runtime も `.specrunner/jobs/` を読み書きしなくなる。残るのは後方互換のための死蔵コードと旧データのみ：`JobStateStore.load()` の jobs-dir fallback、`xdg.ts` の jobId-store path helper、doctor の関連チェック、既存ユーザーの旧 `.specrunner/jobs/<jobId>(.json|/)` データ。

本変更はこれらを撤去し、`.specrunner/jobs/` への依存をコードベースから完全に消す。旧データは一度だけ移行するか、doctor で警告して手動削除を促す。

前提：`decouple-jobs-dir-reads`・`decouple-jobs-dir-writes`・`managed-slug-keyed-state` が merge 済みであること。

## 要件

1. `JobStateStore.load()` の `.specrunner/jobs/` split-layout + legacy flat-file fallback を撤去する。
2. `loadStateByJobId`（step 4）と `resolveStateStoreByJobId`（step 3）の jobs-dir fallback を撤去する。sidecar 解決に失敗した場合はエラーとする。
3. `xdg.ts` の jobId-store path helper（`getJobsDir` / `getJobStatePath` / `getJobStateJsonPath` / `getJobEventsPath` / `getJobDir`）を撤去し、参照箇所を解消する。
4. doctor の関連チェック（`old-state-files` / `jobs-writable`）を撤去または slug/sidecar 起点に置換する。
5. `prompts/rules.ts` の `.specrunner/jobs/<jobId>.json` 参照を更新する。
6. 既存の旧 `.specrunner/jobs/<jobId>(.json|/)` データを、doctor で検出し手動削除を促す。
7. コードベースに `.specrunner/jobs/` への読み書き参照が残らない。

## スコープ外

- runtime 別の read/write 移行（先行 request `decouple-jobs-dir-reads` / `decouple-jobs-dir-writes` / `managed-slug-keyed-state` で完了済みの前提）

## 受け入れ基準

- [ ] `src/` に `.specrunner/jobs/` への読み書き・path helper の参照が残らない（grep で `getJobsDir` / `getJobStatePath` / `getJobStateJsonPath` / `getJobEventsPath` / `getJobDir` が定義も使用も無い）
- [ ] 旧 `.specrunner/jobs/` データが存在しても、コマンドが壊れず（migration 済み or doctor 警告で）扱える
- [ ] `job ls` / `show` / `cancel` / `resume` / `archive` が local / managed 両 runtime で正しく動く
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **撤去は両 runtime の脱却完了が前提**：local（reads/writes）と managed の両方が `.specrunner/jobs/` から外れて初めて、fallback / helper / doctor / 旧データ を安全に撤去できる。本 request は最終段に置く。
- **旧データは doctor 警告 + 手動削除**：R1〜R3 で active な jobs-dir 参照がゼロになったため、自動 migration は不要。doctor が `.specrunner/jobs/` の存在を検出して削除を促す。
