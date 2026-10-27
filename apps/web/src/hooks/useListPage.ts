import { useState } from 'react'
export function useListPage<T>(items: T[], filterKey: string) {
  const [pageSize, setPageSize] = useState(10)
  const [position, setPosition] = useState({ key: filterKey, page: 1 })
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = position.key === filterKey ? Math.min(position.page, pages) : 1
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    pageSize,
    total: items.length,
    onPageChange: (next: number) => setPosition({ key: filterKey, page: next }),
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPosition({ key: filterKey, page: 1 })
    }
  }
}
