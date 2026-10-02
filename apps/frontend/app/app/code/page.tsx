import { PageHeader } from "@/components/page-header";
import { featureFlags } from "@/lib/feature-flags";

/**
 * Phase 1 landing page for the Code Workspace.
 *
 * This is deliberately not an editor. The workspace data model, the path
 * resolver, the file API and the editor shell are Phase 2, and until they
 * exist this page says so rather than drawing a file tree that cannot be
 * opened. Nothing here fakes a capability.
 */
export default function CodePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace / Code"
        title="Code Workspace"
        description="An in-browser editor over your own files, with a coding agent beside it. It replaces Projects and Files."
        status="Phase 2 · not built yet"
      />

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <h2 className="text-[15px] font-semibold text-foreground">What exists right now</h2>
        <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">
          The feature flag that governs this surface is{" "}
          <code className="font-mono text-foreground">{featureFlags.codeWorkspace ? "on" : "off"}</code>. The
          flag system, the retired Projects and Files routes and this navigation entry are Phase 1. There is no
          editor, no file tree and no agent yet, so nothing on this page pretends otherwise.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold text-foreground">What Phase 2 adds</h2>
        <ul className="mt-2 space-y-2 text-[13.5px] leading-6 text-muted-foreground">
          <li>· One isolated directory per workspace, outside the web root, with a path resolver that refuses traversal.</li>
          <li>· A real file API: tree, read, write, create, rename, move, delete, upload, zip download.</li>
          <li>· Optimistic concurrency, so two tabs cannot silently overwrite each other.</li>
          <li>· A lazily loaded editor with tabs, language detection and dirty-state indicators.</li>
        </ul>
      </div>
    </div>
  );
}