/**
 * In-memory stand-in for expo-file-system's `File` / `Directory` / `Paths`, covering what the app
 * uses. Installed for every test by jest.setup.js; tests add files with `fakeFiles.write`.
 */

const files = new Map<string, number>();
const dirs = new Set<string>();

type Part = string | { uri: string };

function join(parts: Part[]): string {
  return parts
    .map((p) => (typeof p === "string" ? p : p.uri))
    .map((s, i) => (i === 0 ? s.replace(/\/+$/, "") : s.replace(/^\/+|\/+$/g, "")))
    .join("/");
}

function parentOf(uri: string): string {
  return uri.slice(0, uri.lastIndexOf("/"));
}

export class File {
  readonly uri: string;

  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }

  get name(): string {
    return this.uri.slice(this.uri.lastIndexOf("/") + 1);
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  get size(): number {
    const size = files.get(this.uri);
    if (size === undefined) throw new Error(`No such file: ${this.uri}`);
    return size;
  }

  delete(): void {
    if (!files.delete(this.uri)) throw new Error(`No such file: ${this.uri}`);
  }

  copy(target: File): void {
    files.set(target.uri, this.size);
  }
}

export class Directory {
  readonly uri: string;

  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }

  get exists(): boolean {
    return dirs.has(this.uri);
  }

  create(): void {
    dirs.add(this.uri);
  }

  list(): File[] {
    return [...files.keys()].filter((uri) => parentOf(uri) === this.uri).map((uri) => new File(uri));
  }
}

export const Paths = {
  get document() {
    return new Directory("file:///document");
  },
  get cache() {
    return new Directory("file:///cache");
  },
};

export const fakeFiles = {
  /** Adds a file (and its directory) of `size` bytes. */
  write(uri: string, size = 1000) {
    files.set(uri, size);
    dirs.add(parentOf(uri));
  },
  has(uri: string): boolean {
    return files.has(uri);
  },
  uris(): string[] {
    return [...files.keys()].sort();
  },
  reset() {
    files.clear();
    dirs.clear();
  },
};
