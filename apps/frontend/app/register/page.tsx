import Link from "next/link";

export default function RegisterPage() {
  return <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6"><p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--accent)]">ISOBASH access</p><h1 className="mt-4 text-4xl font-semibold text-[var(--text)]">Create account</h1><p className="mt-4 leading-7 text-[var(--muted)]">Account creation will use server-side validation, password hashing, sessions, and role assignment before it becomes active.</p><div className="mt-8 border border-[var(--line)] bg-[var(--panel)] p-5 text-sm text-[var(--muted)]">Registration is intentionally not pretending to succeed while the authentication service is under construction.</div><Link href="/" className="mt-6 text-sm text-[var(--accent)]">Back to home</Link></main>;
}
