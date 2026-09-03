import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const formatVersion = "v1";
const additionalAuthenticatedData = Buffer.from("bears-capacitacion:tiendanube-access-token:v1", "utf8");

export function encryptTiendanubeAccessToken(accessToken: string, encryptionKey: Buffer) {
  if (!accessToken) throw new Error("No se puede cifrar un token vacío.");
  if (encryptionKey.length !== 32) throw new Error("La clave de cifrado de Tiendanube debe tener 32 bytes.");

  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey, initializationVector);
  cipher.setAAD(additionalAuthenticatedData);
  const encrypted = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    formatVersion,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptTiendanubeAccessToken(ciphertext: string, encryptionKey: Buffer) {
  const [version, initializationVector, authenticationTag, encrypted] = ciphertext.split(".");
  if (version !== formatVersion || !initializationVector || !authenticationTag || !encrypted) {
    throw new Error("El formato del token cifrado de Tiendanube no es válido.");
  }
  if (encryptionKey.length !== 32) throw new Error("La clave de cifrado de Tiendanube debe tener 32 bytes.");

  const decipher = createDecipheriv(algorithm, encryptionKey, Buffer.from(initializationVector, "base64url"));
  decipher.setAAD(additionalAuthenticatedData);
  decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
  const accessToken = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
  return accessToken.toString("utf8");
}