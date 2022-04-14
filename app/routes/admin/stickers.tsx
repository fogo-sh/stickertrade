import {
  json,
  Link,
  LoaderFunction,
  useLoaderData,
  useSearchParams,
} from "remix";

import { Sticker } from "@prisma/client";
import { db } from "~/utils/db.server";
import { Serialized } from "~/types";
import {
  ArrowCircleLeftIcon,
  ArrowCircleRightIcon,
} from "@heroicons/react/solid";
import { StickerTable } from "~/components/table/StickerTable";
import { imageUrlHandler } from "~/utils/files.server";

type LoaderData = Sticker[];

type SerializedLoaderData = Serialized<LoaderData>;

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const take = 30;

  const page = Number(url.searchParams.get("page") || "0");
  const skip = page * take;

  const data: LoaderData = (await db.sticker.findMany({ take, skip })).map(
    (sticker) => ({ ...sticker, imageUrl: imageUrlHandler(sticker.imageUrl) })
  );

  return json(data);
};

export default function Admin() {
  const stickers = useLoaderData<SerializedLoaderData>();
  const [params] = useSearchParams();
  const page = Number(params.get("page") || "0");

  return (
    <>
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
      <StickerTable stickers={stickers} />
    </>
  );
}
