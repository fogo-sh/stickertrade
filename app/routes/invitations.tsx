import { XCircleIcon } from "@heroicons/react/solid";
import type { Invitation, User } from "@prisma/client";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { withZod } from "@remix-validated-form/with-zod";
import clsx from "clsx";
import { formatDistance, parseISO } from "date-fns";
import { ValidatedForm, validationError } from "remix-validated-form";
import invariant from "tiny-invariant";
import { z } from "zod";
import { HiddenFormInput } from "~/components/form/FormInput";
import { config } from "~/consts";
import { Serialized, UserRoles } from "~/types";
import { db } from "~/utils/db.server";
import {
  deleteInvitation,
  generateInvitation,
} from "~/utils/invitations.server";
import { ensureLoggedIn, ensureAdmin } from "~/utils/perms.server";

type LoaderData = {
  invitations: (Pick<Invitation, "id" | "message"> & {
    to: Pick<User, "username" | "avatarUrl" | "createdAt"> | null;
    url: string;
  })[];
  user: Pick<User, "invitationLimit" | "role">;
  config: { invitationsEnabled: boolean };
};

export const loader: LoaderFunction = async ({ request }) => {
  const userFromSession = await ensureLoggedIn(request);

  const invitations = await db.invitation.findMany({
    where: {
      fromId: userFromSession.id,
    },
    select: {
      id: true,
      message: true,
      to: {
        select: {
          username: true,
          avatarUrl: true,
          createdAt: true,
        },
      },
    },
  });

  const user = await db.user.findUnique({
    where: { id: userFromSession.id },
    select: {
      invitationLimit: true,
      role: true,
    },
  });
  invariant(user, "user not found");

  const { invitationsEnabled } =
    (await db.config.findFirst()) ?? config.defaultDbConfig;

  const data: LoaderData = {
    invitations: invitations.map((invitation) => ({
      ...invitation,
      url: `${config.site.urlBase}/invitation/${invitation.id}`,
    })),
    user,
    config: { invitationsEnabled },
  };

  return json(data);
};

export const validator = withZod(
  z.object({
    id: z.string(),
  })
);

const handleDeleteInvitation = async (userId: string, formData: FormData) => {
  const { data, error } = await validator.validate(formData);

  if (error) return validationError(error);

  const invitation = await db.invitation.findUnique({
    where: { id: data.id },
    select: { id: true, fromId: true },
  });

  await deleteInvitation(userId, invitation);

  return null;
};

export const action: ActionFunction = async ({ request }) => {
  const user = await ensureLoggedIn(request);

  const { invitationsEnabled } =
    (await db.config.findFirst()) ?? config.defaultDbConfig;

  if (!invitationsEnabled) {
    await ensureAdmin(request);
  }

  const formData = await request.formData();
  const action = formData.get("action");

  switch (action) {
    case "generate": {
      return generateInvitation(user);
    }
    case "delete": {
      return handleDeleteInvitation(user.id, formData);
    }
    default: {
      throw new Error("Unexpected action");
    }
  }
};

export default function Invitations() {
  const {
    user,
    invitations,
    config: { invitationsEnabled },
  } = useLoaderData<Serialized<LoaderData>>();

  const isAdmin = user.role === UserRoles.Admin;

  const remainingInvitations = user.invitationLimit - invitations.length;

  return (
    <main className="max-w-lg mx-auto">
      <h1 className="text-2xl mb-4">invitations</h1>

      {!invitationsEnabled && (
        <>
          <h1 className="text-lg text-primary-500 text-center">
            invitations are currently disabled site-wide
          </h1>
          {isAdmin && (
            <p className="italic text-primary-400 text-center">
              but you're an admin, so you're gucci
            </p>
          )}
        </>
      )}
      <div
        className={clsx("flex flex-col mt-4 gap-y-2", {
          "opacity-50 pointer-events-none": !invitationsEnabled && !isAdmin,
        })}
      >
        {invitations.map(({ id, url, to }) => (
          <div
            key={id}
            className="w-full h-12 rounded border border-light-500 border-opacity-40 flex items-center justify-between px-2"
          >
            {to === null ? (
              <>
                <input className="w-full mr-1.5" disabled value={url} />
                <ValidatedForm
                  validator={validator}
                  method="post"
                  className="flex items-center"
                >
                  <button type="submit" name="action" value="delete">
                    <XCircleIcon className="text-light-500 h-6 w-6" />
                  </button>
                  <HiddenFormInput name="id" value={id} />
                  <HiddenFormInput name="action" value="delete" />
                </ValidatedForm>
              </>
            ) : (
              <Link to={`/profile/${to.username}`} className="w-full">
                <div className="flex gap-3 w-full justify-center">
                  <img
                    className="w-[1.5em] rounded-full"
                    src={to.avatarUrl ?? "/images/default-avatar.webp"}
                    alt={to.username}
                  />
                  <p>
                    {to.username}{" "}
                    <span className="opacity-50">
                      accepted{" "}
                      {formatDistance(new Date(), parseISO(to.createdAt))} ago
                    </span>
                  </p>
                </div>
              </Link>
            )}
          </div>
        ))}
        {remainingInvitations > 0 && (
          <Form
            method="post"
            className="w-full h-12 rounded border border-light-500 border-opacity-40 flex p-1"
          >
            <button
              className="button-light w-full mx-auto"
              name="action"
              value="generate"
            >
              generate invitation
            </button>
            <input type="hidden" name="action" value="generate" />
          </Form>
        )}
        {Array.from({ length: remainingInvitations - 1 }, (_, i) => (
          <div
            key={i}
            className="w-full h-12 rounded border border-light-500 border-opacity-20"
          ></div>
        ))}
      </div>
      <p className="italic text-center mt-2">
        {remainingInvitations} invitations remaining
      </p>
    </main>
  );
}
