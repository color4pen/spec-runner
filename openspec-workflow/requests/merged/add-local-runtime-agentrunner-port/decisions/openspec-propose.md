# openspec-propose 判断ログ

AgentRunner port 単一メソッド `run()` を採用する :: managed の lifecycle と local の `query()` 一発呼び出しを揃えるには、phase 別 method 分割よりも単一 facade method の方が両 runtime で自然。phase 分割案では local 側に no-op method が並ぶため Liskov 違反気味になる。

ResultReader port を別途切らず AgentRunner が `resultContent` を返す :: result 取得手段は session protocol（managed: GitHub API、local: fs.readFile）と密結合。port を分けると StepExecutor が AgentRunner と ResultReader の 2 つを呼び分ける必要があり、結局 runtime 分岐が core に漏れる。

register_branch を managed-agent adapter 内に閉じ込める（core から完全撤去）:: register_branch は Managed Agents の SSE protocol（custom_tool_use event → handler → custom_tool_result）に固有の機構。local runtime には存在しない概念。core に残すと runtime 分岐が漏れる。

branch を CLI が `feat/<slug>` で決定論的に算出して prompt に注入する :: PR #42 の slug single-source-of-truth の延長。agent が register_branch で「自分の作った branch を教える」モデルから「CLI が決めて agent に渡す」モデルへ転換することで、両 runtime で branch 経路が均質化する。

agent からの register_branch 申告値で CLI canonical branch を上書きしない :: 申告値は agent の hallucination や branch 名typo のリスクがある。CLI 値を canonical に保ちつつ不一致時に warning を出す方が「verify don't trust」原則に整合する。

verifyPath / verifyBranch を AgentRunner adapter 内に吸収する :: 検証実体（GitHub API or fs / git）が runtime 依存。core に置くと runtime 分岐が漏れる。AgentRunner.run() の責務終端に「実体検証」を含めるのが hexagonal-lite と整合する。

adapter rename（anthropic/ → managed-agent/）を本 change に同梱する :: SDK ベンダー名（Anthropic）は claude-code adapter も同社製のため intent が曖昧。runtime model 名にすることで `module-boundary` の意図が明示される。git mv で履歴維持。

config に `runtime: "managed" | "local"` を top-level field として追加する（agents の sub-key にしない）:: agents は per-step の Anthropic Agent ID マップであり、runtime 選択とは責務が異なる。top-level に置くことで「config 全体の実行モード」を一目で把握できる。

未設定 runtime field を `"managed"` に正規化する（破壊的変更を避ける）:: 既存 config に runtime field が無い場合に load fail させると後方互換性を破壊する。in-memory migration + save 時に書き戻す ConfigStore の既存パターン（agent → agents migration）を踏襲する。

`specrunner init --runtime local` で API 呼び出しゼロを保証する :: local runtime の主動機の 1 つは「API key なしで動く」ことであり、init で API を叩くと自己矛盾する。AgentSyncer skip + apiKey 入力 prompt skip を init 経路の責務として明示する。

prompts/ を runtime-neutral に保ち、git 操作 instruction は adapter が `additionalInstructions` で append する :: prompt は「何をするか」（仕様レベル）を述べ、「どう環境を操作するか」（実行レベル）は runtime 依存。両者を分離することで prompts/ の単一管理性を保つ。

Phase 1-4 で段階的リリースする（spec は 1 つの delta としてまとめる）:: refactor + 2 新 adapter + config schema + rename + 6 spec MODIFIED を 1 PR で投入するとレビュー困難。Phase 単位で revert 可能性を確保する一方、spec を Phase 単位で分割するのは management overhead が高すぎるため tasks.md の sequence で Phase を表現する。

`step-execution-architecture` の MODIFIED Requirement header を完全一致で踏襲する :: Review Standards の delta spec format rule（MODIFIED 配下の Requirement header は main spec の現状 header と完全一致）に従い、`StepExecutor Manages Lifecycle and Emits Events` および `Custom Tool Spec and Handler Co-located With Step` の 2 つを header 変更なしで body のみ MODIFIED した。RENAMED は不要。

`module-boundary` の Source Layout 表を MODIFIED で更新する :: anthropic/ → managed-agent/ rename、claude-code/ 新設、AgentRunner port の追加が boundary 表の正本に該当するため、ADDED ではなく MODIFIED として書く。Dependency Direction Rules にも sibling adapter の cross-import 禁止を追加。

local runtime の DB 影響範囲（branch-registration の DB persistence など）は本 change scope 外として ADDED で gating のみ宣言する :: requests テーブル / RequestSummary / getRequestDetail の影響は backend / UI 層の話であり、本 change（CLI runtime 抽象化）の責務範囲を超える。「local では DB 更新が発生しない」という gating だけ仕様化して、その先の影響整理は別 request に委ねる。
