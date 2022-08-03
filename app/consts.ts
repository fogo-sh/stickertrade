import mime from "mime-types";

const minio = {
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
};

const site = {
  baseS3Url: process.env.SITE_BASE_S3_URL ?? "http://localhost:9000",
  sessionSecret: process.env.SITE_SESSION_SECRET ?? "session-secret",
  urlBase: process.env.SITE_URL_BASE ?? "http://localhost:3000",
  files: {
    allowedFilesTypes: [
      mime.lookup("png"),
      mime.lookup("jpg"),
      mime.lookup("jpeg"),
    ],
  },
};

const defaultDbConfig = { invitationsEnabled: true };

export const config = {
  minio,
  site,
  defaultDbConfig,
};
