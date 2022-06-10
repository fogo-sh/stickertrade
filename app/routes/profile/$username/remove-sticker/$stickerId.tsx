import type { Sticker, User } from "@prisma/client";
import type { Params } from "react-router";
import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";

import { Form, useLoaderData, useNavigate } from "@remix-run/react";
import invariant from "tiny-invariant";
import { Modal } from "~/components/Modal";
import { db } from "~/utils/db.server";
import { getUserId } from "~/utils/session.server";

const ensurePermittedToRemoveSticker = async ({
  params,
  request,
}: {
  params: Params<string>;
  request: Request;
}) => {
  const userId = await getUserId(request);

  if (!userId) {
    throw redirect("/login");
  }

  invariant(params.stickerId, "expected params.stickerId");

  const sticker = await db.sticker.findUnique({
    where: { id: params.stickerId },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      owner: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  if (sticker === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }

  if (sticker.owner === null) {
    // TODO admins should be able to cleanup these stickers
    throw new Error("Attempt to delete a sticker without an owner");
  }

  if (userId !== sticker.owner.id) {
    throw new Response("Forbidden", {
      status: 403,
    });
  }

  return { sticker, owner: sticker.owner };
};

type LoaderData = Pick<Sticker, "name" | "imageUrl"> & {
  owner: Pick<User, "username"> | null;
};

export const loader: LoaderFunction = async ({ request, params }) => {
  const { sticker } = await ensurePermittedToRemoveSticker({ request, params });
  const data: LoaderData = sticker;
  return json(data);
};

export const action: ActionFunction = async ({ request, params }) => {
  const { sticker, owner } = await ensurePermittedToRemoveSticker({
    request,
    params,
  });

  await db.sticker.delete({
    where: { id: sticker.id },
  });

  // TODO cleanup assets within minio as well

  return redirect(`/profile/${owner.username}`);
};

export default function RemoveSticker() {
  const sticker = useLoaderData<LoaderData>();

  const navigate = useNavigate();

  return (
    <Modal
      title="Remove Sticker"
      onClose={() => {
        if (sticker.owner) {
          navigate(`/profile/${sticker.owner.username}`);
        } else {
          navigate("/");
        }
      }}
    >
      <div className="text-center my-6">
        <img
          src={sticker.imageUrl}
          alt={`sticker of ${sticker.name}`}
          className="mx-auto w-[16em] h-[16em] border-2 border-light-500 border-opacity-25"
        />
        <p className="my-1 text-md text-dark-500">{sticker.name}</p>
      </div>
      <Form method="post" className="flex justify-end">
        <button type="submit" className="button-dark text-dark-500">
          I'm sure, remove it
        </button>
      </Form>
    </Modal>
  );
}
