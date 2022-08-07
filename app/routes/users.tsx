import { useLoaderData, Link } from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { User } from "@prisma/client";
import { UserCard } from "~/components/UserCard";
import { db } from "~/utils/db.server";

type LoaderData = {
  users: Pick<User, "id" | "username" | "avatarUrl">[];
};

export const loader: LoaderFunction = async () => {
  const users = await db.user.findMany({
    select: { id: true, username: true, avatarUrl: true },
    orderBy: { updatedAt: "desc" },
  });

  const data: LoaderData = { users };
  return json(data);
};

export default function Users() {
  const { users } = useLoaderData<LoaderData>();

  return (
    <main>
      <p className="text-2xl font-semibold mt-2 mb-8">users</p>
      <div className="flex flex-wrap gap-8">
        {users.map((user) => (
          <Link
            key={user.id}
            to={`/profile/${user.username}`}
            className="hover:underline"
          >
            <UserCard user={user} />
          </Link>
        ))}
      </div>
    </main>
  );
}
