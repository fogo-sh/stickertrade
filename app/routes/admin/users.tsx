import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useSearchParams } from "@remix-run/react";

import type { User } from "@prisma/client";
import { db } from "~/utils/db.server";
import type { Serialized } from "~/types";
import { UserTable } from "~/components/table/UserTable";
import {
  ArrowCircleLeftIcon,
  ArrowCircleRightIcon,
} from "@heroicons/react/solid";
import { useMemo, useState } from "react";
import { ensureAdmin } from "~/utils/perms.server";
import { Select } from "~/components/Select";

type LoaderData = Pick<
  User,
  "avatarUrl" | "username" | "id" | "role" | "createdAt" | "updatedAt"
>[];

type SerializedLoaderData = Serialized<LoaderData>;

export const loader: LoaderFunction = async ({ request }) => {
  await ensureAdmin(request);

  const url = new URL(request.url);
  const take = 30;

  const page = Number(url.searchParams.get("page") || "0");
  const skip = page * take;

  const data: LoaderData = await db.user.findMany({
    take,
    skip,
    select: {
      avatarUrl: true,
      username: true,
      id: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "asc",
    },
  });

  return json(data);
};

type CheckableUser = SerializedLoaderData[number] & { checked: boolean };
type CheckedUser = CheckableUser & { checked: true };

export type ContextType = { checkedUsers: CheckedUser[] };

export const actions = ["remove"] as const;
const actionOptions = actions.map((action) => ({ name: action }));

export default function Admin() {
  const users = useLoaderData<SerializedLoaderData>();

  const [checkedUserIds, setCheckedUserIds] = useState<string[]>([]);

  const usersWithCheckedState = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        checked: checkedUserIds.includes(user.id),
      })),
    [checkedUserIds, users]
  );

  /*
    TODO instead of filtering out users, when a user is checked
    they should be added to a list of checked users, such that
    when you go from one page to another you don't lose your
    previously checked users
  */

  const checkedUsers = useMemo(
    () => users.filter((user) => checkedUserIds.includes(user.id)),
    [checkedUserIds, users]
  );

  const [selectedAction, setSelectedAction] = useState<{ name: string }>(
    actionOptions[0]
  );

  const [params] = useSearchParams();
  const page = Number(params.get("page") || "0");

  return (
    <>
      <Outlet context={{ checkedUsers } as { checkedUsers: CheckedUser[] }} />

      <div className="flex gap-2 items-center justify-end">
        <p>actions for selected:</p>
        <div className="w-[10rem]">
          <Select
            options={actionOptions}
            selected={selectedAction}
            setSelected={setSelectedAction}
          />
        </div>
        <Link to="remove">
          <button className="button-light">perform</button>
        </Link>
      </div>

      <div className="flex gap-2 items-center">
        <p className="text-lg font-semibold">users (page {page})</p>
        {page > 0 && (
          <Link to={`?page=${page - 1}`}>
            <ArrowCircleLeftIcon className="h-6 w-6" />
          </Link>
        )}
        {users.length !== 0 && (
          <Link to={`?page=${page + 1}`}>
            <ArrowCircleRightIcon className="h-6 w-6" />
          </Link>
        )}
      </div>

      <UserTable
        users={usersWithCheckedState}
        onCheckUser={(user: CheckableUser) => {
          setCheckedUserIds((checkedUserIds) => {
            if (checkedUserIds.includes(user.id)) {
              return checkedUserIds.filter((id) => id !== user.id);
            } else {
              return [...checkedUserIds, user.id];
            }
          });
        }}
      />
    </>
  );
}
