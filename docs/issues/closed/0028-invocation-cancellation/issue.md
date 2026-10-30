---
title: 呼び出し全体の中断と終了状態を共有できない
theme: reliable-invocation
---

# Problem

context に共通の AbortSignal がなく、prompt のキャンセル、作者の通信、予定している exec の中断が別々になる。runMain の失敗終了は主に1とprompt取消の130に固定され、作者が独自の終了状態を伝える契約もない。

一回の実行の中断を各処理へ伝え、後始末と出力排出を経て終了状態を呼び出し元へ返せるようにする。

# Rules

- invocation ごとの signal を通信・exec・prompt に接続する。exec のタイムアウトや子の終了処理は0023と統合する。
- 資源を開いた `run` がそれを解放する。別の cleanup registry は追加しない。
- runCommand はOSシグナルを勝手に購読せず、process.exit を呼ばない。runMain のシグナル管理は取り外しと多重登録の契約を持つ。
- 協調的中断の範囲を明記する。signal を無視する任意の処理を停止できるとは約束しない。

# Acceptance Criteria

- 外部 AbortSignal の事前中断・実行中の中断が context と対応する処理へ伝わる。
- 成功・例外・中断で cleanup と出力排出を行い、リスナーが残らない。
- 任意の終了コードを伝える公開手段を定義し、ライブラリ実行は値または型付き例外で観測できる。
- SIGINT/SIGTERM、本体とcleanupの同時失敗、複数invocationの独立性を検証する。

# Decisions

- context の `signal` は `runCommand` の `signal` オプションをそのまま使い、未指定なら中断されない signal を渡す。事前に中断済みなら `run` を呼ばずに `signal.reason` で reject する。
- 終了コードは run から 0〜255 の整数を返して伝える。`undefined` は 0、それ以外は `TypeError` とする。`runCommand` は `Promise<number>` として終了コードを返し、例外はそのまま reject する。`HackshExitError(exitCode, message?)` の throw も引き続き使える。`runMain` は `HackshError` の派生例外だけを通常の CLI エラーとして表示・終了処理し、他の例外は再 throw する。
- `runMain` は SIGINT・SIGTERM を購読し、最初のシグナルで `AbortError` を reason に中断する。run が正常終了、`HackshError` の送出、またはその signal.reason と同じ値で reject した場合、出力を排出して 130・143 で終了する。別の例外や出力失敗は再 throw し、シグナル終了に置き換えない。終了猶予のタイマーは持たず、二度目のシグナルで即座に終了する。
- 中断による prompt の失敗は `aborted` とし、Ctrl-C・Escape の `cancelled` と区別する。exec は既存の `aborted` を使う。

# Related Files

- `src/run.ts`
- `src/prompts.ts`
- `docs/issues/open/0001-invocation-data/issue.md`
- `docs/issues/closed/0005-lifecycle-hooks/issue.md`
- `docs/issues/closed/0023-context-exec/issue.md`
