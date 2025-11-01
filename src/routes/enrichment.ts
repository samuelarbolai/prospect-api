import { Router } from "express";
import { z } from "zod";
import { db, FieldValue, Timestamp } from "../config.js";
import { chunk } from "../utils.js";

const router = Router();

const enqueueSchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
  listTag: z.string().min(1).max(120).optional(),
  metadata: z.record(z.any()).optional(),
});

router.post("/enqueue_enrichment", async (req, res) => {
  const parsed = enqueueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { prospectIds, listTag, metadata } = parsed.data;
  const effectiveListId = listTag ?? process.env.DEFAULT_QUEUE_LIST_ID ?? null;
  const now = Timestamp.now();
  const runRef = db.collection("enrichment_runs").doc();

  await runRef.set({
    created_at: now,
    status: "queued",
    prospect_count: prospectIds.length,
    list_tag: effectiveListId,
    metadata: metadata ?? null,
  });

  const updates = {
    "enrichment.status": "queued",
    "enrichment.queue_run_id": runRef.id,
    "enrichment.queue_timestamp": now,
    "enrichment.updated_at": now,
  } as Record<string, unknown>;

  if (effectiveListId) {
    updates.list_ids = FieldValue.arrayUnion(effectiveListId);
  }

  let affected = 0;
  for (const group of chunk(prospectIds, 400)) {
    const batch = db.batch();
    group.forEach((id) => {
      const ref = db.collection("prospects").doc(id);
      batch.set(ref, updates, { merge: true });
      affected += 1;
    });
    await batch.commit();
  }

  return res.json({
    runId: runRef.id,
    queued: affected,
    listTag: effectiveListId,
  });
});

const tagReadySchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
  listTag: z.string().min(1).max(120).optional(),
});

router.post("/tag_outreach_ready", async (req, res) => {
  const parsed = tagReadySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { prospectIds, listTag } = parsed.data;
  const effectiveTag = listTag ?? process.env.OUTREACH_READY_LIST_ID ?? "outreach_ready";
  const now = Timestamp.now();

  const updates = {
    "outreach.ready": true,
    "outreach.ready_at": now,
    "outreach.updated_at": now,
  } as Record<string, unknown>;

  if (effectiveTag) {
    updates.list_ids = FieldValue.arrayUnion(effectiveTag);
  }

  let affected = 0;
  for (const group of chunk(prospectIds, 400)) {
    const batch = db.batch();
    group.forEach((id) => {
      const ref = db.collection("prospects").doc(id);
      batch.set(ref, updates, { merge: true });
      affected += 1;
    });
    await batch.commit();
  }

  return res.json({
    updated: affected,
    listTag: effectiveTag,
  });
});

export default router;
