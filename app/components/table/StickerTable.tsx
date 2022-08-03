import { createColumnHelper } from "@tanstack/react-table";

import type { Sticker, User } from "@prisma/client";
import { Table } from "./Table";
import type { Serialized } from "~/types";
import { formatDate } from "./tableUtils";
import { useMemo } from "react";

type Row = Pick<
  Serialized<Sticker>,
  "imageUrl" | "name" | "id" | "createdAt" | "updatedAt" | "ownerId"
> & { owner: Pick<User, "id" | "username" | "avatarUrl"> | null } & {
  checked: boolean;
};

const columnHelper = createColumnHelper<Row>();

export function StickerTable({
  stickers,
  onCheckSticker,
}: {
  stickers: Row[];
  onCheckSticker: (row: Row) => void;
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
                onCheckSticker(info.row.original);
              }
            }}
          />
        ),
      }),
      columnHelper.accessor("imageUrl", {
        cell: (info) => (
          <img
            src={info.getValue()}
            alt="TODO"
            className="h-16 w-16 mx-auto object-cover"
          />
        ),
      }),
      columnHelper.accessor("name", {
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("id", {
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("owner", {
        cell: (info) => (
          <img
            src={info.getValue()?.avatarUrl ?? "/images/default-avatar.webp"}
            alt="TODO"
            className="h-16 w-16 mx-auto object-cover"
          />
        ),
      }),
      columnHelper.accessor("ownerId", {
        cell: (info) => info.getValue() ?? "null",
      }),
      columnHelper.accessor("createdAt", {
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor("updatedAt", {
        cell: (info) => formatDate(info.getValue()),
      }),
    ],
    [onCheckSticker]
  );

  return <Table data={stickers} columns={columns} />;
}
