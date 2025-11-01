import { config } from "dotenv";
import admin from "firebase-admin";

config();

if (!admin.apps.length) {
  const inlineCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const inlineCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_B64;

  try {
    if (inlineCredentials) {
      const credential = JSON.parse(inlineCredentials) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(credential),
      });
    } else if (inlineCredentialsBase64) {
      const decoded = Buffer.from(inlineCredentialsBase64, "base64").toString("utf-8");
      const credential = JSON.parse(decoded) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(credential),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK", error);
    throw error;
  }
}

export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
