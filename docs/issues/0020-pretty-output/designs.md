# Designs

どの案も、人間向け表示は printer（0022）の人間向け形式の実装で、`run` のコードは変わらない。色は `node:util` の `styleText` で付け、依存は増やさない。

## A. 記号と色の表をテーマとして持つ

見た目を値の表として持ち、描画の手順は hacksh が固定する。

```ts
type Style = Parameters<typeof styleText>[0];
type Mark = "start" | "bar" | "end" | "step" | "success" | "info" | "warning" | "error";

interface Theme {
  symbols: Record<Mark, string>;
  colors: Partial<Record<Mark, Style>>;
  formatProperties?(properties: Record<string, unknown>): string | undefined;
}

const defaultTheme: Theme = {
  symbols: {
    start: "┌",
    bar: "│",
    end: "└",
    step: "◇",
    success: "✔",
    info: "●",
    warning: "▲",
    error: "■",
  },
  colors: { info: "blue", success: "green", warning: "yellow", error: "red", bar: "gray" },
};

function createPrettyPrinter(options: {
  theme?: Partial<Theme>;
  color: boolean;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}): Printer;
```

- 利点: 記号を ASCII に落とすなど、よくある調整が値の上書きで済む。
- 欠点: 行の組み立て方（罫線の入れ方、プロパティの位置）は変えられない。

## B. 種類ごとの描画関数をテーマとして持つ

テーマを関数の集まりにし、1件の出力を何行にするかまでテーマが決める。

```ts
interface Theme {
  log(record: LogRecord, style: Styler): string[];
  usage(command: CommandSummary, style: Styler): string[];
  error(error: HackshErrorSummary, style: Styler): string[];
  prompt(state: PromptState, style: Styler): string[]; // 0021
}

type Styler = (format: Style, text: string) => string; // color: false なら素通し

const clackLikeTheme: Theme = {
  log: (record, style) => [style("gray", "│"), `${style("green", "◇")}  ${record.message}`],
  // ...
};
```

- 利点: ヘルプや対話入力まで含めて、見た目を丸ごと差し替えられる。
- 欠点: テーマが printer のイベントの種類と結合し、種類が増えるたびにテーマも追従する。

## C. 見た目は固定し、色と記号の有無だけ切り替える

テーマを公開せず、hacksh の見た目を一つに決める。調整できるのは色の有無と Unicode 記号の有無だけにする。

```ts
function createPrettyPrinter(options: {
  color: boolean; // NO_COLOR・非端末で false
  unicode: boolean; // false なら ┌│└◇✔ を +|+*v に落とす
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}): Printer;
```

- 利点: 公開 API が最小で、hacksh を使う CLI の見た目が揃う。
- 欠点: 見た目を変えたい作者は、printer を丸ごと自作するしかない。
