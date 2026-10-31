create index if not exists transactions_user_date_ledger_idx
  on public.transactions (user_id, date desc nulls last, created_at desc nulls last, id desc);

create index if not exists transactions_user_account_date_idx
  on public.transactions (user_id, account_type_id, date desc nulls last, id desc);

create or replace function public.get_transaction_ledger(
  p_filters jsonb default '{}'::jsonb,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  sort_expression text;
  sort_direction text;
  result jsonb;
begin
  sort_expression := case p_filters ->> 'sort'
    when 'amount' then 'amount'
    when 'merchant' then 'lower(merchant)'
    else 'date'
  end;
  sort_direction := case p_filters ->> 'order' when 'asc' then 'asc' else 'desc' end;

  execute format($query$
    with filtered as not materialized (
      select t.*
      from public.transactions t
      where t.user_id = $1
        and ($2 = ''
          or position(lower($2) in lower(coalesce(t.merchant, ''))) > 0
          or position(lower($2) in lower(coalesce(t.category, ''))) > 0
          or position(lower($2) in lower(coalesce(t.notes, ''))) > 0)
        and (cardinality($3) = 0
          or t.account_type_id = any(array(
            select case when account ~ '^[0-9]{1,10}$' then
              case when account::bigint <= 2147483647 then account::integer end
            end from unnest($3) account
          ))
          or (t.account_type_id is null and '__unassigned__' = any($3)))
        and (cardinality($4) = 0
          or t.category = any($4)
          or regexp_replace(lower(t.category), '\s+', '-', 'g') = any($4))
        and ($5 is null or t.date >= $5)
        and ($6 is null or t.date <= $6)
        and ($7 is null or t.amount >= $7)
        and ($8 is null or t.amount <= $8)
    ), totals as (
      select count(*) as total_count,
        coalesce(sum(amount) filter (where transaction_type = 'incoming'
          and case when incoming_subtype in ('income', 'reimbursement')
            then incoming_subtype = 'income'
            else category is distinct from 'expense-reimbursement' end), 0) as income,
        coalesce(sum(coalesce(spending_amount, amount)) filter (
          where transaction_type = 'outgoing'), 0) as spending,
        coalesce(max(amount) filter (where transaction_type = 'incoming'
          and case when incoming_subtype in ('income', 'reimbursement')
            then incoming_subtype = 'income'
            else category is distinct from 'expense-reimbursement' end), 0) as largest_income,
        coalesce(max(coalesce(spending_amount, amount)) filter (
          where transaction_type = 'outgoing'), 0) as largest_expense
      from filtered
    ), pagination as (
      select least($9, greatest(1, ceil(total_count::numeric / $10)::integer)) as page
      from totals
    ), page_rows as (
      select * from filtered
      order by %s %s nulls last, created_at desc nulls last, id desc
      limit $10 offset ((select page from pagination) - 1)::bigint * $10
    )
    select jsonb_build_object(
      'transactions', coalesce((select jsonb_agg(to_jsonb(page_rows)
        order by %s %s nulls last, created_at desc nulls last, id desc) from page_rows), '[]'::jsonb),
      'page', (select page from pagination),
      'pageSize', $10,
      'totalCount', total_count,
      'summary', jsonb_build_object(
        'totalTransactions', total_count,
        'totalIncome', income,
        'totalSpending', spending,
        'largestIncome', largest_income,
        'largestExpense', largest_expense,
        'averageTransaction', case when total_count = 0 then 0 else (income + spending) / total_count end,
        'net', income - spending
      )
    ) from totals
  $query$, sort_expression, sort_direction, sort_expression, sort_direction)
  into result
  using (select auth.jwt() ->> 'sub'),
    left(coalesce(p_filters ->> 'search', ''), 500),
    coalesce(array(select jsonb_array_elements_text(p_filters -> 'accounts')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(p_filters -> 'categories')), '{}'::text[]),
    (p_filters ->> 'from')::date,
    (p_filters ->> 'to')::date,
    (p_filters ->> 'min')::numeric,
    (p_filters ->> 'max')::numeric,
    greatest(1, least(coalesce(p_page, 1), 1000000)),
    greatest(1, least(coalesce(p_page_size, 50), 100));

  return result;
end;
$function$;

revoke all on function public.get_transaction_ledger(jsonb, integer, integer) from public, anon;
grant execute on function public.get_transaction_ledger(jsonb, integer, integer) to authenticated;
