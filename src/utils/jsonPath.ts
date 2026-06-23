export function getByPath(obj: unknown, dotPath: string): unknown {
  if (!dotPath) return obj;

  const parts = tokenizePath(dotPath);
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    if (typeof part === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[part];
      continue;
    }

    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

export function setByPath(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const parts = tokenizePath(dotPath);
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    if (typeof part === "number") {
      throw new Error(`setByPath does not support numeric root part in ${dotPath}`);
    }

    if (isLast) {
      current[part] = value;
      return;
    }

    const nextPart = parts[i + 1];
    if (current[part] === undefined || current[part] === null) {
      current[part] = typeof nextPart === "number" ? [] : {};
    }

    current = current[part] as Record<string, unknown>;
  }
}

export function tokenizePath(dotPath: string): Array<string | number> {
  const parts: Array<string | number> = [];
  const rawParts = dotPath.split(".");

  for (const rawPart of rawParts) {
    const regex = /([^\[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(rawPart))) {
      if (match[1]) parts.push(match[1]);
      if (match[2]) parts.push(Number(match[2]));
    }
  }

  return parts;
}

export function getRecordsAtSourceRoot(obj: unknown, sourceRoot: string): unknown[] {
  if (!sourceRoot.includes("[*]")) {
    const value = getByPath(obj, sourceRoot);
    if (value === undefined || value === null) return [];
    return [value];
  }

  const [beforeWildcard, afterWildcardRaw] = sourceRoot.split("[*]");
  const afterWildcard = afterWildcardRaw.startsWith(".")
    ? afterWildcardRaw.slice(1)
    : afterWildcardRaw;

  const array = getByPath(obj, beforeWildcard);
  if (!Array.isArray(array)) return [];

  return array
    .map((item) => (afterWildcard ? getByPath(item, afterWildcard) : item))
    .filter((item) => item !== undefined && item !== null);
}

export function flattenJson(
  obj: unknown,
  prefix = "",
  output: Record<string, unknown> = {}
): Record<string, unknown> {
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      flattenJson(item, `${prefix}[${index}]`, output);
    });
    return output;
  }

  if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenJson(value, next, output);
    }
    return output;
  }

  output[prefix] = obj;
  return output;
}

export function canonicalizeArrayPath(path: string): string {
  return path.replace(/\[\d+\]/g, "[*]");
}
