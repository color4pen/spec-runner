# 実行中の local job で OS のアイドルスリープを抑止する（self-caffeinate、#758）

## Meta

- **type**: new-feature
- **slug**: job-power-assertion
- **base-branch**: main
- **adr**: true

## 背景

長時間 job を local runtime で無人実行しているとき、マシンが OS のアイドルスリープに入るとプロセスが停止しうる（issue #758）。job が実際に走っている間だけ電源アサーション（macOS の `caffeinate` 等）でアイドルスリープを抑止し、job が終わったら解放したい。無人ループ（issue → 承認 → tick → PR）を一次ストーリーとする本プロダクトにとって、実行中のスリープ耐性は運用の信頼性に直結する。

本 feature は「実行中の local job にスリープ抑止を掛け、終了時に解放する」ことに閉じる。ネットワーク kill・親プロセス kill・端末切断など OS アイドルスリープ以外の停止要因は対象外。

## 現状コードの前提

- `src/core/runtime/local.ts` — `registerCleanup()`（前後 925-1002 付近）が job 実行の cleanup handle を組み、`process.on("SIGINT"/"SIGTERM", signalCleanup)` を 991-992 で登録する。`teardown(handle, finalStatus)`（1004-）が 1008-1009 で signal handler を解除する。**この registerCleanup〜teardown の区間が「job が走っている間」**であり、電源アサーションの acquire / release を掛ける自然な境界
- `CleanupHandle` の internals（`getInternals`）は `signalCleanup` / `cleanupWorktreeOnFailure` を保持する。ここに release 用ハンドルを追加できる
- `src/util/spawn.ts` — `spawnCommand(cmd, args, opts)` は **close で resolve する await 型**（stdout/stderr を集めて返す短命コマンド用）。`caffeinate` のような job 全期間生存する常駐プロセスには使えず、kill 用の child handle も露出しない。`node:child_process` の直接 import は本 seam に封じ込められている（B-12）
- 電源アサーション用の常駐プロセスを起動する経路が現状存在しない。B-6（env は stripSecrets 経由）・B-12（child_process は seam 限定）を満たす形で追加する必要がある
- managed runtime（`src/core/runtime/managed.ts`）は GitHub-hosted の短命実行で、アイドルスリープの概念が無い

## 要件

1. local runtime で job が実行状態にある間（registerCleanup で確立〜teardown で解放）、OS のアイドルスリープを抑止する電源アサーションを保持する
2. 電源アサーションは job 終了時（success / error / signal のいずれの teardown 経路でも）に解放する。無人 inbox daemon が次 tick を待つアイドル時間中はアサーションを保持しない（＝ job 実行中のみ抑止）
3. **fail-open**: 電源アサーション機構が使えない環境（対象外プラットフォーム、`caffeinate` 不在＝ENOENT 等）では警告に留め、job は通常どおり続行する。抑止できないことが job を止めてはならない
4. **seam 準拠**: 常駐プロセスの spawn は `node:child_process` を直接 import せず、`util/spawn.ts` の seam 経由で行う（B-12 準拠）。env は stripSecrets 経由（B-6 準拠）
5. **orphan を残さない**: teardown で明示的に解放するのに加え、抑止プロセスが親プロセス（CLI）の終了に追随して自動終了する構成にし、teardown を経ない停止でも常駐プロセスが残らないようにする
6. 抑止の acquire / release が job lifecycle に正しく掛かること、fail-open 経路、seam 経由であることをテストで固定する（spawn を注入して観測する）
7. managed runtime は挙動不変

## スコープ外

- OS アイドルスリープ以外の停止要因（ネットワーク kill / 親 kill / 端末切断 / SIGHUP）への対処
- macOS 以外のプラットフォームでの実抑止実装（Linux の `systemd-inhibit` 等）。対象外プラットフォームは fail-open の no-op とし、将来拡張の余地を残す
- managed runtime へのスリープ抑止
- awaiting-resume / idle 状態でのスリープ抑止（要件 2 のとおり実行中のみ）
- interruption record へのシグナル名記録（#764）

## 受け入れ基準

- [ ] job 実行開始で電源アサーションが acquire され、teardown（success / error / signal 経路）で release されることをテストで固定する（spawn を注入して acquire/release の呼び出しを観測）
- [ ] 対象外プラットフォーム・`caffeinate` 不在（ENOENT 相当）で job が通常どおり完走する（fail-open）ことをテストで固定する
- [ ] 抑止プロセスの spawn が `util/spawn.ts` の seam 経由であること（`node:child_process` の直接 import が新規に増えない＝ B-12 の歯が green のまま）
- [ ] managed runtime の既存テストが無変更で green
- [ ] `typecheck && test` が green

## 設計の方向（request 作成者の推奨・design step で確定する）

- **推奨（要件4・5）**: `util/spawn.ts` に**常駐プロセス用の seam 関数**を追加する（例: 起動して kill 可能なハンドルを返す `spawnBackground` 相当）。B-12 の意図は「spawn を seam に封じ込める」ことであり、電源アサーション用に別モジュールで `child_process` を直接 import して allowlist を増やす（削除のみで縮む ratchet に逆行）より、seam を拡張する方が筋が良い
- **推奨（macOS 実装）**: `caffeinate -i -w <親pid>` を seam 経由で起動する。`-i` がアイドルスリープ抑止、`-w <pid>` が親プロセス終了時の自動終了（要件5 の orphan 防止 backstop）。teardown で明示 kill しつつ、`-w` で二重に orphan を防ぐ
- **推奨（プラットフォーム）**: `process.platform === "darwin"` のみ実抑止。それ以外は no-op fail-open。実装位置（power-assertion helper を `core/runtime/` 配下に置く等）は design 判断
- **不採用**: `spawnCommand` をそのまま流用 — close で resolve する await 型で、常駐プロセスの起動〜継続に使えない
- **不採用**: 電源アサーション専用モジュールで `child_process` を直接 import し B-12 allowlist に追加 — seam 拡張で足りるため allowlist を増やさない
