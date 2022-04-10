import type { Sticker, User } from "@prisma/client";
import { Link } from "react-router-dom";
import type { LoaderFunction } from "remix";
import { json, useLoaderData, useOutletContext } from "remix";
import { StickerCard } from "~/components/StickerCard";
import { UploadStickerCard } from "~/components/UploadStickerCard";
import { UserCard } from "~/components/UserCard";
import type { RootOutletContext } from "~/root";
import { db } from "~/utils/db.server";

type LoaderData = {
  users: Pick<User, "id" | "username" | "avatarUrl">[];
  stickers: (Pick<Sticker, "id" | "name" | "imageUrl"> & {
    owner: Pick<User, "id" | "username" | "avatarUrl"> | null;
  })[];
};

export const loader: LoaderFunction = async () => {
  const users = await db.user.findMany({
    take: 8,
    select: { id: true, username: true, avatarUrl: true },
  });

  const stickers = await db.sticker.findMany({
    take: 12,
    select: {
      id: true,
      name: true,
      imageUrl: true,
      owner: {
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data: LoaderData = {
    users,
    stickers,
  };
  return json(data);
};

export default function Index() {
  const { user: currentUser } = useOutletContext<RootOutletContext>();
  const { users, stickers } = useLoaderData<LoaderData>();

  return (
    <>
      <div className="flex flex-col items-center">
        <p className="text-primary-500 text-xl mx-2 mb-1">
          WARNING:
          <br />
          this site is currently in a pre-pre-pre-alpha state
          <br />
          while there is UI here, it is more of a proof of concept currently
          <br />
          <span className="opacity-50">coming soooooooon.....</span>
        </p>
      </div>
      <p className="text-lg font-semibold my-4">recently posted stickers</p>
      <div className="flex flex-wrap gap-x-6 gap-y-6">
        {currentUser && <UploadStickerCard />}
        {stickers.map((sticker) => (
          <StickerCard key={sticker.id} sticker={sticker} />
        ))}
      </div>
      <p className="text-lg font-semibold mt-12 mb-4">recently active users</p>
      <div className="flex flex-wrap gap-8">
        {users.map((user) => (
          <Link
            key={user.id}
            to={`/profile/${user.username}`}
            className="hover:underline"
          >
            <UserCard user={user} />
          </Link>
        ))}
      </div>
    </>
  );
}
