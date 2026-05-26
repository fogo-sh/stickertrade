import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  Outlet,
  useLoaderData,
  useOutletContext,
} from "@remix-run/react";
import invariant from "tiny-invariant";
import type { Sticker, User } from "@prisma/client";
import { XCircleIcon } from "@heroicons/react/24/solid";

import { db } from "~/utils/db.server";
import { imageUrlHandler } from "~/utils/files.server";

import type { RootOutletContext } from "~/root";

import { StickerCard } from "~/components/StickerCard";
import { UploadStickerCard } from "~/components/UploadStickerCard";

type PartialSticker = Pick<Sticker, "id" | "name" | "imageUrl">;

type LoaderData = Pick<User, "username" | "avatarUrl"> & {
  stickers: PartialSticker[];
};

export const meta: MetaFunction = ({ data }) => {
  if (data === undefined) return {};
  const { username, avatarUrl } = data as LoaderData;
  return {
    title: `stickertrade - ${username}`,
    "og:image": avatarUrl,
  };
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
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (user === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }

  user.stickers.map(
    (sticker) => (sticker.imageUrl = imageUrlHandler(sticker.imageUrl))
  );

  const data: LoaderData = user;
  return json(data);
};

export default function Profile() {
  const { user: currentUser } = useOutletContext<RootOutletContext>();
  const user = useLoaderData<LoaderData>();

  return (
    <main>
      <Outlet />
      <div className="flex flex-col items-center gap-2 w-52 mt-4 mx-auto">
        <img
          className="w-[6em] rounded-full object-cover"
          src={user.avatarUrl ?? "/images/default-avatar.webp"}
          alt={user.username}
        />
        <h1 className="text-2xl mb-2">{user.username}</h1>
      </div>
      <p className="text-lg font-semibold my-4">stickers</p>
      {user.stickers.length === 0 && <p className="italic mb-3">no stickers</p>}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {currentUser?.username === user.username && <UploadStickerCard />}
        {user.stickers.map((sticker) => (
          <div key={sticker.id} className="h-[15.75rem] w-48">
            {currentUser?.username === user.username && (
              <div className="relative">
                <Link to={`./remove-sticker/${sticker.id}`}>
                  <div className="absolute right-0 p-1">
                    <XCircleIcon className="text-light-500 stroke-dark-500 h-6 w-6" />
                  </div>
                </Link>
              </div>
            )}
            <StickerCard
              sticker={{ ...sticker, owner: user }}
              showOwner={false}
            />
          </div>
        ))}
      </div>
    </main>
  );
}
