from datetime import datetime, timedelta


REVIEW_INTERVAL_DAYS = (1, 3, 7, 14, 30)


def next_review_at(stage: int, base: datetime | None = None) -> datetime | None:
    """Return the next review time for a zero-based completed review stage."""
    if stage < 0:
        stage = 0
    if stage >= len(REVIEW_INTERVAL_DAYS):
        return None
    return (base or datetime.now()) + timedelta(days=REVIEW_INTERVAL_DAYS[stage])


def weekly_suggestions(
    *,
    practice_total: int,
    accuracy: int,
    note_count: int,
    weak_points: list[str],
    due_reviews: int,
) -> list[str]:
    suggestions: list[str] = []
    if due_reviews:
        suggestions.append(f"先完成 {due_reviews} 项到期复习，避免薄弱点继续累积。")
    if practice_total == 0:
        suggestions.append("下周至少完成一组练习，用主动回忆代替只看答案。")
    elif accuracy < 70:
        suggestions.append("练习正确率暂未达到 70%，优先重做错题并写下出错原因。")
    elif accuracy >= 90:
        suggestions.append("练习掌握较稳，可以增加综合题或跨主题应用。")
    if weak_points:
        suggestions.append("重点巩固：" + "、".join(weak_points[:3]) + "。")
    if note_count == 0:
        suggestions.append("整理一份本周笔记，用自己的话总结关键概念。")
    if not suggestions:
        suggestions.append("保持当前节奏，并按复习计划完成下一轮主动回忆。")
    return suggestions[:4]
