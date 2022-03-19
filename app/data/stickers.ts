import { db } from "~/utils/db.server";

export const getStickers = async (take: number) =>
  await db.sticker.findMany({
    include: { owner: true },
    take,
    orderBy: { createdAt: "desc" },
  });
