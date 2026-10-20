---
title: コマンドの前後処理を run の外に定義できない
theme: citty-parity
---

# Problem

`CommandDef` が持つ処理は `run` だけで、子を選択すると親の `run` は呼ばれない。親が確保する資源（接続や一時ディレクトリなど）を子の実行前に用意し、成功・失敗を問わず後で解放するには、各子の `run` に try/finally を書く必要がある。

解決後は、親子のコマンドで前処理と後処理を定義でき、実行が失敗しても前処理に成功した分の後処理が行われる。

# Coordination

`reliable-invocation` の0028と終了・中断の契約を共有する。資源の確保と cleanup はこの issue が担当し、signal の伝播と終了状態は0028が担当する。setup の途中失敗では確保できた分を解放し、本体・cleanup・出力排出の失敗が重なった際の優先順位を決める。help・定義取得・補完で副作用のある setup を実行しない方針を優先する。

# Open Decisions

- ヘルプやバージョンの表示だけの呼び出しで前後処理を行うか。
- 本体の失敗と後処理の失敗が重なったときに、どちらのエラーを返すか。

# Related Files

- `src/command.ts` — `CommandDef`
- `src/run.ts` — `executeCommand`

- `docs/themes/reliable-invocation.md`
- `docs/issues/closed/0028-invocation-cancellation/issue.md`
