import {
  redirect,
  unstable_composeUploadHandlers,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type {
  ActionFunction,
  LoaderFunction,
  UploadHandler,
} from "@remix-run/node";
import { ValidatedForm, validationError } from "remix-validated-form";
import { withZod } from "@remix-validated-form/with-zod";
import { zfd } from "zod-form-data";
import { z } from "zod";
import { buckets, uploadImage } from "~/utils/files.server";
import { FormInput } from "~/components/form/FormInput";
import { SubmitButton } from "~/components/form/SubmitButton";
import { v4 as uuidv4 } from "uuid";
import { getUser } from "~/utils/session.server";
import { db } from "~/utils/db.server";
import mime from "mime-types";
import { ensureLoggedIn } from "~/utils/perms.server";
import { Readable } from "stream";
import { config } from "~/consts";

export const loader: LoaderFunction = async ({ request }) => {
  await ensureLoggedIn(request);
  return null;
};

const baseSchema = z.object({
  name: z.string().max(60),
});

const clientValidator = withZod(
  baseSchema.and(
    z.object({
      image: zfd.file(
        z.instanceof(File, {
          message: "Please choose a image",
        })
      ),
    })
  )
);

const serverValidator = withZod(
  baseSchema.and(
    z.object({
      image: zfd.file(z.string()),
    })
  )
);

export const action: ActionFunction = async ({ request }) => {
  const user = await getUser(request);

  if (!user) {
    return redirect("/login");
  }

  const id = uuidv4();

  const fileUploadHandler: UploadHandler = async ({
    name,
    data,
    contentType,
  }) => {
    if (name !== "image") {
      return;
    }

    if (!config.site.files.allowedFilesTypes.includes(contentType)) {
      throw new Error("Non-permitted contentType");
    }

    const extension = mime.extension(contentType);
    const filename = `${id}.${extension}`;
    const success = await uploadImage(
      Readable.from(data),
      buckets.stickers,
      filename,
      contentType
    );
    if (!success) {
      throw new Error("Upload failed");
    }
    return `s3://stickers/${filename}`;
  };

  const uploadHandler = unstable_composeUploadHandlers(
    fileUploadHandler,
    unstable_createMemoryUploadHandler()
  );

  const formData = await unstable_parseMultipartFormData(
    request,
    uploadHandler
  );

  const { error, data } = await serverValidator.validate(formData);

  if (error) return validationError(error);

  const sticker = await db.sticker.create({
    data: {
      id,
      name: data.name,
      imageUrl: data.image,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  return redirect(`/sticker/${sticker.id}`);
};

export default function Index() {
  return (
    <main className="max-w-lg mx-auto">
      <ValidatedForm
        validator={clientValidator}
        method="post"
        encType="multipart/form-data"
      >
        <FormInput name="name" label="name" />
        <FormInput
          name="image"
          label="image"
          type="file"
          accept=".png, .jpg, .jpeg"
        />
        <SubmitButton
          className="mt-3"
          submit="Create Sticker"
          submitting="Creating Sticker..."
        />
      </ValidatedForm>
    </main>
  );
}
