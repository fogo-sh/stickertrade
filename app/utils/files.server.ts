import type { Readable } from "stream";
import * as Minio from "minio";
import { config } from "~/consts";

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

export async function uploadImage(
  data: string | Readable | Buffer,
  bucketName: BucketName,
  fileName: string,
  contentType: string
) {
  return await minioClient.putObject(bucketName, fileName, data, {
    "Content-Type": contentType,
  });
}

export function imageUrlHandler(imageUrl: string) {
  if (imageUrl.startsWith("s3://")) {
    return `${config.site.baseS3Url}/${imageUrl.slice("s3://".length)}`;
  }

  return imageUrl;
}
