# README Quick Start を無人ループ中心に再構成

## Meta

- **type**: chore
- **slug**: readme-unattended-quickstart
- **base-branch**: main
- **pipeline**: fast
- **adr**: false

## 背景

現状の README Quick Start（`README.md:5-22`）は attended フロー（`request new` → `run` → `job archive`）を第一に見せている。spec-runner の一次ストーリーは無人ループ（issue 起票 → 承認ラベル → tick → PR → escalation は issue コメント → `/resume`）であり、Quick Start の重心をそこへ移す。無人ループの機構（inbox / tick / resume）と詳細は既存（README「Automation with GitHub Issues」節、`docs/operations.md`）。本 request は README の導線再構成のみで、機構は変更しない。

## 現状コードの前提

- `README.md:5-22` の Quick Start は attended フロー中心（`request new` / `run` / `job archive --with-merge`）。
- `README.md:101` 付近「Automation with GitHub Issues」に issue ベース自動化の記述が既にある。
- 無人運用の詳細は `docs/operations.md`（認証3層 / crontab / issue ジェスチャー / GitHub Actions / inbox 挙動）。
- 承認ラベル既定は `specrunner-approved`（inbox が発火条件に使う）。

## 要件

1. README.md の Quick Start を、無人ループを第一に見せる構成へ再構成する。最短導線として「issue 起票 → 承認ラベル付与 → tick（`inbox run`）で発火 → PR → escalation は issue コメント → `/resume`」を提示する。
2. attended フロー（drafts に request.md を置いて `run` → `job archive`）は代替パスとして残す（削除しない。無人ループの後段か別小節に置く）。
3. スケジューラ（crontab / GitHub Actions）の設定詳細は `docs/operations.md` へリンクする（Quick Start には最小の起動例のみ）。

**最重量部の名指し**: 情報の追加でなく「導線の順序」を変えること — 最初に読む人が無人ループを一次経路と認識する構成にする。

## スコープ外

- inbox / tick / resume の機構変更。docs の再配置のみ。
- `docs/operations.md` の書き換え（本 request は README のみ）。
- 新規コマンド・フラグの追加。

## 受け入れ基準

- [ ] README.md の Quick Start が無人ループ（issue → 承認ラベル → tick → PR → issue コメント → `/resume`）を第一に提示する。
- [ ] attended フローが代替として残っている（削除されていない）。
- [ ] スケジューラ詳細は `docs/operations.md` へのリンクで参照される。
- [ ] `typecheck && test` が green（既存テスト無変更）。

## architect 評価済みの設計判断

- attended フローを削除する案は却下。小規模・単発利用では attended が有効なので代替として残す。
- 無人ループの詳細手順を全部 Quick Start に展開する案は却下。Quick Start は最短導線に留め、詳細は `docs/operations.md` に委ねる（各事実は一箇所）。
