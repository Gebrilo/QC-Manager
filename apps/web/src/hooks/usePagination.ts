import { useState, useEffect } from 'react';

export function usePagination(totalItems: number, pageSize: number = 10) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [totalItems]);

  return {
    currentPage,
    totalPages,
    goToPrev: () => setCurrentPage(p => Math.max(1, p - 1)),
    goToNext: () => setCurrentPage(p => Math.min(totalPages, p + 1)),
    slice: <T>(items: T[]): T[] =>
      items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
  };
}
