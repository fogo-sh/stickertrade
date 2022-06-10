import type { Invitation, User } from "@prisma/client";
import invariant from "tiny-invariant";
import { UserRoles } from "~/types";
import { db } from "~/utils/db.server";
import { hash } from "~/utils/perms.server";

export const generateInvitation = async (
  user: Pick<User, "id" | "invitationLimit" | "role">
) => {
  const invitationsCreated = await db.invitation.count({
    where: {
      fromId: user.id,
    },
  });

  const limitReached = invitationsCreated >= user.invitationLimit;
  const notAdmin = user.role !== UserRoles.Admin;

  if (limitReached && notAdmin) {
    throw new Response("invitation limit reached", {
      status: 403,
    });
  }

  // TODO select only required fields
  const invitation = await db.invitation.create({
    data: {
      fromId: user.id,
    },
  });

  return invitation;
};

export const ensureInvitationCanBeAccepted = async (
  invitation: Pick<Invitation, "id" | "fromId"> | null
) => {
  if (invitation === null) {
    throw new Response("invitation not found", {
      status: 404,
    });
  }

  const fromDeleted = invitation.fromId === null;

  if (fromDeleted) {
    throw new Response("sender of invitation deleted", {
      status: 403,
    });
  }

  const usersMatchingInvitationId = await db.user.count({
    where: { invitationId: invitation.id },
  });

  if (usersMatchingInvitationId === 1) {
    throw new Response("invitation already accepted", {
      status: 403,
    });
  } else if (usersMatchingInvitationId !== 0) {
    throw new Error("unexpected number of users matching invitation id");
  }
};

export const acceptInvitation = async (
  invitation: Pick<Invitation, "id" | "fromId"> | null,
  username: string,
  password: string
) => {
  await ensureInvitationCanBeAccepted(invitation);
  invariant(invitation);

  await db.invitation.update({
    where: { id: invitation.id },
    data: {
      to: {
        create: {
          username,
          passwordHash: await hash(password),
        },
      },
    },
    select: { id: true },
  });
};

export const deleteInvitation = async (
  userId: string,
  invitation: Pick<Invitation, "id" | "fromId"> | null
) => {
  if (invitation === null) {
    throw new Response("invitation not found", {
      status: 404,
    });
  }

  const usersMatchingInvitationId = await db.user.count({
    where: { invitationId: invitation.id },
  });

  const alreadyAccepted = usersMatchingInvitationId === 1;
  const fromIdSameAsUser = invitation.fromId === userId;

  if (alreadyAccepted || !fromIdSameAsUser) {
    throw new Response("can't remove invitation", {
      status: 403,
    });
  }

  await db.invitation.delete({
    where: { id: invitation.id },
    select: { id: true },
  });

  return null;
};
