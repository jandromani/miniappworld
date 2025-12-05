export const ALLOWED_WORLD_ID_ACTIONS = ['trivia_game_access'] as const;

export type WorldIdAction = (typeof ALLOWED_WORLD_ID_ACTIONS)[number];

export const DEFAULT_WORLD_ID_ACTION: WorldIdAction = ALLOWED_WORLD_ID_ACTIONS[0];

export function isValidWorldIdAction(action: string): action is WorldIdAction {
  return ALLOWED_WORLD_ID_ACTIONS.includes(action as WorldIdAction);
}
