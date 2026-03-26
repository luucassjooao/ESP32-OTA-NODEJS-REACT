import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { firmwareRoutes } from "./routes/firmware.route";
import "./workers/firmware.worker";

const fastify = Fastify();

fastify.register(cors);

fastify.register(firmwareRoutes);

fastify.listen({ port: 5500, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`Listening on ${address}`);
});
