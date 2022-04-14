import { createTable } from "@tanstack/react-table";

import type { Sticker } from "@prisma/client";
import { Table } from "./Table";
import { Serialized } from "~/types";
import { formatDate } from "./tableUtils";

type Row = Pick<
  Serialized<Sticker>,
  "imageUrl" | "name" | "id" | "createdAt" | "updatedAt"
>;

const table = createTable<{ Row: Row }>();

const defaultColumns = table.createColumns([
  table.createDataColumn("imageUrl", {
    cell: (info) => (
      <img src={info.value} alt="TODO" className="h-16 w-16 mx-auto" />
    ),
  }),
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
