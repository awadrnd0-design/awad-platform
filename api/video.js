import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS,
    secretAccessKey: process.env.R2_SECRET,
  },
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { key } = req.body;
  if (!key) return res.status(400).json({ error: "No key provided" });

  try {
    const command = new GetObjectCommand({ Bucket: "awad-videos", Key: key });
    const url = await getSignedUrl(client, command, { expiresIn: 7200 });
    res.status(200).json({ url });
  } catch (e) {
    console.error("Signing error:", e);
    res.status(500).json({ error: "Failed to sign URL" });
  }
}
