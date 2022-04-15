import type { Sticker, User } from "@prisma/client";
import { Link } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { StickerCard } from "~/components/StickerCard";
import { UploadStickerCard } from "~/components/UploadStickerCard";
import { UserCard } from "~/components/UserCard";
import type { RootOutletContext } from "~/root";
import { db } from "~/utils/db.server";
import { imageUrlHandler } from "~/utils/files.server";

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

  stickers.map(
    (sticker) => (sticker.imageUrl = imageUrlHandler(sticker.imageUrl))
  );

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
    <main>
      <p className="text-lg font-semibold my-4">recently posted stickers</p>
      <div className="flex flex-wrap gap-x-6 gap-y-6">
        {stickers.map((sticker) => (
          <StickerCard key={sticker.id} sticker={sticker} />
        ))}
        {currentUser && <UploadStickerCard />}
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
    </main>
  );
}
