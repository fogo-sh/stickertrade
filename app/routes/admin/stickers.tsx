import { json } from "@remix-run/node";
import type { LoaderFunction } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useSearchParams } from "@remix-run/react";

import type { Sticker, User } from "@prisma/client";
import type { Serialized } from "~/types";
import { db } from "~/utils/db.server";
import {
  ArrowCircleLeftIcon,
  ArrowCircleRightIcon,
} from "@heroicons/react/solid";
import { StickerTable } from "~/components/table/StickerTable";
import { imageUrlHandler } from "~/utils/files.server";
import { useMemo, useState } from "react";
import { Select } from "~/components/Select";

type LoaderData = (Sticker & {
  owner: Pick<User, "id" | "username" | "avatarUrl"> | null;
})[];

type SerializedLoaderData = Serialized<LoaderData>;

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const take = 30;

  const page = Number(url.searchParams.get("page") || "0");
  const skip = page * take;

  const data: LoaderData = (
    await db.sticker.findMany({
      take,
      skip,
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true } },
      },
    })
  ).map((sticker) => ({
    ...sticker,
    imageUrl: imageUrlHandler(sticker.imageUrl),
  }));

  return json(data);
};

type CheckableSticker = SerializedLoaderData[number] & { checked: boolean };
type CheckedSticker = CheckableSticker & { checked: true };

export type ContextType = { checkedStickers: CheckedSticker[] };

export const actions = ["remove"] as const;
const actionOptions = actions.map((action) => ({ name: action }));

export default function Admin() {
  const stickers = useLoaderData<SerializedLoaderData>();

  const [checkedStickerIds, setCheckedStickerIds] = useState<string[]>([]);

  const stickersWithCheckedState = useMemo(
    () =>
      stickers.map((sticker) => ({
        ...sticker,
        checked: checkedStickerIds.includes(sticker.id),
      })),
    [checkedStickerIds, stickers]
  );

  const checkedStickers = useMemo(
    () => stickers.filter((sticker) => checkedStickerIds.includes(sticker.id)),
    [checkedStickerIds, stickers]
  );

  const [selectedAction, setSelectedAction] = useState<{ name: string }>(
    actionOptions[0]
  );

  const [params] = useSearchParams();
  const page = Number(params.get("page") || "0");

  return (
    <>
      <Outlet
        context={{ checkedStickers } as { checkedStickers: CheckedSticker[] }}
      />

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
        <p className="text-lg font-semibold">stickers (page {page})</p>
        {page > 0 && (
          <Link to={`?page=${page - 1}`}>
            <ArrowCircleLeftIcon className="h-6 w-6" />
          </Link>
        )}
        {stickers.length !== 0 && (
          <Link to={`?page=${page + 1}`}>
            <ArrowCircleRightIcon className="h-6 w-6" />
          </Link>
        )}
      </div>

      <StickerTable
        stickers={stickersWithCheckedState}
        onCheckSticker={(sticker: CheckableSticker) => {
          setCheckedStickerIds((checkedStickerIds) => {
            if (checkedStickerIds.includes(sticker.id)) {
              return checkedStickerIds.filter((id) => id !== sticker.id);
            } else {
              return [...checkedStickerIds, sticker.id];
            }
          });
        }}
      />
    </>
  );
}
