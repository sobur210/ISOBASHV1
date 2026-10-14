"use client";

import { useState } from "react";
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  GlobeIcon,
  PlayIcon,
  SearchIcon,
  TerminalIcon,
} from "@/components/ui/icons";

/**
 * A purely presentational replica of a Replit-style workspace.
 *
 * It is a clone, not an editor: the file tree, the code and the console are
 * hardcoded, nothing is fetched and nothing is saved. It exists to show the
 * shape of the surface; the real editor is not built.
 */

type CloneFile = {
  language: string;
  code: string;
};

type FileNode = { type: "file"; name: string; path: string };
type DirNode = { type: "dir"; name: string; children: TreeNode[] };
type TreeNode = FileNode | DirNode;

const FILES: Record<string, CloneFile> = {
  "README.md": {
    language: "Markdown",
    code: [
      "# my-app",
      "",
      "A tiny TypeScript service.",
      "",
      "## Getting started",
      "",
      "    npm install",
      "    npm run dev",
    ].join("\n"),
  },
  "src/index.ts": {
    language: "TypeScript",
    code: [
      'import { createServer } from "./server";',
      "",
      "const port = Number(process.env.PORT ?? 3000);",
      "",
      "createServer().listen(port, () => {",
      "  console.log(`listening on http://localhost:${port}`);",
      "});",
    ].join("\n"),
  },
  "src/server.ts": {
    language: "TypeScript",
    code: [
      'import { router } from "./utils";',
      "",
      "export function createServer() {",
      "  return {",
      "    listen(port: number, ready: () => void) {",
      '      router.register("/health", () => ({ status: "ok" }));',
      "      ready();",
      "    },",
      "  };",
      "}",
    ].join("\n"),
  },
  "src/utils.ts": {
    language: "TypeScript",
    code: [
      "type Handler = () => unknown;",
      "",
      "export const router = {",
      "  routes: new Map<string, Handler>(),",
      "  register(path: string, handler: Handler) {",
      "    this.routes.set(path, handler);",
      "    return this;",
      "  },",
      "};",
    ].join("\n"),
  },
  "package.json": {
    language: "JSON",
    code: [
      "{",
      '  "name": "my-app",',
      '  "version": "1.0.0",',
      '  "type": "module",',
      '  "scripts": {',
      '    "dev": "tsx watch src/index.ts"',
      "  }",
      "}",
    ].join("\n"),
  },
};

const TREE: TreeNode[] = [
  { type: "file", name: "README.md", path: "README.md" },
  {
    type: "dir",
    name: "src",
    children: [
      { type: "file", name: "index.ts", path: "src/index.ts" },
      { type: "file", name: "server.ts", path: "src/server.ts" },
      { type: "file", name: "utils.ts", path: "src/utils.ts" },
    ],
  },
  { type: "file", name: "package.json", path: "package.json" },
];

const CONSOLE_LINES = [
  { tone: "muted", text: "$ npm run dev" },
  { tone: "muted", text: "" },
  { tone: "default", text: "> my-app@1.0.0 dev" },
  { tone: "default", text: "> tsx watch src/index.ts" },
  { tone: "default", text: "" },
  { tone: "success", text: "listening on http://localhost:3000" },
  { tone: "muted", text: "GET /health 200 in 3ms" },
];

