import pino from "pino";
import pretty from "pino-pretty";

const encoder = new TextEncoder();
const sseClients = new Set();

function broadcastSse(data) {
  const payload = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  for (const controller of sseClients) {
    try {
      controller.enqueue(payload);
    } catch {
      sseClients.delete(controller);
    }
  }
}

const prettyStream = pretty({
  colorize: true,
  ignore: "pid,hostname"
});

const customStream = {
  write(chunk) {
    prettyStream.write(chunk);

    try {
      const logObject = JSON.parse(chunk.toString());
      const message = logObject.msg;
      if (message && logObject.level >= 30) {
        broadcastSse({ type: "log", level: logObject.level, message });
      }
    } catch {
      const fallback = chunk.toString().trim();
      if (fallback) {
        broadcastSse({ type: "log", level: 30, message: fallback });
      }
    }
  }
};

const pinoLogger = pino(
  {
    level: process.env.NODE_ENV === "production" ? "info" : "debug"
  },
  customStream
);

export { pinoLogger, sseClients, encoder, broadcastSse };
