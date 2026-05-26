import type { Readable } from "stream";
import * as Minio from "minio";
import { config, fileTypes } from "~/consts";
import { PassThrough } from "stream";
import sharp from "sharp";

export const buckets = Object.freeze({
  stickers: "stickers",
} as const);

type BucketName = keyof typeof buckets;

const region = "us-east-1";

const publicBucketPolicy = (bucketName: BucketName) => ({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucketName}/*`],
    },
  ],
});

/*
const minioClient = new Minio.Client(config.minio);

const ensureBuckets = async () => {
  const stickersBucketExists = await minioClient.bucketExists(buckets.stickers);

  if (!stickersBucketExists) {
    await minioClient.makeBucket(buckets.stickers, region);
    await minioClient.setBucketPolicy(
      buckets.stickers,
      JSON.stringify(publicBucketPolicy(buckets.stickers))
    );
  }
};

ensureBuckets();
*/

export async function uploadImage(
  stream: Readable,
  bucketName: BucketName,
  fileName: string,
  contentType: string
) {
  const passThrough = new PassThrough();

  const sizeChecker = new Promise<void>((resolve, reject) => {
    stream.pipe(passThrough);

    let bytes = 0;
    passThrough.on("data", (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        bytes += Buffer.byteLength(chunk);
      }
      if (bytes > config.site.files.maxFileSizeBytes) {
        passThrough.destroy();
        stream.destroy();
        reject(new Error("Filesize too large"));
      }
    });

    passThrough.on("end", () => {
      resolve();
    });
  });

  let resizer;
  if (fileTypes.jpg.includes(contentType)) {
    resizer = sharp().withMetadata().jpeg({ mozjpeg: true, quality: 60 });
  } else {
    resizer = sharp().withMetadata().png({ compressionLevel: 6, quality: 60 });
  }

  throw new Error("Not implemented");

  /*
  const objectPutter = minioClient.putObject(
    bucketName,
    fileName,
    stream.pipe(resizer),
    {
      "Content-Type": contentType,
    }
  );

  try {
    await Promise.all([sizeChecker, objectPutter]);
  } catch (error) {
    if (error instanceof Error && error.message === "Filesize too large") {
      return false;
    }
    throw error;
  }

  return true;
  */
}

export function imageUrlHandler(imageUrl: string) {
  if (imageUrl.startsWith("s3://")) {
    return `${config.site.baseS3Url}/${imageUrl.slice("s3://".length)}`;
  }

  return imageUrl;
}
