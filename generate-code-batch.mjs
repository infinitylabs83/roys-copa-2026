import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const count = Math.max(1, Number(process.argv[2] || 1000));
const secret = process.env.CAMPAIGN_CODE_SECRET;
const batchId = process.env.CAMPAIGN_BATCH_ID;

if (!secret || secret.length < 24) {
  throw new Error("Defina CAMPAIGN_CODE_SECRET com pelo menos 24 caracteres.");
}
if (!batchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
  throw new Error("Defina CAMPAIGN_BATCH_ID com o UUID do lote criado no Supabase.");
}

const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const digits = "0123456789";
const randomToken = () => {
  let value = "";
  for (let index = 0; index < 3; index += 1) {
    value += letters[crypto.randomInt(letters.length)];
  }
  for (let index = 0; index < 3; index += 1) {
    value += digits[crypto.randomInt(digits.length)];
  }
  return value;
};
const digest = code =>
  crypto.createHmac("sha256", secret).update(code.trim().toUpperCase()).digest("hex");

const batchDate = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const printable = ["code,batch_id"];
const upload = ["batch_id,code_digest,status"];
const seen = new Set();

while (seen.size < count) {
  seen.add(randomToken());
}

for (const code of seen) {
  printable.push(`${code},${batchId}`);
  upload.push(`${batchId},${digest(code)},available`);
}

const out = process.env.CAMPAIGN_CODE_OUTPUT_DIR
  ? path.resolve(process.env.CAMPAIGN_CODE_OUTPUT_DIR)
  : path.join(
      process.cwd(),
      "outputs",
      "campanha-roys-nos-acrescimos",
      "codigos"
    );
await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, `codigos-impressao-${batchDate}.csv`),
  printable.join("\n")
);
await fs.writeFile(
  path.join(out, `access-codes-supabase-${batchDate}.csv`),
  upload.join("\n")
);

console.log(`Gerados ${count} códigos do lote ${batchId} em ${out}`);
