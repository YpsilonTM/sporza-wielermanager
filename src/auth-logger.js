export function createAuthLogger(onLog) {
  const emit = typeof onLog === "function" ? onLog : (message) => console.error(`[auth] ${message}`);

  return {
    step(name, detail) {
      emit(detail ? `${name} — ${detail}` : name);
    },
    info(message) {
      emit(message);
    },
    warn(message) {
      emit(`WARN: ${message}`);
    },
    error(message) {
      emit(`ERROR: ${message}`);
    }
  };
}
