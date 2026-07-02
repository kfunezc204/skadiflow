-- Repairs historical data corrupted by the pause/resume double-counting bug.
--
-- Sessions were logged with "elapsed since PHASE start" instead of their own
-- span, so every pause/resume cycle inflated duration_minutes (and, through
-- syncTaskActualMinutes, tasks.actual_minutes). Each session's started_at /
-- ended_at timestamps were always correct, so the true duration is recoverable.
--
-- Idempotent by construction: recomputing twice yields the same values.

-- 1. Recompute every closed session's duration from its own timestamps.
UPDATE sessions
SET duration_minutes = MAX(0, CAST(ROUND((julianday(ended_at) - julianday(started_at)) * 1440) AS INTEGER))
WHERE ended_at IS NOT NULL;

-- 2. Recompute each task's accumulated focus minutes from its repaired sessions.
UPDATE tasks
SET actual_minutes = COALESCE((
    SELECT SUM(s.duration_minutes)
    FROM sessions s
    WHERE s.task_id = tasks.id
      AND s.session_type = 'focus'
      AND s.duration_minutes IS NOT NULL
), 0);
