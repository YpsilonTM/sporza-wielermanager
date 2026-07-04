export class ApiActionError extends Error {
  constructor(action, message, payload = null) {
    super(message || `${action} failed`);
    this.name = "ApiActionError";
    this.action = action;
    this.payload = payload;
  }
}

export function assertActionSuccess(result, actionName) {
  if (result == null) {
    return result;
  }

  if (typeof result === "object" && result.success === false) {
    throw new ApiActionError(actionName, result.error || `${actionName} rejected by API`, result);
  }

  return result;
}
