/* The asset hierarchy: a "Pump house" root, with one asset per pump seen in the staged
   readings below it.

   cdf_raw() reads the rows without inferring a schema: key, lastUpdatedTime and the
   row's JSON in `columns`. Reading the table by name infers the columns from the rows
   that exist, so before the first reading arrives `pump_id` would not exist and every
   run would fail.

   The root comes first and has no parent. `parent` is a direct relation, which the
   union needs typed the same on both sides. */
select
  'PUMP-HOUSE' as externalId,
  'Pump house' as name,
  'The pump house that the pumps below belong to' as description,
  cast(null as struct<space: string, externalId: string>) as parent

union all

select
  `pump_id` as externalId,
  `pump_id` as name,
  'Pump fed by the psp-integrations-getting-started feed' as description,
  node_reference('{{ space }}', 'PUMP-HOUSE') as parent
from (
  select distinct get_json_object(`columns`, '$.pump_id') as `pump_id`
  from cdf_raw('{{ rawDatabase }}', '{{ rawTable }}')
  where get_json_object(`columns`, '$.pump_id') is not null
)
