import { ActionFunction, Form, redirect, useNavigate } from "remix";
import invariant from "tiny-invariant";
import { Modal } from "~/components/Modal";
import { db } from "~/utils/db.server";

export const action: ActionFunction = async ({ params }) => {
  invariant(params.stickerId, "expected params.username");

  const deletedSticker = await db.sticker.delete({
    where: { id: params.stickerId },
    select: {
      owner: {
        select: {
          username: true,
        },
      },
    },
  });

  // TODO cleanup assets within minio as well

  if (deletedSticker.owner === null) {
    return redirect("/");
  } else {
    return redirect(`/profile/${deletedSticker.owner.username}`);
  }
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
