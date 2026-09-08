# Implementation decisions

## 2026-09-07: playable board and multiplayer foundation

- The original JPEG is a mapping reference. The game renders SVG hexes from server-owned terrain and harbor data. Preserve the source image; keep a derived mapping preview for review. Any uncertain photo classifications remain documented rather than claiming an exact map prematurely.
- Normal play assigns one captain per browser profile using a server-signed, HttpOnly session cookie. Tabs share that captain. Additional browsers can watch. Local hot-seat controls are not part of normal multiplayer.
- The first captain hosts the lobby and selects the first player on the group's behalf. The remaining order follows seats, rotated to that first player, then uses the rules' snake draft.
- Initial ship placement is a separate setup phase, in draft order. Each owner places two ships in each owned port's harbor before play begins.
- Provisional timers are configurable: 120 seconds per round and 45 seconds per action. They still need playtesting. A timeout uses normal construction completion; unchosen optional builds are declined. If a battle needs a casualty at timeout, the server removes the first eligible ship in stable ID order and resolves mandatory battles before advancing. Public events explain automatic decisions.
- Combat assistance is measured from each team's triggering ship, never from its helpers. Opposing ships in the same harbor trigger combat even when nonadjacent. A harbor contributes a die to its owner when both triggering ships occupy that harbor. Third-party ports do not introduce a third combat team.
- Every movement route is checked hex by hex and stops at its first combat trigger, preserving unused movement. After a battle, any remaining mandatory encounters must be resolved before movement resumes.
- A completed port attack remains visible in the shared battle dialog until the active captain continues; rolls are retained in the public event log. A tie requires another public roll.
- Players with ports but no ships go directly to construction selection. Eliminated players are skipped. Finishing construction never gives movement on the turn of completion.
- Characters initially use named, code-drawn emblems. Perks remain disabled as required by GAME_RULES.md until their mechanics are specified and balanced.
- The incompatible original prototype save is preserved. The new board/session schema uses a separate local-development save file. Database-backed matches and managed authentication remain release requirements.
