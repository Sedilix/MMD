import fs from 'fs';
import path from 'path';
import React from 'react';

export interface WikiDoc {
    slug: string;
    title: string;
    description?: string;
    author: string;
    lastUpdated: string;
    isStale: boolean;
    content: string;
    filePath: string;
}

const DOCS_DIR = path.join(process.cwd(), 'docs');
const ROOT_DIR = process.cwd();

// Core architectural markdown files in root to index alongside docs/
const ROOT_DOC_FILES = ['PRODUCT.md', 'DESIGN.md', 'README.md'];

export function getAllDocs(): WikiDoc[] {
    const docs: WikiDoc[] = [];

    // Scan docs/ directory
    if (fs.existsSync(DOCS_DIR)) {
        const files = fs.readdirSync(DOCS_DIR);
        for (const file of files) {
            if (file.endsWith('.md')) {
                const fullPath = path.join(DOCS_DIR, file);
                const doc = parseDocFile(fullPath, file.replace(/\.md$/, ''));
                if (doc) docs.push(doc);
            }
        }
    }

    // Scan allowed root docs
    for (const file of ROOT_DOC_FILES) {
        const fullPath = path.join(ROOT_DIR, file);
        if (fs.existsSync(fullPath)) {
            const doc = parseDocFile(fullPath, file.replace(/\.md$/, '').toLowerCase());
            if (doc) docs.push(doc);
        }
    }

    return docs.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
}

export function getDocBySlug(slug: string): WikiDoc | null {
    const allDocs = getAllDocs();
    const normalizedSlug = slug.toLowerCase();
    return allDocs.find(d => d.slug.toLowerCase() === normalizedSlug) || null;
}

