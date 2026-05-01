"use client";

import { MockFileSystem } from "@/lib/terminal/MockFileSystem";

export class CommandParser {
  private fs: MockFileSystem;

  constructor(fs: MockFileSystem) {
    this.fs = fs;
  }

  execute(input: string): string {
    const [command, ...args] = input.trim().split(/\s+/);
    if (!command) return "";

    try {
      if (command === "help") {
        return "Commands: help, pwd, ls, cd, mkdir, cat, echo, stellar keys generate, stellar tx send, stellar soroban deploy, clear";
      }
      if (command === "pwd") return this.fs.pwd();
      if (command === "ls") return this.fs.ls().join("  ");
      if (command === "cd") {
        this.fs.cd(args[0] ?? "/");
        return "";
      }
      if (command === "mkdir") {
        this.fs.mkdir(args[0] ?? "");
        return "";
      }
      if (command === "cat") {
        return this.fs.readFile(args[0] ?? "");
      }
      if (command === "echo") {
        const output = args.join(" ");
        const redirectIndex = args.indexOf(">");
        if (redirectIndex > -1) {
          const content = args.slice(0, redirectIndex).join(" ");
          const filePath = args[redirectIndex + 1];
          if (!filePath) throw new Error("echo: missing file path");
          this.fs.writeFile(filePath, content);
          return "";
        }
        return output;
      }

      if (command === "stellar") {
        if (args[0] === "keys" && args[1] === "generate") {
          return "Public Key: GAXXXXXXXXXXXXX\nSecret Key: SXXXXXXXXXXXXX\n( mock key pair )";
        }
        if (args[0] === "tx") {
          return "Mock transaction submitted. Hash: 0xabc123def456";
        }
        if (args[0] === "soroban") {
          return "Mock soroban command executed successfully.";
        }
        return "Unknown stellar subcommand";
      }

      return `command not found: ${command}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      return message;
    }
  }
}
