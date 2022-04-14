import { json, Link, LoaderFunction, Outlet, useLoaderData } from "remix";

import { redirect } from "remix";
import { getUser } from "~/utils/session.server";
import { USER_ROLE } from "~/types";

const ensureAdmin = async (request: Request) => {
  const user = await getUser(request);

  if (!user) {
    throw redirect("/login");
  }

  if (user.role !== USER_ROLE.ADMIN) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }
};

type LoaderData = null;

export const loader: LoaderFunction = async ({ request }) => {
  await ensureAdmin(request);
  return json(null);
};

export default function Admin() {
  const data = useLoaderData<LoaderData>();
  console.log({ data });

  return (
    <main>
      <h1 className="text-2xl mb-4 text-center">admin</h1>
      <div className="flex gap-x-2 my-2">
        <Link to="users">
          <button className="button-light">users</button>
        </Link>
        <Link to="stickers">
          <button className="button-light">stickers</button>
        </Link>
      </div>
      <Outlet />
    </main>
  );
}
