import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import invariant from "tiny-invariant";
import { Link } from "@remix-run/react";
import { db } from "~/utils/db.server";
import type { Sticker, User } from "@prisma/client";
import { UserCard } from "~/components/UserCard";
import { imageUrlHandler } from "~/utils/files.server";

type LoaderData = Pick<Sticker, "name" | "imageUrl"> & {
  owner: Pick<User, "username" | "avatarUrl"> | null;
};

export const loader: LoaderFunction = async ({ params }) => {
  invariant(params.id, "expected params.username");
  const sticker = await db.sticker.findUnique({
    where: { id: params.id },
    select: {
      name: true,
      imageUrl: true,
      owner: {
        select: {
          username: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (sticker === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }

  sticker.imageUrl = imageUrlHandler(sticker.imageUrl);

  const data: LoaderData = sticker;
  return json(data);
};

export default function StickerPage() {
  const sticker = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto">
      <div className="flex flex-col items-center gap-2 w-64 mt-4 mx-auto">
        <img
          className="w-full border-2 border-light-500 border-opacity-25"
          src={sticker.imageUrl}
          alt={sticker.name}
        />
        <h1 className="text-xl my-2 text-center">{sticker.name}</h1>
      </div>
      {sticker.owner !== null && (
        <div className="text-[0.8rem] mt-2">
          <div className="flex justify-center items-center gap-3.5">
            <h2 className="text-[1.3em]">owned by</h2>
            <Link
              to={`/profile/${sticker.owner.username}`}
              className="hover:underline"
            >
              <UserCard user={sticker.owner} />
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
