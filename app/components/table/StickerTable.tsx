import { createColumnHelper } from "@tanstack/react-table";

import type { Sticker } from "@prisma/client";
import { Table } from "./Table";
import type { Serialized } from "~/types";
import { formatDate } from "./tableUtils";

type Row = Pick<
  Serialized<Sticker>,
  "imageUrl" | "name" | "id" | "createdAt" | "updatedAt"
>;

const columnHelper = createColumnHelper<Row>();

const columns = [
  columnHelper.accessor("imageUrl", {
    cell: (info) => (
      <img src={info.getValue()} alt="TODO" className="h-16 w-16 mx-auto" />
    ),
  }),
  columnHelper.accessor("name", {
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("id", {
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("createdAt", {
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("updatedAt", {
    cell: (info) => formatDate(info.getValue()),
  }),
];

export function StickerTable({ stickers }: { stickers: Row[] }) {
  return <Table data={stickers} columns={columns} />;
}
