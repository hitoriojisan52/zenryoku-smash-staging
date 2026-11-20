-- Experimental read projection for OFFLINE FICTIONAL fixtures only.
-- No authorization, GAS parity, date-format repair or production cutover.
-- Server must authorize LINE member & duty role separately before ever using this.
-- Source GAS: scheduleList_ uses >= todayJST and sorts date/startTime, includes
-- unpublished (enabled=0) schedules. Whole-table duplicate dates block reads.
SELECT
  practice_id, practice_date, place, start_time, end_time,
  hours, enabled, remark, version
FROM practices
WHERE practice_date >= ?
ORDER BY practice_date, start_time;
