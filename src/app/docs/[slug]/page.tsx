import { notFound } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import Link from 'next/link';
import { getDocBySlug, getAllDocs, renderMarkdown } from '@/lib/wiki';
import { Metadata } from 'next';

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const doc = getDocBySlug(slug);
    if (!doc) return { title: 'Document Not Found | Cybrdeck Docs' };

    return {
        title: `${doc.title} | Cybrdeck Docs`,
        description: doc.description || `Technical reference documentation for ${doc.title}`,
    };
}

export async function generateStaticParams() {
    const docs = getAllDocs();
    return docs.map((doc) => ({
        slug: doc.slug,
    }));
}

export default async function WikiDocPage({ params }: Props) {
    const { slug } = await params;
    const doc = getDocBySlug(slug);

    if (!doc) {
        notFound();
    }

    const allDocs = getAllDocs();
    const renderedElements = renderMarkdown(doc.content);

    return (
        <div className="min-h-dvh bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                {/* Sidebar Navigation */}
                <aside className="w-full lg:w-64 shrink-0 space-y-4">
                    <Link
                        href="/docs"
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 font-medium"
                    >
                        <Icon name="arrow-left-md" className="w-4 h-4" />
                        All Documentation
                    </Link>

                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                            Reference Library
                        </h3>
                        <nav className="space-y-1">
                            {allDocs.map((item) => {
                                const isActive = item.slug.toLowerCase() === slug.toLowerCase();
                                return (
                                    <Link
                                        key={item.slug}
                                        href={`/docs/${item.slug}`}
                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                                            isActive
                                                ? 'bg-primary/10 text-primary font-medium'
                                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                        }`}
                                    >
                                        <Icon name="file-document" className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{item.title}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Main Article Content */}
                <main className="flex-1 min-w-0 max-w-4xl">
                    <article className="rounded-xl border border-border bg-card p-6 sm:p-10 space-y-6">
                        {/* Breadcrumbs */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Link href="/docs" className="hover:text-foreground transition-colors">
                                Docs
                            </Link>
                            <Icon name="chevron-right" className="w-3 h-3" />
                            <span className="text-foreground font-medium truncate">{doc.title}</span>
                        </div>

                        {/* Title Header */}
                        <div className="border-b border-border pb-6 space-y-4">
                            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                                {doc.title}
                            </h1>

                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Icon name="user" className="w-3.5 h-3.5" />
                                    {doc.author}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Icon name="clock" className="w-3.5 h-3.5" />
                                    Last updated {doc.lastUpdated}
                                </span>
                            </div>
                        </div>

                        {/* Staleness Banner */}
                        {doc.isStale && (
                            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
                                <Icon name="triangle-warning" className="w-5 h-5 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-semibold text-amber-700 dark:text-amber-300">
                                        Stale Documentation
                                    </h4>
                                    <p className="text-xs mt-0.5 opacity-90">
                                        This document was last updated on {doc.lastUpdated} (over 90 days ago) and may contain superseded architectural details.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Markdown Content Render */}
                        <div className="prose dark:prose-invert max-w-none space-y-2 pt-2">
                            {renderedElements}
                        </div>
                    </article>
                </main>
            </div>
        </div>
    );
}
