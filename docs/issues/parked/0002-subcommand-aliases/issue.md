---
title: サブコマンドを別名で呼べない
theme: citty-parity
parked: needs-decision
---

# Problem

サブコマンドは `subCommands` のキーとだけ照合され、それ以外の名前は `Unknown command` になる。短縮名で呼ばせたい場合や、改名後も旧名を残したい場合は、同じ定義を別のキーで重複登録するしかない。その場合、ヘルプやエラーに正規名と別名の関係が現れない。

解決後は、1つのサブコマンドを正規名と別名のどちらでも呼べ、ヘルプとエラーでは正規名が示される。

# Open Decisions

- 採用するかどうか。AI エージェントには正規名だけを示すほうが曖昧さが少ない（`ai-native`）。
- 正規名・別名・非表示の組み合わせでのヘルプの見せ方。

# Related Files

- `src/run.ts` — `resolveCommand` のサブコマンド照合
- `src/usage.ts` — サブコマンド一覧の表示
