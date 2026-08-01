# verification に lockfile 整合 gate を追加 — 依存追加が CI の frozen-lockfile まで素通りする穴を塞ぐ

## Meta

- **type**: spec-change
- **slug**: lockfile-sync-verification-gate
- **base-branch**: main
- **adr**: false

## 背景

implementer が package.json に依存を追加した際、lockfile（bun.lock / package-lock.json 等）を同期しないことがある。pipeline 内の verification は worktree 生成時に install 済みの node_modules で走るため緑になり、不整合は **CI（frozen-lockfile install）まで顕在化しない**（issue #935）。PR が merge 直前で fail し、手動で lockfile を作り直す羽目になる。

既存の frozen-lockfile 安全網は `postMergeVerify`（archive --with-merge 後に base branch で実行）のみで、検出時点が merge 後＝手遅れである。verification 内に lockfile 整合の機械検査を置き、発生源（implementer の commit 直後）で決定的に検出する。

検査は **diff 形状検査**とする: branch の変更集合に package.json があり、その依存関連セクションが base と異なるのに lockfile が変更されていなければ fail。frozen-lockfile install の実実行は採らない（重い・node_modules を書き換える・network 依存）。あわせて implementer prompt に lockfile 同期を明記し、halt の発生自体を減らす。

## 現状コードの前提

- `src/prompts/implementer-system.ts:11-74` / `src/core/step/implementer.ts:57-124` — implementer の system / user prompt に依存追加・lockfile 同期の指示は無い
- `src/core/verification/runner.ts:323-343` — `runVerification` は commands 経路（`verification.commands` 定義時）と phase フォールバック経路の 2 本
- `src/core/verification/runner.ts:384-409` / `:585-610` — changed-line-coverage gate は**両経路の後段**から呼ばれる（新 gate の位置の前例）。対照的に package-json-integrity（`:459-485`）は phase 経路のみで commands 経路に漏れがある
- `src/util/detect-pm.ts:25-31` — `LOCKFILE_MAP`: pnpm-lock.yaml / bun.lockb / bun.lock / yarn.lock / package-lock.json。`detectPackageManager(cwd)` が pm と root を返す既存 seam
- `src/core/verification/changed-lines.ts:125` — `getChangedFilesAndLines`（base...HEAD の変更 file 集合）。`src/core/port/runtime-strategy.ts:479` — `listChangedFiles`。いずれも既存 seam
- `src/config/schema/types.ts:375` — `postMergeVerify`（merge 後検査）に `bun install --frozen-lockfile` を置く運用が既存。verification 内に lockfile 整合検査は存在しない
- `src/core/verification/__tests__/runner-integrity.test.ts` — 機械検査の最も近いテスト雛形

## 要件

1. **lockfile 整合 gate の追加**。verification の後段（changed-line-coverage gate と同じ、**commands / phase 両経路**から呼ばれる位置）に新モジュールの機械検査を追加する: base...HEAD の変更 file 集合に package.json（workspace 配下の package.json を含む）があり、base 版と HEAD 版で**依存関連セクション**（dependencies / devDependencies / peerDependencies / optionalDependencies / overrides / resolutions / packageManager）の内容が異なる場合、同変更集合に lockfile（`LOCKFILE_MAP` の対象ファイル）が 1 つも含まれなければ当該 phase を fail にする。メッセージには検出した package manager の同期手順（`<pm> install` を実行して lockfile を commit する）を案内する
2. **偽陽性を作らない**。依存関連セクションに差が無い package.json 変更（scripts / version 等のみ）は fail しない
3. **検査対象外の明確化**。repo が lockfile を追跡しない場合（base にも HEAD にも `LOCKFILE_MAP` 対象が存在しない）は skip。diff が導出できない場合（`unavailable` 等）は fail させず、検査不能である旨を phase 結果に明示する（黙って pass 扱いにしない）
4. **implementer prompt への同期指示**。implementer の手順（user message）に「依存を追加・変更した場合は lockfile を同期してから完了する」を明記する
5. **既存 seam の再利用**。package manager 検出は detect-pm、diff は listChangedFiles / getChangedFilesAndLines 系を使う。新規 runtime 依存を追加しない

## スコープ外

- frozen-lockfile install の gate 内実実行（重い・node_modules 書き換え・network 依存のため却下）
- `postMergeVerify` の変更（merge 後の安全網はそのまま）
- JS 以外のエコシステム（Cargo.lock / go.sum 等）の lockfile 検査
- build-fixer / code-fixer prompt への同種指示の追加（機械 gate が branch 全体 diff を見るため全 step の混入を検出できる）

## 受け入れ基準

- [ ] **シナリオ歯（#935 実例の再現）**: 「package.json の dependencies に追加あり + lockfile 変更なし → gate が fail し、メッセージに package manager の同期手順が含まれる」をテストで固定する
- [ ] 依存追加 + lockfile 変更あり → pass、をテストで固定する
- [ ] scripts / version のみの package.json 変更 → pass、をテストで固定する
- [ ] lockfile 非追跡 repo → skip、diff unavailable → fail せず検査不能を明示、をテストで固定する
- [ ] workspace 配下 package.json の依存変更でも検出されることをテストで固定する
- [ ] commands 経路・phase 経路の**両方**で gate が呼ばれることをテストで固定する
- [ ] implementer prompt に lockfile 同期指示が含まれることをテストで固定する
- [ ] 新規 runtime 依存が package.json に追加されていない
- [ ] 既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: diff 形状検査（軽量・package manager 非依存・決定的・network 不要）。依存関連セクションの deep 比較で scripts 等の無害変更を除外し偽陽性を避ける
- **採用**: 位置は changed-line-coverage gate と同型の「両経路後段」。package-json-integrity（phase 経路のみ）を雛形にすると commands 経路（実運用の多数派）で漏れる
- **採用**: unavailable は明示 note（silent pass にしない）。fail-closed に倒すと managed 等 diff 非導出環境で全 run が止まるため、fail はさせず可視化に留める
- **採用**: prompt 指示（要件 4）と機械 gate（要件 1）の二層。prompt は halt の発生頻度を下げ、gate が漏れを決定的に止める
- **却下**: prompt 指示のみ — agent の遵守頼みで再発する。歯は機械検査
- **却下**: frozen-lockfile install の実実行 — 検出能力は最強だが、重く destructive で verification の性格（読み取り検査）に合わない。postMergeVerify（merge 後）に既存であり、発生源検出は diff 形状で足りる
- **却下**: fail の代わりに warning — CI fail という実害が既に出ているクラスであり、pipeline 内で build-fixer に routing される fail が正しい（fail は verification 失敗 → build-fixer の既存リトライ経路に乗る）
