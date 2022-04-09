import type { Sticker, User } from "@prisma/client";
import clsx from "clsx";
import { Link } from "remix";

export function StickerCard({
  sticker,
  showOwner = true,
}: {
  sticker: Pick<Sticker, "id" | "name" | "imageUrl"> & {
    owner: Pick<User, "username" | "avatarUrl"> | null;
  };
  showOwner?: boolean;
}) {
  return (
    <div>
      <Link to={`/sticker/${sticker.id}`} className="hover:underline">
        <img
          src={sticker.imageUrl}
          alt={`sticker of ${sticker.name}`}
          className="w-[12em] h-[12em] border-2 border-light-500 border-opacity-25"
        />
        <p className="my-1 text-md">{sticker.name}</p>
      </Link>
      {showOwner && (
        <Link
          to={`/profile/${sticker.owner?.username}`}
          className={clsx(
            { "pointer-events-none": sticker.owner === null },
            "hover:underline"
          )}
        >
          <div className="flex gap-3 items-center">
            <img
              className="w-[1.5em] h-[1.5em] rounded-full"
              src={sticker.owner?.avatarUrl ?? "/images/default-avatar.webp"}
              alt={sticker.owner?.username ?? "deleted user"}
            />
            <p className="my-1 text-sm">
              {sticker.owner?.username ?? "deleted user"}
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}
