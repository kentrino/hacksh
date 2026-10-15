# Designs

どの案も、`runMain`・`runCommand` は呼び出しごとに printer を一つ持ち、hacksh の内部では `console` を直接呼ばない。

```ts
await runMain(main, { printer }); // 省略時は 0019 の OutputMode から既定の printer を作る
await runCommand(main, argv, { printer });
```

## A. 種類付きのイベントを受け取る

hacksh は出力の意味だけを渡し、形式（0019）と見た目（0020）は printer が決める。

```ts
type PrintEvent =
  | { type: "log"; record: LogRecord } // 0018
  | { type: "usage"; command: CommandSummary } // ヘルプ
  | { type: "version"; version: string }
  | { type: "error"; error: HackshErrorSummary } // 0009 の構造
  | { type: "prompt"; prompt: PromptState }; // 0021 の表示

interface Printer {
  print(event: PrintEvent): void | Promise<void>;
}

const prettyPrinter: Printer = createPrettyPrinter({ theme, color, stdout, stderr });
const jsonPrinter: Printer = createJsonPrinter({ stdout, stderr }); // 1イベント1行
```

- 利点: JSON 形式でもヘルプやエラーが構造を保ったまま出る。テストではイベントを配列に集めて検証できる。
- 欠点: イベントの種類が公開 API になり、追加のたびに独自の printer が追従する必要がある。

## B. 整形済みの文字列を受け取る

形式と見た目は printer の手前で決まり、printer は書き先だけを担う。

```ts
interface Printer {
  stdout(text: string): void | Promise<void>;
  stderr(text: string): void | Promise<void>;
}

const processPrinter: Printer = {
  stdout: (text) => void process.stdout.write(`${text}\n`),
  stderr: (text) => void process.stderr.write(`${text}\n`),
};
```

- 利点: 最小で、既存の `UsageWriter` と同じ考え方で置き換えられる。
- 欠点: 構造は printer に届かないため、テストやラップする側では文字列を解析することになる。形式を切り替える処理が printer の外に散らばる。

## C. すべてをログレコードに揃える

ヘルプ・バージョン・エラーも 0018 の `LogRecord` の一種として表し、printer はレコードだけを受け取る。

```ts
interface Printer {
  write(record: LogRecord): void | Promise<void>;
}

// ヘルプ: { level: "info", kind: "usage", message: "<整形済みのヘルプ>", properties: { command: CommandSummary } }
// エラー: { level: "error", kind: "error", message: "...", properties: { issues: ZittyIssue[] } }
```

- 利点: 型が一つで、ロガーの書き先と printer が同じものになる。
- 欠点: ヘルプのような複数行の表示をレコードに押し込むため、`message` と `properties` の役割が種類ごとに変わる。
