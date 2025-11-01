import { Router } from "express";
import { z } from "zod";
import { db } from "../config.js";

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const listSchema = z.object({
  pageSize: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : DEFAULT_PAGE_SIZE))
    .pipe(z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)),
  pageToken: z.string().optional(),
  listIds: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [])),
  priorities: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [])),
  statuses: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [])),
  search: z.string().optional().default(""),
});

router.get("/prospects", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { pageSize, pageToken, listIds, priorities, statuses, search } = parsed.data;

  let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection("prospects");

  if (listIds.length > 0) {
    queryRef = queryRef.where("list_ids", "array-contains-any", listIds);
  }
  if (priorities.length > 0) {
    queryRef = queryRef.where("priority_bucket", "in", priorities);
  }
  if (statuses.length > 0) {
    queryRef = queryRef.where("enrichment.status", "in", statuses);
  }
  queryRef = queryRef.orderBy("name").limit(pageSize);
  if (pageToken) {
    try {
      const snapshot = await db.collection("prospects").doc(pageToken).get();
      if (snapshot.exists) {
        queryRef = queryRef.startAfter(snapshot);
      }
    } catch (err) {
      console.error("Invalid pageToken", err);
    }
  }

  const snapshot = await queryRef.get();
  let rows = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));

  const searchTerm = search.trim().toLowerCase();
  if (searchTerm) {
    rows = rows.filter((row) =>
      ["name", "organization", "role_title"]
        .map((key) => (row as Record<string, unknown>)[key])
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchTerm)),
    );
  }

  const nextPageToken = snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : undefined;

  res.json({
    data: rows,
    nextPageToken,
  });
});

router.get("/list-options", async (_req, res) => {
  const snapshot = await db.collection("prospects").limit(500).get();
  const listSet = new Set<string>();
  snapshot.forEach((doc) => {
    const listIds = doc.get("list_ids");
    if (Array.isArray(listIds)) {
      listIds.forEach((value) => {
        if (typeof value === "string" && value.trim()) {
          listSet.add(value);
        }
      });
    }
  });
  res.json({ options: Array.from(listSet).sort() });
});

export default router;
