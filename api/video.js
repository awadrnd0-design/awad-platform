import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const config = { runtime: "edge" };

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS,
    secretAccessKey: process.env.R2_SECRET,
  },
});

export default async function handler(req) {
  const { key } = await req.json();
  if (!key) return Response.json({ error: "No key" }, { status: 400 });

  const command = new GetObjectCommand({ Bucket: "awad-videos", Key: key });
  const url = await getSignedUrl(client, command, { expiresIn: 7200 }); // 2 hours

  return Response.json({ url });
}
