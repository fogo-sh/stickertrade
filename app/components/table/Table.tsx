import React from "react";
import { useTable } from "@tanstack/react-table";
import type { Table as ReactTable } from "@tanstack/react-table";

// TODO fix usage of any
export function Table({
  table,
  data,
  defaultColumns,
}: {
  table: ReactTable<any>;
  data: any;
  defaultColumns: any;
}) {
  const [columns] = React.useState<typeof defaultColumns>(() => [
    ...defaultColumns,
  ]);

  const instance = useTable(table, {
    data,
    columns,
  });

  return (
    <div className="p-2">
      <table
        {...instance.getTableProps()}
        className="w-full border border-light-500 border-opacity-50"
      >
        <thead>
          {instance.getHeaderGroups().map((headerGroup) => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((header) => (
                <th {...header.getHeaderProps()} className="px-2 py-1">
                  {header.isPlaceholder ? null : header.renderHeader()}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...instance.getTableBodyProps()}>
          {instance.getRowModel().rows.map((row) => (
            <tr
              {...row.getRowProps()}
              className="border-t border-light-500 border-opacity-50"
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  {...cell.getCellProps()}
                  className="px-2 py-1 border-l border-light-500 border-opacity-50"
                >
                  {cell.renderCell()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
