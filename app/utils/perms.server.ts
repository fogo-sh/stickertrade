import { redirect } from "@remix-run/node";
import { getUser } from "~/utils/session.server";
import { USER_ROLE } from "~/types";

export const ensureLoggedIn = async (request: Request) => {
  const user = await getUser(request);

  if (!user) {
    throw redirect("/login");
  }

  return user;
};

export const ensureAdmin = async (request: Request) => {
  const user = await ensureLoggedIn(request);

  if (user.role !== USER_ROLE.ADMIN) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }

  return user;
};
