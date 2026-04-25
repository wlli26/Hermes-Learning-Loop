const PROMOTION_HIT_THRESHOLD = 3; // 命中 3 次自动晋升
const STALE_DAYS_THRESHOLD = 30; // 30 天未命中降为 stale
export function advanceSkillLifecycle(store) {
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
    }
}
function daysSince(isoDate, now) {
    const past = new Date(isoDate);
    const diffMs = now.getTime() - past.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
}
