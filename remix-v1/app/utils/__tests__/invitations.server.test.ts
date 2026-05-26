import invariant from "tiny-invariant";
import { faker } from "@faker-js/faker";
import {
  acceptInvitation,
  deleteInvitation,
  generateInvitation,
} from "~/utils/invitations.server";
import { db } from "~/utils/db.server";
import { generateUser } from "~/utils/test/generate";
import { UserRoles } from "~/types";
import { getError } from "~/utils/test/expecter";
import type { Response } from "@remix-run/node";

beforeEach(async () => {
  await db.user.deleteMany();
  await db.invitation.deleteMany();
});

describe("generateInvitation", () => {
  test("no invitations should exist initially", async () => {
    const invitation = await db.invitation.findFirst();
    expect(invitation).toBe(null);
  });

  test("fail to generate invitation if no user", async () => {
    await expect(
      generateInvitation({
        id: "invalid",
        invitationLimit: 10,
        role: UserRoles.User,
      })
    ).rejects.toThrow(/Foreign key constraint failed/);
  });

  test("should generate invitation", async () => {
    const user = await generateUser();
    const invitation = await generateInvitation(user);

    expect(invitation).not.toBe(null);
    expect(invitation?.fromId).toBe(user.id);
  });

  test("fail to generate more than the users limit of invitations", async () => {
    const user = await generateUser();

    for (let i = 0; i < 10; i++) {
      await generateInvitation(user);
    }

    let invitations = await db.invitation.findMany();
    expect(invitations.length).toBe(10);

    const response = await getError<Response>(async () =>
      generateInvitation(user)
    );
    expect(await response.text()).toBe("invitation limit reached");

    invitations = await db.invitation.findMany();
    expect(invitations.length).toBe(10);
  });

  test("generate more than the users limit of invitations if admin", async () => {
    const adminUser = await generateUser({ role: UserRoles.Admin });

    for (let i = 0; i < 10; i++) {
      await generateInvitation(adminUser);
    }

    let invitations = await db.invitation.findMany();
    expect(invitations.length).toBe(10);

    await generateInvitation(adminUser);

    invitations = await db.invitation.findMany();
    expect(invitations.length).toBe(11);
  });
});

describe("acceptInvitation", () => {
  test("fail to accept if no such invitation with id", async () => {
    expect(
      acceptInvitation({ id: "invalid", fromId: "123" }, "username", "password")
    ).rejects.toThrow(/An operation failed because it depends on one or more/);
  });

  test("accept if invitation has yet to be used", async () => {
    const user = await generateUser();
    const invitation = await generateInvitation(user);

    const username = faker.internet.userName();
    await acceptInvitation(invitation, username, "password");

    const acceptedInvitation = await db.invitation.findUnique({
      where: { id: invitation.id },
      include: { to: true },
    });
    invariant(acceptedInvitation);

    expect(acceptedInvitation?.id).toBe(invitation.id);
    expect(acceptedInvitation?.fromId).toBe(user.id);
    expect(acceptedInvitation?.to).not.toBe(null);
    expect(acceptedInvitation?.to?.username).toBe(username);
  });

  test("fail to accept if invitation has been accepted previously", async () => {
    const user = await generateUser();
    const invitation = await generateInvitation(user);

    await acceptInvitation(invitation, "user1", "password");

    const acceptedInvitation = await db.invitation.findUnique({
      where: { id: invitation.id },
    });
    invariant(acceptedInvitation);

    const response = await getError<Response>(async () =>
      acceptInvitation(acceptedInvitation, "user2", "password")
    );
    expect(await response.text()).toBe("invitation already accepted");
  });

  test("fail to accept if from user has been removed", async () => {
    const user = await generateUser();
    const invitation = await generateInvitation(user);

    await db.user.delete({ where: { id: user.id } });

    const freshInvitation = await db.invitation.findUnique({
      where: { id: invitation.id },
    });
    invariant(freshInvitation);

    const response = await getError<Response>(async () =>
      acceptInvitation(freshInvitation, "user", "password")
    );
    expect(await response.text()).toBe("sender of invitation deleted");
  });
});

describe("deleteInvitation", () => {
  test("can't delete invitation that doesn't exist", async () => {
    const response = await getError<Response>(async () =>
      deleteInvitation("wew", null)
    );
    expect(await response.text()).toBe("invitation not found");
  });

  test("can delete invitation", async () => {
    const user = await generateUser();
    const invitation = await generateInvitation(user);
    expect(await deleteInvitation(user.id, invitation)).toBeNull();
    expect(await db.invitation.count()).toBe(0);
  });

  test("can't delete invitation that you didn't create", async () => {
    const userA = await generateUser();
    const invitation = await generateInvitation(userA);

    const userB = await generateUser();

    const response = await getError<Response>(async () =>
      deleteInvitation(userB.id, invitation)
    );
    expect(await response.text()).toBe("can't remove invitation");
  });

  test("can't delete accepted invitation", async () => {
    const user = await generateUser();
    const invitation = await generateInvitation(user);
    await acceptInvitation(invitation, "user", "password");

    const response = await getError<Response>(async () =>
      deleteInvitation(user.id, invitation)
    );
    expect(await response.text()).toBe("can't remove invitation");
  });
});
