import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { getAllDocs } from '@/lib/wiki';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Documentation & Architecture Wiki | Cybrdeck',
    description: 'Core architectural reference pages, technical specifications, and repository documentation.',
};

export default function WikiIndexPage() {
    const docs = getAllDocs();

    return (
        <div className="min-h-dvh bg-background text-foreground py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto space-y-8">
                {/* Header */}
                <div className="border-b border-border pb-8">
                    <div className="flex items-center space-x-3 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Icon name="book-open" className="w-6 h-6" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Repository Wiki & Docs</h1>
                    </div>
                    <p className="text-muted-foreground text-lg">
                        Deterministic architectural specifications, system handoffs, and reference documentation.
                    </p>
                </div>

                {/* Docs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {docs.map((doc) => (
                        <Link
                            key={doc.slug}
                            href={`/docs/${doc.slug}`}
                            className="group flex flex-col justify-between p-5 rounded-xl border border-border bg-card hover:bg-muted/40 transition-all duration-200 hover:border-primary/50 shadow-sm hover:shadow"
                        >
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <h2 className="text-lg font-semibold group-hover:text-primary transition-colors flex items-center gap-2">
                                        <Icon name="file-document" className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                        {doc.title}
                                    </h2>
                                    {doc.isStale && (
                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                                            <Icon name="triangle-warning" className="w-3 h-3" />
                                            Stale
                                        </span>
                                    )}
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                                    {doc.description}
                                </p>
                            </div>

                            <div className="pt-4 mt-4 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center gap-1">
                                        <Icon name="user" className="w-3.5 h-3.5" />
                                        {doc.author}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Icon name="clock" className="w-3.5 h-3.5" />
                                        {doc.lastUpdated}
                                    </span>
                                </div>

                                <span className="flex items-center gap-1 text-primary font-medium group-hover:translate-x-0.5 transition-transform">
                                    Read
                                    <Icon name="arrow-right-md" className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>

                {docs.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-border rounded-xl">
                        <p className="text-muted-foreground">No markdown documentation files found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
