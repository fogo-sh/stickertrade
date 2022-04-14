import { createTable } from "@tanstack/react-table";

import type { Sticker } from "@prisma/client";
import { Table } from "./Table";
import { Serialized } from "~/types";
import { formatDate } from "./tableUtils";

type Row = Pick<Serialized<Sticker>, "name" | "id" | "createdAt" | "updatedAt">;

const table = createTable<{ Row: Row }>();

const defaultColumns = table.createColumns([
  table.createDataColumn("name", {
    cell: (info) => info.value,
  }),
  table.createDataColumn("id", {
    cell: (info) => info.value,
  }),
  table.createDataColumn("createdAt", {
    cell: (info) => formatDate(info.value),
  }),
  table.createDataColumn("updatedAt", {
    cell: (info) => formatDate(info.value),
  }),
]);

export function StickerTable({ stickers }: { stickers: Row[] }) {
  return (
    <Table table={table} data={stickers} defaultColumns={defaultColumns} />
  );
}
