const FALLBACK_ACTION = 'trivia_game_access' as const;

export type WorldIdAction = string;

const ACTION_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

function sanitizeWorldIdAction(action: unknown): WorldIdAction | null {
  if (typeof action !== 'string') {
    return null;
  }

  const normalized = action.trim();

  if (!ACTION_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function isValidWorldIdAction(action: string): action is WorldIdAction {
  return sanitizeWorldIdAction(action) !== null;
}

export function getConfiguredWorldIdAction(): WorldIdAction {
  const envAction = sanitizeWorldIdAction(process.env.NEXT_PUBLIC_ACTION);

  if (envAction) {
    return envAction;
  }

  return FALLBACK_ACTION;
}

export const DEFAULT_WORLD_ID_ACTION: WorldIdAction = getConfiguredWorldIdAction();
