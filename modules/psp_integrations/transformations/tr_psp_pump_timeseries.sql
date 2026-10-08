/* One numeric CogniteTimeSeries per pump and metric, linked to the pump asset.
   The metric list is fixed, so the readings are unpivoted with an explode.

   name is deliberately identical to externalId. A CogniteTimeSeries created here
   has no classic externalId, so the datapoints transformation has to find it in
   the time series service by name - see tr_psp_pump_datapoints.sql. */

/* cdf_raw() reads the rows without inferring a schema: key, lastUpdatedTime and the
   row's JSON in `columns`. Reading the table by name infers the columns from the rows
   that exist, so before the first reading arrives `pump_id` would not exist and every
   run would fail. */
select
  concat(`pump_id`, ':', `metric`) as externalId,
  concat(`pump_id`, ':', `metric`) as name,
  concat(`metric`, ' for pump ', `pump_id`) as description,
  'numeric' as type,
  false as isStep,
  /* assets is a list of direct relations on CogniteTimeSeries, so a single
     reference still has to be wrapped in an array. */
  array(node_reference('{{ space }}', `pump_id`)) as assets
from (
  select distinct
    get_json_object(`columns`, '$.pump_id') as `pump_id`,
    explode(array('flow_rate', 'pressure', 'temperature')) as `metric`
  from cdf_raw('{{ rawDatabase }}', '{{ rawTable }}')
  where get_json_object(`columns`, '$.pump_id') is not null
)
