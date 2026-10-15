# Designs

どの案も、ロガーは1件の出力を `LogRecord` にして `Sink` へ渡すだけで、形式（0019）と見た目（0020）は `Sink` 側が決める。

```ts
interface LogRecord {
  level: LogLevel;
  category: readonly string[]; // 例: ["mycli", "deploy"]
  message: string; // 埋め込み済みの文
  rawMessage: string; // テンプレートのまま
  properties: Record<string, unknown>;
  timestamp: number;
}

type Sink = (record: LogRecord) => void;
```

## A. LogTape に寄せる

LogTape の `Logger` の形をそのまま小さくしたもの。メッセージは `{name}` 形式のテンプレートで、プロパティが JSON にそのまま載る。

```ts
type LogLevel = "trace" | "debug" | "info" | "warning" | "error" | "fatal";

interface Logger {
  readonly category: readonly string[];
  trace(message: string, properties?: Record<string, unknown>): void;
  debug(message: string, properties?: Record<string, unknown>): void;
  info(message: string, properties?: Record<string, unknown>): void;
  warn(message: string, properties?: Record<string, unknown>): void;
  error(message: string | Error, properties?: Record<string, unknown>): void;
  fatal(message: string | Error, properties?: Record<string, unknown>): void;
  with(properties: Record<string, unknown>): Logger; // 以降の出力に常に付ける
  getChild(category: string): Logger;
}

run({ args, logger }) {
  logger.info("Deploying {app} to {env}", { app: args.app, env: args.env });
}
```

- 利点: LogTape を知る人には説明が要らない。JSON 形式で `properties` がそのまま検索できる。
- 欠点: @clack/prompts の `success`・`step` のような「完了」「手順」の区別がなく、人間向け表示が単調になる。

## B. LogTape の重要度 + 意味付きの種類

A の重要度に、人間向け表示のための `kind` を足す。JSON では `kind` もフィールドとして出る。

```ts
type LogKind = "message" | "step" | "success";

interface Logger extends LoggerA {
  step(message: string, properties?: Record<string, unknown>): void; // level: info, kind: step
  success(message: string, properties?: Record<string, unknown>): void; // level: info, kind: success
}

interface LogRecord extends LogRecordA {
  kind: LogKind;
}
```

- 利点: clack 風の表示（`◇` の手順、`✔` の完了）を、レベルを増やさずに書き分けられる。
- 欠点: LogTape との対応が一部崩れ、`kind` の種類をどこまで増やすかの判断が残る。

## C. console 互換 + データ

`console` からの置き換えを最優先にし、テンプレートを持たない。

```ts
interface Logger {
  log(...values: unknown[]): void; // level: info
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string | Error, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}
```

- 利点: 既存の `console.log` を機械的に置き換えられる。
- 欠点: `log(...values)` は JSON での形が定まらず、構造化の利点が薄れる。

## 書き先の差し替え（どの案にも共通）

```ts
await runMain(main, { sink: (record) => records.push(record) });
await runCommand(main, ["deploy"], { sink }); // または 0001 の呼び出しごとの値として渡す
```
