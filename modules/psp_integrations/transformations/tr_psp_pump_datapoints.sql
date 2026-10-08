/* Datapoints for the CogniteTimeSeries built by tr_psp_pump_timeseries.

   The datapoints destination addresses a time series by `id` or `externalId`. A
   CogniteTimeSeries created through data modeling has no classic externalId - it is
   addressed by instanceId, which this destination does not accept - so the numeric
   `id` is looked up from the time series service instead. The series are matched on
   name, which tr_psp_pump_timeseries sets to the same "<pump>:<metric>" string as
   the externalId, and the externalId IS NULL filter keeps the match to series that
   came from data modeling. */

/* cdf_raw() reads the rows without inferring a schema: key, lastUpdatedTime and the
   row's JSON in `columns`. Reading the table by name infers the columns from the rows
   that exist, so before the first reading arrives `pump_id` would not exist and every
   run would fail. */
select
  ts.`id` as id,
  to_timestamp(readings.`reading_time`) as timestamp,
  cast(readings.`reading_value` as DOUBLE) as value
from (
  select
    get_json_object(`columns`, '$.pump_id') as `pump_id`,
    get_json_object(`columns`, '$.timestamp') as `reading_time`,
    /* The values are read as text and cast to DOUBLE above, so a bad one like "N/A"
       cannot be loaded, which fails this transformation. */
    stack(
      3,
      'flow_rate', get_json_object(`columns`, '$.flow_rate'),
      'pressure', get_json_object(`columns`, '$.pressure'),
      'temperature', get_json_object(`columns`, '$.temperature')
    ) as (`metric`, `reading_value`)
  from cdf_raw('{{ rawDatabase }}', '{{ rawTable }}')
  where get_json_object(`columns`, '$.pump_id') is not null
    and get_json_object(`columns`, '$.timestamp') is not null
) readings
join _cdf.timeseries ts
  on ts.`name` = concat(readings.`pump_id`, ':', readings.`metric`)
 and ts.`externalId` is null
