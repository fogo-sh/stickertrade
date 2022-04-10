import type { Readable } from "stream";
import * as Minio from "minio";

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

const baseS3Url = process.env.BASE_S3_URL ?? "http://localhost:9000";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
});

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
  fileStream: Readable,
  bucketName: BucketName,
  fileName: string
) {
  return await minioClient.putObject(bucketName, fileName, fileStream);
}

export function imageUrlHandler(imageUrl: string) {
  if (imageUrl.startsWith("s3://")) {
    return `${baseS3Url}/${imageUrl.slice("s3://".length)}`;
  }
  return imageUrl;
}
