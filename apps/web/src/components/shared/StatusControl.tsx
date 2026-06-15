'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Lock } from 'lucide-react';
import {
    canEditStatus,
    statusRegistry,
    type StatusArtifactType,
} from '@/lib/statusRegistry';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';

const DISABLED_MESSAGE = "You don't have permission to change status";
const MENU_WIDTH = 176;

interface StatusControlProps {
    artifactType: StatusArtifactType;
    artifactId: string;
    value: string;
    canEdit?: boolean;
    hasFallbackPermission?: boolean;
    size?: 'sm' | 'md';
    align?: 'left' | 'right';
    className?: string;
    onOptimisticChange?: (nextStatus: string, previousStatus: string) => void;
    onChangeCommitted?: (nextStatus: string, updated: unknown) => void;
    onChangeRolledBack?: (previousStatus: string, nextStatus: string, error: unknown) => void;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Could not update status';
}

export function StatusControl({
    artifactType,
    artifactId,
    value,
    canEdit,
    hasFallbackPermission = false,
    size = 'sm',
    align = 'right',
    className = '',
    onOptimisticChange,
    onChangeCommitted,
    onChangeRolledBack,
}: StatusControlProps) {
    const entry = statusRegistry[artifactType];
    const [displayValue, setDisplayValue] = useState(value);
    const [menuOpen, setMenuOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const toast = useToast();

    useEffect(() => {
        setDisplayValue(value);
    }, [value]);

    const editable = canEditStatus(canEdit, hasFallbackPermission);
    const normalizedValue = entry.normalize(displayValue);
    const current = entry.getOption(normalizedValue);
    const buttonSize = size === 'md' ? 'px-3 py-1 text-[11px]' : 'px-2 py-0.5 text-xs';

    function updateMenuPosition() {
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const preferredLeft = align === 'right' ? rect.right - MENU_WIDTH : rect.left;
        const left = Math.min(Math.max(8, preferredLeft), window.innerWidth - MENU_WIDTH - 8);
        setMenuPosition({ top: rect.bottom + 6, left });
    }

    function toggleMenu() {
        if (!editable || saving) return;
        setMenuOpen(open => {
            const next = !open;
            if (next) updateMenuPosition();
            return next;
        });
    }

    useEffect(() => {
        if (!menuOpen) return;
        updateMenuPosition();
        const pointerHandler = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
                setMenuOpen(false);
            }
        };
        const keyHandler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        const reposition = () => updateMenuPosition();
        document.addEventListener('mousedown', pointerHandler);
        window.addEventListener('keydown', keyHandler);
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            document.removeEventListener('mousedown', pointerHandler);
            window.removeEventListener('keydown', keyHandler);
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [menuOpen, align]);

    async function applyStatus(nextStatus: string) {
        const normalizedNext = entry.normalize(nextStatus);
        const previousStatus = normalizedValue;
        if (saving || normalizedNext === previousStatus) {
            setMenuOpen(false);
            return;
        }

        const payload = entry.defaultFills?.(normalizedNext, { previousStatus }) || {};
        setMenuOpen(false);
        setSaving(true);
        setDisplayValue(normalizedNext);
        onOptimisticChange?.(normalizedNext, previousStatus);

        try {
            const updated = await entry.update(artifactId, normalizedNext, payload);
            toast.success(`${entry.label} status updated to ${entry.getOption(normalizedNext).label}`);
            onChangeCommitted?.(normalizedNext, updated);
        } catch (error) {
            setDisplayValue(previousStatus);
            onChangeRolledBack?.(previousStatus, normalizedNext, error);
            toast.error(getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    const button = (
        <button
            ref={triggerRef}
            type="button"
            data-testid={`status-control-${artifactId}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={editable ? `Change status, currently ${current.label}` : `Status ${current.label}. ${DISABLED_MESSAGE}`}
            disabled={!editable || saving}
            onClick={toggleMenu}
            className={[
                'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors whitespace-nowrap',
                buttonSize,
                editable
                    ? `${current.pillClass} hover:bg-white dark:hover:bg-slate-700`
                    : 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700 cursor-not-allowed opacity-70',
                className,
            ].join(' ')}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${editable ? current.dotClass : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden />
            <span>{current.label}</span>
            {saving ? (
                <Loader2 className="w-3 h-3 animate-spin text-current opacity-80" aria-hidden />
            ) : editable ? (
                <ChevronDown className="w-3 h-3 text-current opacity-60" aria-hidden />
            ) : (
                <Lock className="w-3 h-3 text-current opacity-60" aria-hidden />
            )}
        </button>
    );

    return (
        <span className="relative inline-flex" data-testid={editable ? undefined : `status-control-disabled-${artifactId}`}>
            {editable ? button : (
                <SimpleTooltip content={DISABLED_MESSAGE} position="top">
                    <span className="inline-flex cursor-not-allowed">{button}</span>
                </SimpleTooltip>
            )}
            {menuOpen && menuPosition && typeof document !== 'undefined' && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    data-testid={`status-control-menu-${artifactId}`}
                    className="fixed z-[9998] w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                    {entry.statuses.map(status => {
                        const option = entry.getOption(status);
                        const selected = option.value === normalizedValue;
                        return (
                            <button
                                key={option.value}
                                role="menuitem"
                                type="button"
                                onClick={() => applyStatus(option.value)}
                                className={[
                                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800',
                                    selected ? 'font-semibold' : '',
                                ].join(' ')}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${option.dotClass}`} aria-hidden />
                                <span className="flex-1">{option.label}</span>
                                {selected && <Check className="w-3 h-3 text-indigo-500" aria-hidden />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </span>
    );
}
