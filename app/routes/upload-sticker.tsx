import {
  ActionFunction,
  redirect,
  unstable_parseMultipartFormData,
  UploadHandler,
} from "remix";
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

const baseSchema = z.object({
  name: z.string().nonempty("Name is required"),
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

  const uploadHandler: UploadHandler = async ({ name, stream, mimetype }) => {
    if (name !== "image") {
      stream.resume();
      return;
    }
    const extension = mime.extension(mimetype);
    const filename = `${id}.${extension}`;
    await uploadImage(stream, buckets.stickers, filename);
    return `s3://stickers/${filename}`;
  };

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
        <FormInput name="image" label="image" type="file" accept="image/*" />
        <SubmitButton
          className="mt-3"
          submit="Create Sticker"
          submitting="Creating Sticker..."
        />
      </ValidatedForm>
    </main>
  );
}
