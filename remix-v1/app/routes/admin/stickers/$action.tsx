import type { ActionFunction, LoaderFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSubmit,
} from "@remix-run/react";
import invariant from "tiny-invariant";
import { z } from "zod";
import { Modal } from "~/components/Modal";
import { StickerCard } from "~/components/StickerCard";
import { db } from "~/utils/db.server";
import { ensureAdmin } from "~/utils/perms.server";
import type { ContextType } from "../stickers";
import { actions } from "../stickers";

export const loader: LoaderFunction = async ({ request, params }) => {
  invariant(params.action, "expected params.action");
  await ensureAdmin(request);
  return null;
};

const Submit = z.object({
  action: z.enum(actions),
  stickerIds: z.array(z.string()),
});

export const action: ActionFunction = async ({ request, params }) => {
  invariant(params.action, "expected params.action");
  await ensureAdmin(request);

  const body = await request.formData();
  const action = body.get("action");
  const stickerIds = body.getAll("stickerId");
  const bundle = { action, stickerIds };

  const result = Submit.parse(bundle);

  if (result.action === "remove") {
    await db.sticker.deleteMany({
      where: {
        id: {
          in: result.stickerIds,
        },
      },
    });
  } else {
    throw new Error(`Unhandled action: ${result.action}`);
  }

  return redirect("/admin/stickers");
};

export default function PerformAction() {
  const { action } = useParams();
  invariant(action, "expected action");

  const navigate = useNavigate();
  const { checkedStickers } = useOutletContext<ContextType>();

  const submit = useSubmit();

  function handleSubmit() {
    const formData = new FormData();
    invariant(action, "expected action");
    formData.append("action", action);
    checkedStickers.forEach(({ id }) => formData.append("stickerId", id));
    submit(formData, { method: "post" });
  }

  return (
    <Modal
      title={action}
      onClose={() => {
        navigate("/admin/stickers");
      }}
    >
      {checkedStickers.length === 0 && (
        <p className="text-dark-500 my-2 italic">no stickers selected!</p>
      )}
      <div className="flex flex-col gap-3 p-2">
        {checkedStickers.map((sticker) => (
          <StickerCard key={sticker.id} sticker={sticker} />
        ))}
      </div>
      <div className="flex justify-end">
        <button
          className="button-dark text-dark-500"
          disabled={checkedStickers.length === 0}
          onClick={handleSubmit}
        >
          perform {action}
        </button>
      </div>
    </Modal>
  );
}
