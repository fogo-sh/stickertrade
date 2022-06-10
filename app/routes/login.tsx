import type { ActionFunction } from "@remix-run/node";
import { withZod } from "@remix-validated-form/with-zod";
import { ValidatedForm, validationError } from "remix-validated-form";
import { z } from "zod";
import { FormInput } from "~/components/form/FormInput";
import { SubmitButton } from "~/components/form/SubmitButton";
import { createUserSession, login } from "~/utils/session.server";

export const validator = withZod(
  z.object({
    username: z
      .string()
      .nonempty("Username is required")
      .min(3, { message: "Username must be at least 3 characters" }),
    password: z
      .string()
      .nonempty("Password is required")
      .min(6, { message: "Password must be at least 6 characters" }),
  })
);

export const action: ActionFunction = async ({ request }) => {
  const { formId, data, error } = await validator.validate(
    await request.formData()
  );

  if (error) return validationError(error);

  const { username, password } = data;

  const user = await login({ username, password });

  if (!user) {
    return validationError(
      {
        fieldErrors: {
          password: "Login failed",
        },
        formId: formId,
      },
      data
    );
  }

  return createUserSession(user.id, "/");
};

export default function Index() {
  return (
    <main className="max-w-sm mx-auto">
      <ValidatedForm validator={validator} method="post">
        <FormInput name="username" label="username" />
        <FormInput name="password" label="password" type="password" />
        <SubmitButton
          className="mt-3"
          submit="Login"
          submitting="Logging in..."
        />
      </ValidatedForm>
    </main>
  );
}
