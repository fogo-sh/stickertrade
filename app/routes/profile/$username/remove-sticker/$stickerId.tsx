import { ActionFunction, Form, redirect, useNavigate } from "remix";
import invariant from "tiny-invariant";
import { Modal } from "~/components/Modal";
import { db } from "~/utils/db.server";
import { getUserId } from "~/utils/session.server";

export const action: ActionFunction = async ({ request, params }) => {
  const userId = await getUserId(request);

  if (!userId) {
    return redirect("/login");
  }

  invariant(params.stickerId, "expected params.stickerId");

  const sticker = await db.sticker.findUnique({
    where: { id: params.stickerId },
    select: {
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

  await db.sticker.delete({
    where: { id: params.stickerId },
  });

  // TODO cleanup assets within minio as well

  return redirect(`/profile/${sticker.owner.username}`);
};

export default function RemoveSticker() {
  const navigate = useNavigate();

  return (
    <Modal
      title="Remove Sticker"
      onClose={() => {
        navigate(".."); // TODO don't be relative, ensure user profile
      }}
    >
      <Form method="post" className="mt-4 flex justify-end">
        <button type="submit" className="button-dark text-dark-500">
          I'm sure, remove it
        </button>
      </Form>
    </Modal>
  );
}
