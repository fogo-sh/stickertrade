import { createTable } from "@tanstack/react-table";

import type { User } from "@prisma/client";
import { Table } from "./Table";
import { formatDate } from "./tableUtils";
import { Serialized } from "~/types";

type Row = Pick<
  Serialized<User>,
  "avatarUrl" | "username" | "id" | "role" | "createdAt" | "updatedAt"
>;

const table = createTable<{ Row: Row }>();

const defaultColumns = table.createColumns([
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
]);

export function UserTable({ users }: { users: Row[] }) {
  return <Table table={table} data={users} defaultColumns={defaultColumns} />;
}
