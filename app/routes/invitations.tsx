import { XCircleIcon } from "@heroicons/react/solid";
import type { Invitation, User } from "@prisma/client";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { withZod } from "@remix-validated-form/with-zod";
import { ValidatedForm } from "remix-validated-form";
import invariant from "tiny-invariant";
import { z } from "zod";
import { HiddenFormInput } from "~/components/form/FormInput";
import { db } from "~/utils/db.server";
import { ensureLoggedIn } from "~/utils/perms.server";

type LoaderData = {
  invitations: (Pick<Invitation, "id" | "message"> & {
    to: Pick<User, "username" | "avatarUrl"> | null;
  })[];
  user: Pick<User, "invitationLimit">;
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
        },
      },
    },
  });

  const user = await db.user.findUnique({
    where: { id: userFromSession.id },
    select: {
      invitationLimit: true,
    },
  });
  invariant(user, "user not found");

  const data: LoaderData = {
    invitations,
    user,
  };
  return json(data);
};

export const validator = withZod(
  z.object({
    id: z.string(),
  })
);

export const action: ActionFunction = async ({ request, params }) => {
  const user = await ensureLoggedIn(request);

  console.log({ user });

  return null;

  await db.invitation.create({
    data: {
      fromId: user.id,
    },
  });

  return null;
};

export default function Invitations() {
  const { user, invitations } = useLoaderData<LoaderData>();

  const remainingInvitations = user.invitationLimit - invitations.length;

  return (
    <main className="max-w-lg mx-auto">
      <h1 className="text-2xl mb-4">invitations</h1>
      {invitations.length === 0 && (
        <p className="italic text-center">
          you have sent no invitations (yet!), with {user.invitationLimit}{" "}
          remaining
        </p>
      )}
      <div className="flex flex-col mt-4 gap-y-2">
        {invitations.map(({ id }) => (
          <div
            key={id}
            className="w-full h-12 rounded border border-light-500 border-opacity-40 flex items-center justify-between px-2"
          >
            <p>{id}</p>
            <ValidatedForm
              validator={validator}
              method="post"
              className="flex items-center"
            >
              <button type="submit">
                <XCircleIcon className="text-light-500 h-6 w-6" />
              </button>
              <HiddenFormInput name="id" value={id} />
            </ValidatedForm>
          </div>
        ))}
        <Form
          method="post"
          className="w-full h-12 rounded border border-light-500 border-opacity-40 flex p-1"
        >
          <button className="button-light w-full mx-auto">
            generate invitation
          </button>
        </Form>
        {Array.from({ length: remainingInvitations - 1 }, (_, i) => (
          <div
            key={i}
            className="w-full h-12 rounded border border-light-500 border-opacity-20"
          ></div>
        ))}
      </div>
    </main>
  );
}
