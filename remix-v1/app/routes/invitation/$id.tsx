import type {
  ActionFunction,
  LoaderFunction,
  MetaFunction,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { formatDistance, parseISO } from "date-fns";
import invariant from "tiny-invariant";
import type { Invitation, User } from "@prisma/client";
import type { Serialized } from "~/types";
import { db } from "~/utils/db.server";
import { ensureLoggedOut } from "~/utils/perms.server";
import { withZod } from "@remix-validated-form/with-zod";
import { z } from "zod";
import { ValidatedForm, validationError } from "remix-validated-form";
import { FormInput } from "~/components/form/FormInput";
import { SubmitButton } from "~/components/form/SubmitButton";
import {
  acceptInvitation,
  ensureInvitationCanBeAccepted,
} from "~/utils/invitations.server";

type LoaderData = {
  invitation: Pick<Invitation, "message" | "createdAt"> & {
    from: Pick<User, "username" | "avatarUrl">;
  };
};

type SerializedLoaderData = Serialized<LoaderData>;

export const meta: MetaFunction = ({ data }) => {
  if (data === undefined) return {};
  const { invitation } = data as LoaderData;
  return {
    title: `stickertrade - invitation from ${invitation.from.username}`,
  };
};

export const loader: LoaderFunction = async ({ request, params }) => {
  invariant(params.id, "expected params.id");
  await ensureLoggedOut(request);

  const invitation = await db.invitation.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      message: true,
      createdAt: true,
      fromId: true,
      from: { select: { username: true, avatarUrl: true } },
    },
  });

  await ensureInvitationCanBeAccepted(invitation);
  invariant(invitation);

  // TODO typescript jank to ensure from is not null
  const from = invitation.from;
  if (from === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }
  invitation.from = from;

  const data: LoaderData = { invitation: { ...invitation, from } };
  return json(data);
};

export const validator = withZod(
  z.object({
    username: z
      .string()
      .min(3, { message: "Username must be at least 3 characters" })
      .max(16, { message: "Username can't be more than 16 characters" }),
    password: z
      .string()
      .min(6, { message: "Password must be at least 6 characters" })
      .max(32, { message: "Password can't be more than 32 characters" }),
    confirmPassword: z
      .string()
      .min(6, { message: "Confirm password must be at least 6 characters" })
      .max(32, {
        message: "Confirm password can't be more than 32 characters",
      }),
  })
);

export const action: ActionFunction = async ({ request, params }) => {
  await ensureLoggedOut(request);

  const { formId, data, error } = await validator.validate(
    await request.formData()
  );

  if (error) return validationError(error);

  const invitation = await db.invitation.findUnique({
    where: { id: params.id },
    select: { id: true, fromId: true },
  });

  if (data.password !== data.confirmPassword) {
    return validationError(
      {
        fieldErrors: {
          confirmPassword: "Passwords don't match",
        },
        formId: formId,
      },
      data
    );
  }

  await acceptInvitation(invitation, data.username, data.password);

  return redirect(`/profile/${data.username}`);
};

export default function AcceptInvitation() {
  const { invitation } = useLoaderData<SerializedLoaderData>();

  // TODO display message attribute

  return (
    <main className="max-w-lg mx-auto">
      <h1 className="text-xl mb-4 text-center">
        you have been invited to stickertrade! 🎉
      </h1>
      <div className="flex items-center justify-center gap-2 my-4 mx-auto">
        <img
          className="w-[1.5em] rounded-full object-cover"
          src={invitation.from.avatarUrl ?? "/images/default-avatar.webp"}
          alt={invitation.from.username}
        />
        <p className="text-md">
          {invitation.from.username} created an invitation{" "}
          {formatDistance(new Date(), parseISO(invitation.createdAt))} ago
        </p>
      </div>
      <div className="max-w-sm mx-auto">
        <ValidatedForm validator={validator} method="post">
          <FormInput name="username" label="create username" />
          <FormInput name="password" label="set password" type="password" />
          <FormInput
            name="confirmPassword"
            label="confirm password"
            type="password"
          />
          <SubmitButton
            className="mt-3"
            submit="accept invitation"
            submitting="accepting..."
          />
        </ValidatedForm>
      </div>
    </main>
  );
}
