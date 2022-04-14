import {
  ActionFunction,
  json,
  Link,
  LoaderFunction,
  useLoaderData,
  useSearchParams,
} from "remix";

import { Sticker, User } from "@prisma/client";
import { redirect } from "remix";
import { db } from "~/utils/db.server";
import { getUser } from "~/utils/session.server";
import { Serialized, USER_ROLE } from "~/types";
import { UserTable } from "~/components/table/UserTable";
import { StickerTable } from "~/components/table/StickerTable";
import {
  ArrowCircleLeftIcon,
  ArrowCircleRightIcon,
} from "@heroicons/react/solid";

const ensureAdmin = async (request: Request) => {
  const user = await getUser(request);

  if (!user) {
    throw redirect("/login");
  }

  if (user.role !== USER_ROLE.ADMIN) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }
};

type LoaderData = {
  users: User[];
  stickers: Sticker[];
};

type SerializedLoaderData = Serialized<LoaderData>;

export const loader: LoaderFunction = async ({ request }) => {
  await ensureAdmin(request);

  const url = new URL(request.url);
  const take = 30;

  const userPage = Number(url.searchParams.get("userPage") || "0");
  const userSkip = userPage * take;

  const stickerPage = Number(url.searchParams.get("stickerPage") || "0");
  const stickerSkip = stickerPage * take;

  const data: LoaderData = {
    users: await db.user.findMany({ take, skip: userSkip }),
    stickers: await db.sticker.findMany({ take, skip: stickerSkip }),
  };
  return json(data);
};

export const action: ActionFunction = async ({ request }) => {
  await ensureAdmin(request);

  // wa

  return redirect("/admin");
};

export default function Admin() {
  const { users, stickers } = useLoaderData<SerializedLoaderData>();
  const [params] = useSearchParams();
  const userPage = Number(params.get("userPage") || "0");
  const stickerPage = Number(params.get("stickerPage") || "0");

  return (
    <main>
      <h1 className="text-2xl mb-4 text-center">admin</h1>
      <div className="flex gap-2 items-center">
        <p className="text-lg font-semibold">users (page {userPage})</p>
        {userPage > 0 && (
          <Link to={`?stickerPage=${stickerPage}&userPage=${userPage - 1}`}>
            <ArrowCircleLeftIcon className="h-6 w-6" />
          </Link>
        )}
        {users.length !== 0 && (
          <Link to={`?stickerPage=${stickerPage}&userPage=${userPage + 1}`}>
            <ArrowCircleRightIcon className="h-6 w-6" />
          </Link>
        )}
      </div>
      <UserTable users={users} />
      <div className="flex gap-2 items-center">
        <p className="text-lg font-semibold">stickers (page {stickerPage})</p>
        {stickerPage > 0 && (
          <Link to={`?stickerPage=${stickerPage - 1}&userPage=${userPage}`}>
            <ArrowCircleLeftIcon className="h-6 w-6" />
          </Link>
        )}
        {stickers.length !== 0 && (
          <Link to={`?stickerPage=${stickerPage + 1}&userPage=${userPage}`}>
            <ArrowCircleRightIcon className="h-6 w-6" />
          </Link>
        )}
      </div>
      <StickerTable stickers={stickers} />
    </main>
  );
}
