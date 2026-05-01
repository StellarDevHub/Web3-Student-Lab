"use client";

type NodeType = "file" | "dir";

interface FsNode {
  type: NodeType;
  content?: string;
  children?: Record<string, FsNode>;
}

export class MockFileSystem {
  private root: FsNode = { type: "dir", children: {} };
  private cwd: string[] = [];

  constructor() {
    this.mkdir("contracts");
    this.writeFile("README.md", "# Stellar Lab Terminal\n");
  }

  pwd() {
    return `/${this.cwd.join("/")}`.replace("//", "/");
  }

  ls() {
    const node = this.getNode(this.cwd);
    if (!node || node.type !== "dir" || !node.children) return [];
    return Object.keys(node.children).sort();
  }

  cd(path: string) {
    const nextPath = this.resolvePath(path);
    const node = this.getNode(nextPath);
    if (!node || node.type !== "dir") {
      throw new Error(`cd: no such directory: ${path}`);
    }
    this.cwd = nextPath;
  }

  mkdir(path: string) {
    const target = this.resolvePath(path);
    this.ensureDir(target);
  }

  writeFile(path: string, content: string) {
    const target = this.resolvePath(path);
    const fileName = target[target.length - 1];
    const dirPath = target.slice(0, -1);
    const dir = this.ensureDir(dirPath);
    if (!dir.children) dir.children = {};
    dir.children[fileName] = { type: "file", content };
  }

  readFile(path: string): string {
    const target = this.resolvePath(path);
    const node = this.getNode(target);
    if (!node || node.type !== "file") {
      throw new Error(`cat: no such file: ${path}`);
    }
    return node.content ?? "";
  }

  private resolvePath(path: string): string[] {
    const parts = path.split("/").filter(Boolean);
    const base = path.startsWith("/") ? [] : [...this.cwd];
    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") {
        base.pop();
      } else {
        base.push(part);
      }
    }
    return base;
  }

  private getNode(pathParts: string[]): FsNode | null {
    let cursor: FsNode = this.root;
    for (const part of pathParts) {
      if (!cursor.children?.[part]) return null;
      cursor = cursor.children[part];
    }
    return cursor;
  }

  private ensureDir(pathParts: string[]): FsNode {
    let cursor: FsNode = this.root;
    for (const part of pathParts) {
      if (!cursor.children) cursor.children = {};
      if (!cursor.children[part]) {
        cursor.children[part] = { type: "dir", children: {} };
      }
      cursor = cursor.children[part];
      if (cursor.type !== "dir") {
        throw new Error(`Path conflict: ${part} is not a directory`);
      }
    }
    return cursor;
  }
}
