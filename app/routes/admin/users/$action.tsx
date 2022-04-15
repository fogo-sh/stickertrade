import { ActionFunction, LoaderFunction, redirect } from "@remix-run/node";
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSubmit,
} from "@remix-run/react";
import invariant from "tiny-invariant";
import { z } from "zod";
import { Modal } from "~/components/Modal";
import { UserCard } from "~/components/UserCard";
import { db } from "~/utils/db.server";
import { ensureAdmin } from "~/utils/perms.server";
import { actions, ContextType } from "../users";

export const loader: LoaderFunction = async ({ request, params }) => {
  invariant(params.action, "expected params.action");
  await ensureAdmin(request);
  return null;
};

const Submit = z.object({
  action: z.enum(actions),
  userIds: z.array(z.string()),
});

export const action: ActionFunction = async ({ request, params }) => {
  invariant(params.action, "expected params.action");
  await ensureAdmin(request);

  const body = await request.formData();
  const action = body.get("action");
  const userIds = body.getAll("userId");
  const bundle = { action, userIds };

  const result = Submit.parse(bundle);

  if (result.action === "remove") {
    await db.user.deleteMany({
      where: {
        id: {
          in: result.userIds,
        },
      },
    });
  } else {
    throw new Error(`Unhandled action: ${result.action}`);
  }

  return redirect("/admin/users");
};

export default function PerformAction() {
  const { action } = useParams();
  invariant(action, "expected action");

  const navigate = useNavigate();
  const { checkableUsers } = useOutletContext<ContextType>();

  const submit = useSubmit();

  const checkedUsers = checkableUsers.filter(({ checked }) => checked);

  function handleSubmit() {
    const formData = new FormData();
    invariant(action, "expected action");
    formData.append("action", action);
    checkedUsers.forEach(({ id }) => formData.append("userId", id));
    submit(formData, { method: "post" });
  }

  return (
    <Modal
      title={action}
      onClose={() => {
        navigate("/admin/users");
      }}
    >
      {checkedUsers.length === 0 && (
        <p className="text-dark-500 my-2 italic">no users selected!</p>
      )}
      <div className="flex flex-col gap-3 p-2">
        {checkedUsers.map((user) => (
          <UserCard dark key={user.id} user={user} />
        ))}
      </div>
      <div className="flex justify-end">
        <button
          className="button-dark text-dark-500"
          disabled={checkedUsers.length === 0}
          onClick={handleSubmit}
        >
          perform {action}
        </button>
      </div>
    </Modal>
  );
}