function TreeRow({
  node,
  depth,
  activePath,
  expanded,
  onToggle,
  onOpen,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  expanded: string[];
  onToggle: (name: string) => void;
  onOpen: (path: string) => void;
}) {
  const pad = { paddingLeft: `${10 + depth * 14}px` };

  if (node.type === "dir") {
    const isOpen = expanded.includes(node.name);
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(node.name)}
          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          style={pad}
        >
          <ChevronRightIcon
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform ${
              isOpen ? "rotate-90" : ""
            }`}
          />
          <FolderIcon className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen
          ? node.children.map((child) => (
              <TreeRow
                key={child.type === "file" ? child.path : child.name}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                expanded={expanded}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))
          : null}
      </div>
    );
  }

  const isActive = activePath === node.path;
  return (
    <button
      type="button"
      onClick={() => onOpen(node.path)}
      className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12.5px] transition-colors ${
        isActive
          ? "bg-primary-soft text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
      style={pad}
    >
      <span className="w-3.5 shrink-0" />
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function WorkspaceClone() {
  const [activePath, setActivePath] = useState("src/index.ts");
  const [expanded, setExpanded] = useState<string[]>(["src"]);
  const [pane, setPane] = useState<"preview" | "console">("console");

  const active = FILES[activePath];
  const lines = active.code.split("\n");

  const toggle = (name: string) =>
    setExpanded((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name],
    );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </span>
        <span className="ml-2 font-mono text-[12px] text-muted-foreground">my-app</span>
        <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          main
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-[12px] font-medium text-white">
          <PlayIcon className="h-3.5 w-3.5" />
          Run
        </span>
      </div>

      <div className="grid min-h-[26rem] grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Files
            </span>
          </div>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            <input
              readOnly
              defaultValue=""
              placeholder="Search"
              className="w-full bg-transparent font-mono text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-0.5 p-2">
            {TREE.map((node) => (
              <TreeRow
                key={node.type === "file" ? node.path : node.name}
                node={node}
                depth={0}
                activePath={activePath}
                expanded={expanded}
                onToggle={toggle}
                onOpen={setActivePath}
              />
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0">
          <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-2 pt-1.5">
            <div className="flex items-center gap-1.5 rounded-t-sm border border-b-0 border-border-strong bg-surface-2 px-2.5 py-1.5 text-[12px] text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="truncate font-mono">{activePath.split("/").pop()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5 text-[12px] text-muted-foreground">
            <span className="rounded-sm bg-surface-3 px-1.5 py-0.5 font-medium text-foreground">
              {active.language}
            </span>
            <span className="flex-1" />
            <span className="text-muted-foreground/70">Ln {lines.length}</span>
          </div>
          <div className="flex-1 overflow-auto bg-surface px-4 py-3">
            <pre className="font-mono text-[13px] leading-6 text-foreground">
              {lines.map((line, index) => (
                <div key={index} className="flex">
                  <span className="mr-4 inline-block w-6 shrink-0 select-none text-right text-muted-foreground/40">
                    {index + 1}
                  </span>
                  <span className="whitespace-pre">{line || " "}</span>
                </div>
              ))}
            </pre>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col bg-surface-2">
          <div className="flex items-center gap-1 border-b border-border px-2 pt-1.5">
            <button
              type="button"
              onClick={() => setPane("preview")}
              className={`flex items-center gap-1.5 rounded-t-sm border border-b-0 px-2.5 py-1.5 text-[12px] transition-colors ${
                pane === "preview"
                  ? "border-border-strong bg-surface text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <GlobeIcon className="h-3.5 w-3.5" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setPane("console")}
              className={`flex items-center gap-1.5 rounded-t-sm border border-b-0 px-2.5 py-1.5 text-[12px] transition-colors ${
                pane === "console"
                  ? "border-border-strong bg-surface text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TerminalIcon className="h-3.5 w-3.5" />
              Console
            </button>
          </div>

          {pane === "console" ? (
            <div className="flex-1 overflow-auto p-3 font-mono text-[12px] leading-6">
              {CONSOLE_LINES.map((line, index) => (
                <div
                  key={index}
                  className={
                    line.tone === "success"
                      ? "text-success"
                      : line.tone === "muted"
                        ? "text-muted-foreground/70"
                        : "text-foreground"
                  }
                >
                  {line.text || "\u00a0"}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 p-3">
              <div className="h-full min-h-[18rem] overflow-hidden rounded-md border border-border bg-surface">
                <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-border-strong" />
                  <span className="h-2 w-2 rounded-full bg-border-strong" />
                  <span className="ml-2 flex-1 rounded-sm bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    localhost:3000
                  </span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="h-3 w-2/3 rounded-sm bg-surface-3" />
                  <div className="h-3 w-1/2 rounded-sm bg-surface-3" />
                  <div className="mt-4 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-[12px] text-success">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    status: ok
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
