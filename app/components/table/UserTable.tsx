import type { User } from "@prisma/client";
import { Table } from "./Table";
import { formatDate } from "./tableUtils";
import type { Serialized } from "~/types";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";

type Row = Pick<
  Serialized<User>,
  "avatarUrl" | "username" | "id" | "role" | "createdAt" | "updatedAt"
> & { checked: boolean };

const columnHelper = createColumnHelper<Row>();

export function UserTable({
  users,
  onCheckUser,
}: {
  users: Row[];
  onCheckUser: (row: Row) => void;
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("checked", {
        header: "",
        cell: (info) => (
          <input
            type="checkbox"
            checked={info.getValue()}
            className="mx-auto"
            onChange={() => {
              if (info.row.original) {
                onCheckUser(info.row.original);
              }
            }}
          />
        ),
      }),
      columnHelper.accessor("avatarUrl", {
        cell: (info) => (
          <img
            src={info.getValue() ?? "/images/default-avatar.webp"}
            alt="TODO"
            className="h-16 w-16 mx-auto object-cover"
          />
        ),
      }),
      columnHelper.accessor("username", {
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("id", {
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("role", {
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("createdAt", {
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor("updatedAt", {
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    [onCheckUser]
  );

  return <Table data={users} columns={columns} />;
}
