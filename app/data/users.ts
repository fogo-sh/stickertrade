import { db } from "~/utils/db.server";

export const getUsers = async (take: number) =>
  await db.user.findMany({ take });
