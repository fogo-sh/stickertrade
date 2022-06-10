import { createTable } from "@tanstack/react-table";

import type { User } from "@prisma/client";
import { Table } from "./Table";
import { formatDate } from "./tableUtils";
import { Serialized } from "~/types";
import { useMemo } from "react";

type Row = Pick<
  Serialized<User>,
  "avatarUrl" | "username" | "id" | "role" | "createdAt" | "updatedAt"
> & { checked: boolean };

const table = createTable<{ Row: Row }>();

export function UserTable({
  users,
  onCheckUser,
}: {
  users: Row[];
  onCheckUser: (row: Row) => void;
}) {
  const defaultColumns = useMemo(
    () =>
      table.createColumns([
        table.createDataColumn("checked", {
          header: "",
          cell: (info) => (
            <input
              type="checkbox"
              checked={info.value}
              className="mx-auto"
              onChange={() => {
                if (info.row.original) {
                  onCheckUser(info.row.original);
                }
              }}
            />
          ),
        }),
        table.createDataColumn("avatarUrl", {
          cell: (info) => (
            <img
              src={info.value ?? "/images/default-avatar.webp"}
              alt="TODO"
              className="h-16 w-16 mx-auto"
            />
          ),
        }),
        table.createDataColumn("username", {
          cell: (info) => info.value,
        }),
        table.createDataColumn("id", {
          cell: (info) => info.value,
        }),
        table.createDataColumn("role", {
          cell: (info) => info.value,
        }),
        table.createDataColumn("createdAt", {
          cell: (info) => formatDate(info.value),
        }),
        table.createDataColumn("updatedAt", {
          cell: (info) => formatDate(info.value),
        }),
      ]),
    [onCheckUser]
  );

  return <Table table={table} data={users} defaultColumns={defaultColumns} />;
}