function parseDocFile(filePath: string, defaultSlug: string): WikiDoc | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);
        
        // Extract frontmatter
        let frontmatterRaw = '';
        let body = raw;

        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
        if (fmMatch) {
            frontmatterRaw = fmMatch[1];
            body = raw.slice(fmMatch[0].length);
        }

        // Parse key-value frontmatter
        const metadata: Record<string, string> = {};
        if (frontmatterRaw) {
            for (const line of frontmatterRaw.split('\n')) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '');
                    metadata[key] = val;
                }
            }
        }

        // Strip internal review notes and comments
        body = body
            .replace(/<!--\s*internal\s*-->[\s\S]*?<!--\s*\/internal\s*-->/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .trim();

        // Extract title: from frontmatter or first H1
        let title = metadata.title;
        if (!title) {
            const h1Match = body.match(/^#\s+(.+)$/m);
            if (h1Match) {
                title = h1Match[1].trim();
            } else {
                title = defaultSlug
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
            }
        }

        // Extract slug: from frontmatter or default
        const slug = (metadata.slug || defaultSlug).toLowerCase();

        // Last updated date
        const lastUpdated = metadata.lastUpdated || stats.mtime.toISOString().split('T')[0];
        
        // Author
        const author = metadata.author || 'Cybrdeck Architecture Team';

        // Description / excerpt
        const description = metadata.description || body.slice(0, 160).replace(/[#*`_]/g, '').trim() + '...';

        // Check staleness (90 days threshold)
        const updatedTime = new Date(lastUpdated).getTime();
        const now = Date.now();
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const isStale = isNaN(updatedTime) ? false : (now - updatedTime > ninetyDaysMs);

        return {
            slug,
            title,
            description,
            author,
            lastUpdated,
            isStale,
            content: body,
            filePath,
        };
    } catch {
        return null;
    }
}

export function renderMarkdown(markdown: string): React.ReactNode[] {
    const lines = markdown.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent: string[] = [];
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let tableRows: string[][] = [];

    const flushList = () => {
        if (listItems.length > 0 && listType) {
            if (listType === 'ul') {
                elements.push(
                    <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1.5 my-4 text-muted-foreground pl-2">
                        {listItems.map((item, idx) => (
                            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
                        ))}
                    </ul>
                );
            } else {
                elements.push(
                    <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1.5 my-4 text-muted-foreground pl-2">
                        {listItems.map((item, idx) => (
                            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
                        ))}
                    </ol>
                );
            }
            listItems = [];
            listType = null;
        }
    };

    const flushCodeBlock = () => {
        if (inCodeBlock) {
            elements.push(
                <div key={`code-${elements.length}`} className="my-6 rounded-lg overflow-hidden border border-border bg-muted/40">
                    {codeLanguage && (
                        <div className="px-4 py-1.5 bg-muted border-b border-border text-xs font-mono text-muted-foreground uppercase tracking-wider">
                            {codeLanguage}
                        </div>
                    )}
                    <pre className="p-4 font-mono text-sm overflow-x-auto text-foreground leading-relaxed">
                        <code>{codeContent.join('\n')}</code>
                    </pre>
                </div>
            );
            inCodeBlock = false;
            codeContent = [];
            codeLanguage = '';
        }
    };

    const flushTable = () => {
        if (tableRows.length > 0) {
            const header = tableRows[0];
            const body = tableRows.slice(1).filter(row => !row.every(cell => cell.match(/^:?-+:?$/)));
            
            elements.push(
                <div key={`table-${elements.length}`} className="my-6 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-foreground border-b border-border font-medium">
                            <tr>
                                {header.map((cell, idx) => (
                                    <th key={idx} className="px-4 py-3" dangerouslySetInnerHTML={{ __html: formatInline(cell.trim()) }} />
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {body.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                                    {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="px-4 py-3 text-muted-foreground" dangerouslySetInnerHTML={{ __html: formatInline(cell.trim()) }} />
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableRows = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code block toggle
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                flushCodeBlock();
            } else {
                flushList();
                flushTable();
                inCodeBlock = true;
                codeLanguage = line.trim().slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        // Table lines
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            flushList();
            const cells = line.trim().slice(1, -1).split('|');
            tableRows.push(cells);
            continue;
        } else if (tableRows.length > 0) {
            flushTable();
        }

        // Headings
        if (line.startsWith('# ')) {
            flushList();
            const text = line.slice(2).trim();
            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            elements.push(
                <h1 key={i} id={id} className="text-3xl font-bold tracking-tight text-foreground mt-8 mb-4 border-b border-border pb-2">
                    {text}
                </h1>
            );
            continue;
        }
        if (line.startsWith('## ')) {
            flushList();
            const text = line.slice(3).trim();
            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            elements.push(
                <h2 key={i} id={id} className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-3 border-b border-border/50 pb-1.5">
                    {text}
                </h2>
            );
            continue;
        }
        if (line.startsWith('### ')) {
            flushList();
            const text = line.slice(4).trim();
            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            elements.push(
                <h3 key={i} id={id} className="text-xl font-semibold text-foreground mt-6 mb-2">
                    {text}
                </h3>
            );
            continue;
        }
        if (line.startsWith('#### ')) {
            flushList();
            const text = line.slice(5).trim();
            elements.push(
                <h4 key={i} className="text-lg font-medium text-foreground mt-4 mb-2">
                    {text}
                </h4>
            );
            continue;
        }

        // Horizontal rule
        if (line.trim() === '---' || line.trim() === '***') {
            flushList();
            elements.push(<hr key={i} className="my-8 border-border" />);
            continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            flushList();
            const text = line.slice(2).trim();
            elements.push(
                <blockquote key={i} className="my-4 border-l-4 border-primary/60 bg-muted/30 px-4 py-3 rounded-r text-muted-foreground italic">
                    <span dangerouslySetInnerHTML={{ __html: formatInline(text) }} />
                </blockquote>
            );
            continue;
        }

        // Unordered list
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            if (listType !== 'ul') flushList();
            listType = 'ul';
            listItems.push(line.trim().slice(2));
            continue;
        }

        // Ordered list
        const olMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
            if (listType !== 'ol') flushList();
            listType = 'ol';
            listItems.push(olMatch[2]);
            continue;
        }

        // Empty line
        if (line.trim() === '') {
            flushList();
            continue;
        }

        // Normal paragraph
        flushList();
        elements.push(
            <p key={i} className="my-3 text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
        );
    }

    flushList();
    flushCodeBlock();
    flushTable();

    return elements;
}

function formatInline(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-xs border border-border">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline font-medium">$1</a>');
}
