import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortState = { field: string; dir: "asc" | "desc" };

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  render: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

export type Pagination = {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
};

export type AdminTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  tableLabel?: string;
  totalRows?: number;
  pageSize?: number;
  sortHref?: (field: string, dir: "asc" | "desc") => string;
  sort?: SortState;
  emptyMessage?: string;
  emptyClassName?: string;
  pagination?: Pagination;
  rowClassName?: string;
  containerClassName?: string;
};

const DEFAULT_CONTAINER =
  "mt-4 overflow-hidden";
const DEFAULT_EMPTY = "px-4 py-8 text-center text-sm text-slate-400";

export function AdminTable<T>(props: AdminTableProps<T>) {
  const {
    rows,
    columns,
    rowKey,
    title,
    description,
    actions,
    filters,
    tableLabel,
    totalRows,
    pageSize,
    sortHref,
    sort,
    emptyMessage,
    emptyClassName,
    pagination,
    rowClassName,
    containerClassName,
  } = props;

  const total = totalRows ?? rows.length;
  const currentPage = pagination?.page ?? 1;
  const perPage = pageSize ?? rows.length;
  const firstRow = rows.length > 0 && perPage > 0 ? (currentPage - 1) * perPage + 1 : 0;
  const lastRow = rows.length > 0 ? firstRow + rows.length - 1 : 0;
  const hasHeader = title || description || actions || totalRows !== undefined;

  return (
    <Card className={containerClassName ?? DEFAULT_CONTAINER}>
      {hasHeader && (
        <CardHeader className="border-b bg-muted/40 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
            {totalRows !== undefined && (
              <p className="mt-2 text-xs font-medium text-slate-500">
                {rows.length > 0
                  ? `Showing ${firstRow}-${lastRow} of ${total}`
                  : `0 of ${total}`}
              </p>
            )}
          </div>
          {actions && <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">{actions}</div>}
        </CardHeader>
      )}

      {filters && <div className="border-b bg-background px-4 py-4">{filters}</div>}

      <CardContent className="p-0">
        <Table aria-label={tableLabel}>
          <TableHeader className="bg-background text-xs uppercase tracking-wide">
            <TableRow>
              {columns.map((col) => {
                const alignClass = col.align === "right" ? "text-right" : "";
                const baseTh = cn("px-4 py-3", alignClass, col.headerClassName);
                if (col.sortable && sortHref) {
                  const nextDir: "asc" | "desc" =
                    sort?.field === col.key && sort.dir === "desc" ? "asc" : "desc";
                  const active = sort?.field === col.key;
                  return (
                    <TableHead
                      key={col.key}
                      className={baseTh}
                      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
                    >
                      <Link
                        href={sortHref(col.key, nextDir)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-100 hover:text-slate-900",
                          active && "bg-slate-100 text-slate-900",
                        )}
                      >
                        {col.header}
                        <span className="text-slate-400">{active ? (sort.dir === "desc" ? "↓" : "↑") : "↕"}</span>
                      </Link>
                    </TableHead>
                  );
                }
                return (
                  <TableHead key={col.key} className={baseTh}>
                    {col.header}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className={rowClassName ?? "transition-colors hover:bg-slate-50"}>
                {columns.map((col) => {
                  const alignClass = col.align === "right" ? "text-right" : "";
                  const baseTd = cn("px-4 py-3 align-middle", alignClass, col.cellClassName);
                  return (
                    <TableCell key={col.key} className={baseTd}>
                      {col.render(row)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className={emptyClassName ?? DEFAULT_EMPTY}>
                  {emptyMessage ?? "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {pagination && pagination.totalPages > 1 && (
        <CardFooter className="flex items-center justify-between border-t bg-muted/40 px-4 py-3 text-sm text-slate-600">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={pagination.page <= 1}>
              <Link
                href={pagination.buildHref(Math.max(1, pagination.page - 1))}
                aria-disabled={pagination.page <= 1}
                className={pagination.page <= 1 ? "pointer-events-none" : undefined}
              >
                ← Prev
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages}>
              <Link
                href={pagination.buildHref(Math.min(pagination.totalPages, pagination.page + 1))}
                aria-disabled={pagination.page >= pagination.totalPages}
                className={pagination.page >= pagination.totalPages ? "pointer-events-none" : undefined}
              >
                Next →
              </Link>
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
