interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  testIdPrefix: string;
}

export function Pagination({ currentPage, totalPages, onPrev, onNext, testIdPrefix }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div
      data-testid={`${testIdPrefix}-pagination`}
      className="flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-800"
    >
      <button
        data-testid={`${testIdPrefix}-prev-btn`}
        onClick={onPrev}
        disabled={currentPage === 1}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Previous
      </button>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Page {currentPage} of {totalPages}
      </span>
      <button
        data-testid={`${testIdPrefix}-next-btn`}
        onClick={onNext}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}
