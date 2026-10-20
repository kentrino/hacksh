---
title: コマンドの前後処理を run の外に定義できない
theme: citty-parity
parked: low-priority
---

# Problem

`CommandDef` が持つ処理は `run` だけで、子を選択すると親の `run` は呼ばれない。親が確保する資源（接続や一時ディレクトリなど）を子の実行前に用意し、成功・失敗を問わず後で解放するには、各子の `run` に try/finally を書く必要がある。

解決後は、親子のコマンドで前処理と後処理を定義でき、実行が失敗しても前処理に成功した分の後処理が行われる。

親子のコマンドは接続を共有しない。各 `run` の try/finally と呼び出しの `signal` で足りる間は、この仕組みを入れない。

# Coordination

0028 は完了している。1回の実行は1つの `signal` を持ち、親も子もそれを使う。子専用の signal は作らない。

前後処理を入れるとき、後処理にはこの `signal` を渡さない。最初のシグナルの時点で `signal` は中断済みなので、解放のための通信がすぐに失敗する。後処理を止める手段は、二度目のシグナルによるプロセス終了とする。

資源の確保と cleanup はこの issue が担当する。別の cleanup registry は作らない。setup の途中失敗では確保できた分を解放し、本体・cleanup・出力排出の失敗が重なったときの優先順位を決める。help・定義取得・補完では副作用のある setup を実行しない。

# Open Decisions

- ヘルプやバージョンの表示だけの呼び出しで前後処理を行うか。
- 本体の失敗と後処理の失敗が重なったときに、どちらのエラーを返すか。

# Related Files

- `src/command.ts` — `CommandDef`
- `src/run.ts` — `executeCommand`

- `docs/themes/reliable-invocation.md`
- `docs/issues/closed/0028-invocation-cancellation/issue.md`
