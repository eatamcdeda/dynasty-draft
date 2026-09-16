import playersJson from "./players.json";
import type { Player, Position } from "./types";

export const PLAYERS: Player[] = playersJson.map((player) => ({
  ...player,
  position: player.position as Position,
}));
