// One goal drives the camera, world chevron, edge beacon and keyboard launch.
export function selectGardenGoal(state) {
  if (state.completed) return null;
  const mission = state.mission || {};
  if (mission.core && !mission.core.carried) return { ...mission.core, kind: 'core' };
  if (mission.gateOpen) return state.exit ? { ...state.exit, kind: 'exit' } : null;
  const player = state.position || { x: 0, y: 0 };
  return (mission.targets || []).filter(target => !target.completed && target.next !== false)
    .reduce((best, target) => !best || Math.hypot(target.x - player.x, target.y - player.y)
      < Math.hypot(best.x - player.x, best.y - player.y) ? target : best, null);
}
