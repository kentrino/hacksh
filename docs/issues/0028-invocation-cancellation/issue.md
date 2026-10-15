---
title: 呼び出し全体の中断と終了状態を共有できない
theme: reliable-invocation
---

# Problem

context に共通の AbortSignal がなく、prompt のキャンセル、作者の通信、予定している exec の中断が別々になる。runMain の失敗終了は主に1とprompt取消の130に固定され、作者が独自の終了状態を伝える契約もない。

一回の実行の中断を各処理へ伝え、後始末と出力排出を経て終了状態を呼び出し元へ返せるようにする。

# Rules

- invocation ごとの signal を通信・exec・prompt に接続する。exec のタイムアウトや子の終了処理は0023と統合する。
- 資源の確保・解放は0005で扱い、別の cleanup registry を追加しない。
- runCommand はOSシグナルを勝手に購読せず、process.exit を呼ばない。runMain のシグナル管理は取り外しと多重登録の契約を持つ。
- 協調的中断の範囲を明記する。signal を無視する任意の処理を停止できるとは約束しない。

# Acceptance Criteria

- 外部 AbortSignal の事前中断・実行中の中断が context と対応する処理へ伝わる。
- 成功・例外・中断で cleanup と出力排出を行い、リスナーが残らない。
- 任意の終了コードを伝える公開手段を定義し、ライブラリ実行は値または型付き例外で観測できる。
- SIGINT/SIGTERM、本体とcleanupの同時失敗、複数invocationの独立性を検証する。

# Open Decisions

- 終了状態を戻り値・例外・専用APIのどれで伝えるか。
- signal.reason、prompt取消、終了コードの対応と、終了猶予・二度目のシグナルの扱い。

# Related Files

- `src/run.ts`
- `src/prompts.ts`
- `docs/issues/0001-invocation-data/issue.md`
- `docs/issues/0005-lifecycle-hooks/issue.md`
- `docs/issues/0023-context-exec/issue.md`
