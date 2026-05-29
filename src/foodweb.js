// ===========================================================================
//  Food web — derives a trophic structure (who eats whom) from the species
//  diet data for the Stats > Food Web reference diagram.
// ===========================================================================
import { SPECIES, SPECIES_INDEX } from './config.js';

// Trophic level: producers (plants / no diet) are 0; a consumer is one above
// the highest level it eats. Cycles are guarded (a back-edge contributes 0).
export function trophicLevels() {
  const n = SPECIES.length;
  const level = new Array(n).fill(-1);
  const visiting = new Array(n).fill(false);

  const compute = (i) => {
    if (level[i] >= 0) return level[i];
    const sp = SPECIES[i];
    if (sp.kind === 'plant' || !sp.diet || sp.diet.length === 0) {
      level[i] = 0;
      return 0;
    }
    if (visiting[i]) return 0; // break cycles
    visiting[i] = true;
    let m = 0;
    for (const d of sp.diet) m = Math.max(m, 1 + compute(SPECIES_INDEX[d]));
    visiting[i] = false;
    level[i] = m;
    return m;
  };

  for (let i = 0; i < n; i++) compute(i);
  return level;
}

// Full structure for rendering: per-species level, species grouped by level,
// and prey->predator edges as [fromIndex, toIndex].
export function buildFoodWeb() {
  const level = trophicLevels();
  const maxLevel = Math.max(...level);
  const byLevel = Array.from({ length: maxLevel + 1 }, () => []);
  level.forEach((l, i) => byLevel[l].push(i));

  const edges = [];
  SPECIES.forEach((sp, i) => {
    (sp.diet || []).forEach(d => edges.push([SPECIES_INDEX[d], i]));
  });

  return { level, maxLevel, byLevel, edges };
}
