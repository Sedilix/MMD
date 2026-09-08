'use client';

export function TelemetryCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col items-center text-center gap-0.5">
            <span className="text-[9px] font-semibold text-blue-400">{label}</span>
            <span className="font-mono text-[11px] text-white">{value}</span>
        </div>
    );
}
