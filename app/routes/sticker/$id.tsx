import { json, useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import invariant from "tiny-invariant";
import { db } from "~/utils/db.server";
import { Sticker } from "@prisma/client";

type LoaderData = Pick<Sticker, "name" | "imageUrl">;

export const loader: LoaderFunction = async ({ params }) => {
  invariant(params.id, "expected params.username");
  const user = await db.sticker.findUnique({
    where: { id: params.id },
    select: {
      name: true,
      imageUrl: true,
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

export default function StickerPage() {
  const sticker = useLoaderData<LoaderData>();

  return (
    <main>
      <div className="flex flex-col items-center gap-2 w-52 mt-4 mx-auto">
        <img
          className="w-[20em] border-2 border-light-500 border-opacity-25"
          src={sticker.imageUrl}
          alt={sticker.name}
        />
        <h1 className="text-xl my-2">{sticker.name}</h1>
      </div>
    </main>
  );
}
