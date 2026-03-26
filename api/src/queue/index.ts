import { Queue } from "bullmq";

export const queue = new Queue("firmware", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

(async () => {
  await queue.obliterate({ force: true });
})();
