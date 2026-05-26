import { useLoaderData } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { Sticker, User } from "@prisma/client";
import { db } from "~/utils/db.server";
import { imageUrlHandler } from "~/utils/files.server";
import { StickerCard } from "~/components/StickerCard";

type LoaderData = {
  stickers: (Pick<Sticker, "id" | "name" | "imageUrl"> & {
    owner: Pick<User, "id" | "username" | "avatarUrl"> | null;
  })[];
};

const getPage = (searchParams: URLSearchParams) =>
  Number(searchParams.get("page") || "0");

const SIZE_OF_PAGE = 1000; // TODO

export const loader: LoaderFunction = async ({ request }) => {
  const page = getPage(new URL(request.url).searchParams);

  const stickers = await db.sticker.findMany({
    skip: SIZE_OF_PAGE * page,
    take: SIZE_OF_PAGE,
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

  const data: LoaderData = { stickers };
  return json(data);
};

export default function Stickers() {
  const { stickers } = useLoaderData<LoaderData>();

  return (
    <main>
      <p className="text-2xl font-semibold mt-2 mb-8">stickers</p>
      <div className="flex flex-wrap gap-x-6 gap-y-6">
        {stickers.map((sticker) => (
          <StickerCard key={sticker.id} sticker={sticker} />
        ))}
      </div>
    </main>
  );
}
