export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "データがありません",
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-3 text-left font-semibold text-neutral-600 ${
                  c.className ?? ""
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-neutral-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={
                  onRowClick
                    ? "cursor-pointer hover:bg-brand/5"
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 text-neutral-800 ${c.className ?? ""}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
