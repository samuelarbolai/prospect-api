import cors from "cors";
import express from "express";
import enrichmentRouter from "./routes/enrichment.js";
import prospectsRouter from "./routes/prospects.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.use("/api", enrichmentRouter);
app.use("/api", prospectsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Prospect pipeline backend listening on port ${port}`);
});
