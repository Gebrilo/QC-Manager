import React from 'react';

type Block =
    | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'unordered'; items: string[] }
    | { type: 'ordered'; items: string[] }
    | { type: 'code'; text: string };

function flushParagraph(blocks: Block[], lines: string[]) {
    if (lines.length === 0) return;
    blocks.push({ type: 'paragraph', text: lines.join(' ') });
    lines.length = 0;
}

function parseMarkdown(markdown: string): Block[] {
    const blocks: Block[] = [];
    const paragraph: string[] = [];
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph(blocks, paragraph);
            index += 1;
            continue;
        }

        if (trimmed.startsWith('```')) {
            flushParagraph(blocks, paragraph);
            index += 1;
            const codeLines: string[] = [];
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                codeLines.push(lines[index]);
                index += 1;
            }
            if (index < lines.length) index += 1;
            blocks.push({ type: 'code', text: codeLines.join('\n') });
            continue;
        }

        const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
            flushParagraph(blocks, paragraph);
            blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
            index += 1;
            continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
            flushParagraph(blocks, paragraph);
            const items: string[] = [];
            while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
                index += 1;
            }
            blocks.push({ type: 'unordered', items });
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            flushParagraph(blocks, paragraph);
            const items: string[] = [];
            while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
                index += 1;
            }
            blocks.push({ type: 'ordered', items });
            continue;
        }

        paragraph.push(trimmed);
        index += 1;
    }

    flushParagraph(blocks, paragraph);
    return blocks;
}

function safeHref(href: string) {
    if (href.startsWith('/') || href.startsWith('#')) return href;
    try {
        const parsed = new URL(href);
        if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return href;
    } catch {
        return null;
    }
    return null;
}

function renderInline(text: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

        if (match[2]) {
            nodes.push(<strong key={match.index}>{match[2]}</strong>);
        } else if (match[3]) {
            nodes.push(<code key={match.index}>{match[3]}</code>);
        } else if (match[4] && match[5]) {
            const href = safeHref(match[5]);
            nodes.push(href ? (
                <a key={match.index} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                    {match[4]}
                </a>
            ) : match[4]);
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
}

export function MarkdownContent({ content, compact = false }: { content: string; compact?: boolean }) {
    const blocks = parseMarkdown(content || '');

    if (blocks.length === 0) {
        return <p className="text-sm text-slate-500 dark:text-slate-400">No content.</p>;
    }

    return (
        <div className={compact ? 'space-y-2 landing-markdown compact' : 'space-y-4 landing-markdown'}>
            {blocks.map((block, index) => {
                if (block.type === 'heading') {
                    const className = "font-semibold text-slate-900 dark:text-white";
                    if (block.level <= 1) return <h3 key={index} className={className}>{renderInline(block.text)}</h3>;
                    if (block.level === 2) return <h4 key={index} className={className}>{renderInline(block.text)}</h4>;
                    if (block.level === 3) return <h5 key={index} className={className}>{renderInline(block.text)}</h5>;
                    return <h6 key={index} className={className}>{renderInline(block.text)}</h6>;
                }

                if (block.type === 'paragraph') {
                    return (
                        <p key={index} className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {renderInline(block.text)}
                        </p>
                    );
                }

                if (block.type === 'unordered') {
                    return (
                        <ul key={index} className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
                        </ul>
                    );
                }

                if (block.type === 'ordered') {
                    return (
                        <ol key={index} className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
                        </ol>
                    );
                }

                return (
                    <pre key={index} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                        <code>{block.text}</code>
                    </pre>
                );
            })}
        </div>
    );
}
