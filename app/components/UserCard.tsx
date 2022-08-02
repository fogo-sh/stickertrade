import type { User } from "@prisma/client";
import clsx from "clsx";

export type UserCardProps = {
  user: Pick<User, "username" | "avatarUrl">;
  dark?: boolean;
};

export function UserCard({ user, dark = false }: UserCardProps) {
  return (
    <div className="flex items-center gap-4">
      <img
        className="w-[3em] rounded-full object-cover"
        src={user.avatarUrl ?? "/images/default-avatar.webp"}
        alt={user.username}
      />
      <p className={clsx("my-1 text-[1.3em]", { "text-dark-500": dark })}>
        {user.username}
      </p>
    </div>
  );
}
