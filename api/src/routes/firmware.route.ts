import fs from "fs";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { queue } from "../queue";
import { getFirmwareBinPath } from "../firmware/ota.service";
import { readLatestVersion } from "../firmware/lastversion.service";

const schema = z.object({
  codeConfiguration: z.string().min(1, "Code cannot be empty"),
  codeSetup: z.string().min(1, "Code cannot be empty"),
  codeLoop: z.string().min(1, "Code cannot be empty"),
  codeFuncs: z.string(),
});

export function firmwareRoutes(fastify: FastifyInstance) {
  fastify.post("/upload-code", async (request, reply) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: result.error.issues,
      });
    }

    const { codeConfiguration, codeSetup, codeLoop, codeFuncs } = result.data;

    await queue.add(
      "compile",
      { codeConfiguration, codeSetup, codeLoop, codeFuncs },
      { removeOnComplete: true, removeOnFail: false },
    );

    return reply.send({ message: "Compilation job queued." });
  });
  fastify.get("/firmware/latest.bin", async (request, reply) => {
    const binPath = getFirmwareBinPath();

    try {
      await fs.promises.access(binPath);
    } catch {
      return reply
        .status(404)
        .send({ error: "No firmware binary available yet." });
    }

    const stat = await fs.promises.stat(binPath);

    return reply
      .header("Content-Type", "application/octet-stream")
      .header("Content-Length", stat.size)
      .header("Content-Disposition", "attachment; filename=firmware.bin")
      .send(fs.createReadStream(binPath));
  });
  fastify.get("/last-version", async (request, reply) => {
    const lastVersion = await readLatestVersion();
    return reply.send(lastVersion);
  });
  fastify.get("/", async (request, reply) => {
    return reply.send({ message: "Firmware API is up and running!" });
  });
}
