import Link from "next/link";

export default function LoginPage() {
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6"><p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--accent)]">ISOBASH access</p><h1 className="mt-4 text-4xl font-semibold text-[var(--text)]">Sign in</h1><p className="mt-4 leading-7 text-[var(--muted)]">Authentication is a Phase 1 foundation boundary. Credential handling will be connected before protected features are enabled.</p><div className="mt-8 border border-[var(--line)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">No credentials are collected until the server-side authentication implementation is ready.</div><Link href="/" className="mt-6 text-sm text-[var(--accent)]">Back to home</Link></main>;
}
