import { json, useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import invariant from "tiny-invariant";
import type { Sticker, User } from "@prisma/client";
import { db } from "~/utils/db.server";
import { StickerCard } from "~/components/StickerCard";

type LoaderData = Pick<User, "username" | "avatarUrl"> & {
  stickers: Pick<Sticker, "id" | "name" | "imageUrl">[];
};

export const loader: LoaderFunction = async ({ params }) => {
  invariant(params.username, "expected params.username");
  const user = await db.user.findUnique({
    where: { username: params.username },
    select: {
      username: true,
      avatarUrl: true,
      stickers: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  if (user === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }

  const data: LoaderData = user;
  return json(data);
};

export default function Profile() {
  const user = useLoaderData<LoaderData>();

  return (
    <main>
      <div className="flex flex-col items-center gap-2 w-52 mt-4 mx-auto">
        <img
          className="w-[6em] rounded-full"
          src={user.avatarUrl ?? "/images/default-avatar.webp"}
          alt={user.username}
        />
        <h1 className="text-2xl mb-2">{user.username}</h1>
      </div>
      <p className="text-lg font-semibold my-4">stickers</p>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {user.stickers.map((sticker) => (
          <StickerCard
            key={sticker.id}
            sticker={{ ...sticker, owner: user }}
            showOwner={false}
          />
        ))}
      </div>
    </main>
  );
}
