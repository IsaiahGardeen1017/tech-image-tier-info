export interface ScalarValue {
  kind: "scalar";
  value: string;
}

export interface BlockValue {
  kind: "block";
  entries: Entry[];
  values: string[];
}

export type Value = ScalarValue | BlockValue;

export interface Entry {
  key: string;
  value: Value;
  line: number;
}

interface Token {
  value: string;
  line: number;
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;

  while (index < source.length) {
    const char = source[index]!;
    if (char === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "{" || char === "}" || char === "=") {
      tokens.push({ value: char, line });
      index += 1;
      continue;
    }
    if (char === '"') {
      const tokenLine = line;
      index += 1;
      let value = "";
      while (index < source.length) {
        const current = source[index]!;
        if (current === "\\" && index + 1 < source.length) {
          value += source[index + 1]!;
          index += 2;
        } else if (current === '"') {
          index += 1;
          break;
        } else {
          if (current === "\n") line += 1;
          value += current;
          index += 1;
        }
      }
      tokens.push({ value, line: tokenLine });
      continue;
    }

    const tokenLine = line;
    let value = "";
    while (index < source.length) {
      const current = source[index]!;
      if (/\s/.test(current) || current === "{" || current === "}" || current === "=" || current === "#") break;
      value += current;
      index += 1;
    }
    if (value) tokens.push({ value, line: tokenLine });
  }
  return tokens;
}

export function parseClausewitz(source: string): BlockValue {
  const tokens = tokenize(source);
  let position = 0;

  function parseBlock(expectClose: boolean): BlockValue {
    const block: BlockValue = { kind: "block", entries: [], values: [] };
    while (position < tokens.length) {
      const token = tokens[position]!;
      if (token.value === "}") {
        if (!expectClose) throw new Error(`Unexpected closing brace on line ${token.line}`);
        position += 1;
        return block;
      }
      if (token.value === "{" || token.value === "=") {
        throw new Error(`Unexpected '${token.value}' on line ${token.line}`);
      }

      const next = tokens[position + 1];
      if (next?.value !== "=") {
        block.values.push(token.value);
        position += 1;
        continue;
      }

      position += 2;
      const valueToken = tokens[position];
      if (!valueToken) throw new Error(`Missing value for '${token.value}' on line ${token.line}`);
      let value: Value;
      if (valueToken.value === "{") {
        position += 1;
        value = parseBlock(true);
      } else if (valueToken.value === "}" || valueToken.value === "=") {
        throw new Error(`Invalid value for '${token.value}' on line ${valueToken.line}`);
      } else {
        value = { kind: "scalar", value: valueToken.value };
        position += 1;
      }
      block.entries.push({ key: token.value, value, line: token.line });
    }
    if (expectClose) throw new Error("Unclosed block at end of file");
    return block;
  }

  return parseBlock(false);
}

export function firstEntry(block: BlockValue, key: string): Entry | undefined {
  return block.entries.find((entry) => entry.key === key);
}

export function scalar(entry: Entry | undefined): string | undefined {
  return entry?.value.kind === "scalar" ? entry.value.value : undefined;
}

export function list(entry: Entry | undefined): string[] {
  return entry?.value.kind === "block" ? entry.value.values : [];
}
