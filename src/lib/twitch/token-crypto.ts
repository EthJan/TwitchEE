import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getEncryptionKey() {
    const encodedKey = process.env.TWITCH_TOKEN_ENCRYPTION_KEY;
    if (!encodedKey) {
        throw new Error("Missing TWITCH_TOKEN_ENCRYPTION_KEY environment variable");
    }

    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
        throw new Error("TWITCH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }

    return key;
}

export function encryptTwitchToken(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptTwitchToken(value: string) {
    const [ivValue, authTagValue, encryptedValue] = value.split(":");
    if (!ivValue || !authTagValue || !encryptedValue) {
        throw new Error("Invalid encrypted Twitch token");
    }

    const decipher = createDecipheriv(
        "aes-256-gcm",
        getEncryptionKey(),
        Buffer.from(ivValue, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTagValue, "base64"));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64")),
        decipher.final(),
    ]).toString("utf8");
}