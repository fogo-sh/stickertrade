import type { Sticker, User } from "@prisma/client";

export function StickerCard({
  sticker,
}: {
  sticker: Sticker & { owner: User | null };
}) {
  return (
    <div>
      <img
        src={sticker.imageUrl}
        alt={`sticker of ${sticker.name}`}
        className="w-[12em] h-[12em] border-2 border-light-500 border-opacity-25"
      />
      <p className="my-1 text-md">{sticker.name}</p>
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
    </div>
  );
}
