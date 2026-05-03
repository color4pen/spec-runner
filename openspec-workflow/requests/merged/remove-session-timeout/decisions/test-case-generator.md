# Decision Log — test-case-generator (remove-session-timeout)

## カバレッジ方針・Priority 判定根拠

- wall-clock timeout 撤廃の unit テストを must とする :: StepExecutor 経路に timeoutMs/AbortSignal.timeout が残ると本変更の中核目的が達成されず、runtime で SESSION_TIMEOUT が再発するため
- `validateJobState` の lazy migration を must とする :: 旧 state file を読んだ時に SESSION_TERMINATED にマップされない場合、resume が壊れるかエラーコードの型不一致で下流に影響するため
- SESSION_TIMEOUT error code の削除を must とする :: 型システムに残っていると新規コードパスで誤って参照されるリスクがあり、削除を acceptance criteria として明示されているため
- config の silently ignore を must とする :: 既存ユーザーの config が読み込み時に例外を起こすと CLI 起動失敗になり、後方互換の破壊に直結するため
- config の save 後キー非残存を should とする :: 機能的後方互換は load 時の ignore で保証されており、save の検証は保守性向上のためだが中核機能の成立条件ではないため
- 対象外 timeout（doctor / custom-tool-handler / SDK 内部）の非削除を must とする :: これらが誤って削除されると別機能が壊れる。acceptance criteria に明示されているため
- pollResult.status "timeout" 分岐の削除を must とする :: この分岐が残存すると SESSION_TIMEOUT error が依然として生成され、撤廃が不完全になるため
- `pollUntilComplete` シグネチャから timeoutMs を削除することの型チェックを should とする :: TypeScript の型システムでの保証は望ましいが、ランタイム挙動の検証で中核目的は達成できるため
- lazy migration の書き戻し（persist 後の on-disk 確認）を should とする :: 読み取り時の in-memory migration が must で、書き戻しは次回 update 時の lazy 反映であり、ファイルに書き戻されない状態でも機能は維持されるため
- 各 session 終端の出口戦略（idle+end_turn 等）の動作確認を should とする :: 出口戦略自体は本変更で改変しないため regression テストに位置づけ、must ではなく should とする
- spec validate pass をテストケースに含めない :: spec 整合性は `openspec validate` コマンドの結果で確認する運用であり、unit/integration テストの範疇外のため
- smoke test の priority を should とする :: 新規 job で SESSION_TIMEOUT が発生しないことは integration 観点で重要だが、unit テストで各削除を確認した後の補完的確認であるため
- SESSION_TIMEOUT 文字列の grep による残存ゼロ確認は manual カテゴリとする :: テストコードでなく CI grep / 手動確認が適切。自動テストには馴染まないため
