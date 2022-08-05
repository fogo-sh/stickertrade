import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import { Link, Outlet } from "@remix-run/react";
import { ensureAdmin } from "~/utils/perms.server";

export const meta: MetaFunction = () => {
  return {
    title: `stickertrade - admin 👑`,
  };
};

export const loader: LoaderFunction = async ({ request }) => {
  await ensureAdmin(request);
  return null;
};

export default function Admin() {
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
