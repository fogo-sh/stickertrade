import type { User } from "@prisma/client";
import { Table } from "./Table";
import { formatDate } from "./tableUtils";
import type { Serialized } from "~/types";
import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { ClipboardCopyIcon } from "@heroicons/react/solid";

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
          <a href={`/profile/${info.row.getValue("username")}`}>
            <img
              src={info.getValue() ?? "/images/default-avatar.webp"}
              alt="TODO"
              className="h-16 w-16 mx-auto object-cover"
            />
          </a>
        ),
      }),
      columnHelper.accessor("username", {
        cell: (info) => (
          <a className="underline" href={`/profile/${info.getValue()}`}>
            {info.getValue()}
          </a>
        ),
      }),
      columnHelper.accessor("id", {
        cell: (info) => (
          <button
            className="button-light items-center flex gap-x-2"
            onClick={() =>
              window.navigator.clipboard.writeText(info.getValue())
            }
          >
            <ClipboardCopyIcon className="h-5" />
            copy id
          </button>
        ),
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
