import { redirect } from "@remix-run/node";
import bcrypt from "bcryptjs";
import { UserRoles } from "~/types";
import { getUser, getUserId } from "~/utils/session.server";

export const ensureLoggedOut = async (request: Request) => {
  const userId = await getUserId(request);

  if (userId) {
    throw redirect("/"); // TODO toast something to inform of the redirection
  }
};

export const ensureLoggedIn = async (request: Request) => {
  const user = await getUser(request);

  if (!user) {
    throw redirect("/login");
  }

  return user;
};

export const ensureAdmin = async (request: Request) => {
  const user = await ensureLoggedIn(request);

  if (user.role !== UserRoles.Admin) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }

  return user;
};

const salt = bcrypt.genSaltSync(10);

export const hash = (password: string) => bcrypt.hash(password, salt);
