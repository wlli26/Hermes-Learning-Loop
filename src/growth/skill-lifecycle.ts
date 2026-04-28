import { LearningStore } from "../store/learning-store.js";

const PROMOTION_HIT_THRESHOLD = 3;
const STALE_DAYS_THRESHOLD = 30;
const DEPRECATED_DAYS_THRESHOLD = 90;

export function advanceSkillLifecycle(store: LearningStore) {
  const skills = store.listAllSkills();
  const now = new Date();

  for (const skill of skills) {
    if (skill.state === "candidate" && skill.hitCount >= PROMOTION_HIT_THRESHOLD) {
      store.updateSkillState(skill.slug, "promoted");
    }

    if (skill.state === "promoted") {
      const daysSinceUpdate = daysSince(skill.updatedAt, now);
      if (daysSinceUpdate > STALE_DAYS_THRESHOLD) {
        store.updateSkillState(skill.slug, "stale");
      }
    }

    if (skill.state === "stale") {
      const daysSinceUpdate = daysSince(skill.updatedAt, now);
      if (daysSinceUpdate > DEPRECATED_DAYS_THRESHOLD) {
        store.updateSkillState(skill.slug, "deprecated");
      }
    }
  }
}

function daysSince(isoDate: string, now: Date): number {
  const past = new Date(isoDate);
  const diffMs = now.getTime() - past.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}
