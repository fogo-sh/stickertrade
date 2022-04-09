import type { User } from "@prisma/client";

export type UserCardProps = {
  user: Pick<User, "username" | "avatarUrl">;
};

export function UserCard({ user }: UserCardProps) {
  return (
    <div className="flex items-center gap-4">
      <img
        className="w-[3em] rounded-full"
        src={user.avatarUrl ?? "/images/default-avatar.webp"}
        alt={user.username}
      />
      <p className="my-1 text-lg">{user.username}</p>
    </div>
  );
}
