import { json, LoaderFunction } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";

import { User } from "@prisma/client";
import { db } from "~/utils/db.server";
import { Serialized } from "~/types";
import { UserTable } from "~/components/table/UserTable";
import {
  ArrowCircleLeftIcon,
  ArrowCircleRightIcon,
} from "@heroicons/react/solid";
import { useState } from "react";
import { ensureAdmin } from "~/utils/perms.server";

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
  });

  return json(data);
};

type CheckedUsers = (SerializedLoaderData[number] & { checked: boolean })[];

export default function Admin() {
  const users = useLoaderData<SerializedLoaderData>();

  const [checkedUsers, setCheckedUsers] = useState<CheckedUsers>(() => {
    return users.map((user) => ({ ...user, checked: false }));
  });

  const [params] = useSearchParams();
  const page = Number(params.get("page") || "0");

  return (
    <>
      <div className="flex gap-2 items-center justify-end">
        <p>actions for selected:</p>
        <Link to="remove">
          <button className="button-light">remove</button>
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
        users={checkedUsers}
        onCheckUser={(user: CheckedUsers[number]) => {
          setCheckedUsers((prevCheckedUsers) =>
            prevCheckedUsers.map((checkedUser) =>
              checkedUser.id === user.id
                ? { ...checkedUser, checked: !checkedUser.checked }
                : checkedUser
            )
          );
        }}
      />
    </>
  );
}