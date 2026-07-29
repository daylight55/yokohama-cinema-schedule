import type { RouteOrigin } from "../../shared/types";

export const DEPARTURE_ENCRYPTION_VERSION = 1;

const MASTER_KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 32;
const KEY_PURPOSE = "hamamubi:departure-location";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface EncryptedDepartureLocation {
  ciphertext: string;
  iv: string;
  salt: string;
  version: typeof DEPARTURE_ENCRYPTION_VERSION;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64ToBytes(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("invalid_encrypted_departure_location");
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("invalid_encrypted_departure_location");
  }
}

function decodeMasterKey(masterKey: string): Uint8Array {
  const bytes = base64ToBytes(masterKey.trim());
  if (bytes.byteLength !== MASTER_KEY_BYTES) {
    throw new Error("invalid_profile_encryption_key");
  }
  return bytes;
}

function keyContext(userId: string, version: number): Uint8Array {
  return encoder.encode(`${KEY_PURPOSE}:v${version}:user:${userId}`);
}

async function deriveUserKey(
  masterKey: string,
  userId: string,
  salt: Uint8Array,
  version: number,
): Promise<CryptoKey> {
  if (!userId) throw new Error("invalid_departure_location_user");
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    bytesToArrayBuffer(decodeMasterKey(masterKey)),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bytesToArrayBuffer(salt),
      info: bytesToArrayBuffer(keyContext(userId, version)),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function parseLocation(value: unknown): RouteOrigin {
  if (
    !value ||
    typeof value !== "object" ||
    !("latitude" in value) ||
    !("longitude" in value)
  ) {
    throw new Error("invalid_encrypted_departure_location");
  }
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("invalid_encrypted_departure_location");
  }
  return { latitude, longitude };
}

export async function encryptDepartureLocation(
  masterKey: string,
  userId: string,
  location: RouteOrigin,
): Promise<EncryptedDepartureLocation> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveUserKey(
    masterKey,
    userId,
    salt,
    DEPARTURE_ENCRYPTION_VERSION,
  );
  const plaintext = encoder.encode(JSON.stringify(parseLocation(location)));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: bytesToArrayBuffer(iv),
      additionalData: bytesToArrayBuffer(
        keyContext(userId, DEPARTURE_ENCRYPTION_VERSION),
      ),
      tagLength: 128,
    },
    key,
    plaintext,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    version: DEPARTURE_ENCRYPTION_VERSION,
  };
}

export async function decryptDepartureLocation(
  masterKey: string,
  userId: string,
  encrypted: EncryptedDepartureLocation,
): Promise<RouteOrigin> {
  if (encrypted.version !== DEPARTURE_ENCRYPTION_VERSION) {
    throw new Error("unsupported_departure_encryption_version");
  }
  const salt = base64ToBytes(encrypted.salt);
  const iv = base64ToBytes(encrypted.iv);
  if (salt.byteLength !== SALT_BYTES || iv.byteLength !== IV_BYTES) {
    throw new Error("invalid_encrypted_departure_location");
  }
  const key = await deriveUserKey(
    masterKey,
    userId,
    salt,
    encrypted.version,
  );
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytesToArrayBuffer(iv),
        additionalData: bytesToArrayBuffer(
          keyContext(userId, encrypted.version),
        ),
        tagLength: 128,
      },
      key,
      bytesToArrayBuffer(base64ToBytes(encrypted.ciphertext)),
    );
    return parseLocation(JSON.parse(decoder.decode(plaintext)));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "unsupported_departure_encryption_version"
    ) {
      throw error;
    }
    throw new Error("departure_location_decryption_failed");
  }
}
