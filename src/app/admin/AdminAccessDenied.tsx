/**
 * 403 page for the /admin section when a non-admin (Core /
 * builder / signed-out) tries to reach it. Renders inside the
 * AdminShell so the nav stays available and the operator can
 * re-auth or navigate to a non-admin area.
 */
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

export default function AdminAccessDenied() {
    return (
        <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-rose-500/30 bg-zinc-900/60 p-8 shadow-2xl">
                <div className="flex items-center gap-2 text-rose-400 mb-3">
                    <Icon name="shield-warning" className="h-5 w-5" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">403 · Admin only</span>
                </div>
                <h1 className="text-2xl font-semibold text-zinc-50 mb-2">This surface is admin-internal</h1>
                <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                    The /admin section exposes One's progress, the McKinsey/Gartner-style
                    executive report, and the marketing agent. It is restricted to the
                    <strong> Admin</strong> tier. Core (Cybrdeck portal) members and other
                    roles do not have access — those surfaces surface internal telemetry
                    that is not for builder-tier consumption.
                </p>
                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                    If you believe you should have access, ask a Cybrdeck admin to
                    promote your account to the Admin portal role.
                </p>
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 text-sm font-semibold"
                >
                    <Icon name="arrow-left-md" className="h-3.5 w-3.5" /> Back to dashboard
                </Link>
            </div>
        </div>
    );
}
