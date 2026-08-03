-- =============================================================================
--  Introspection du schéma, pour comparaison avec `types/database.ts`
-- =============================================================================
--  Émet un document JSON décrivant ce que la base contient réellement :
--  énumérations, tables, colonnes et fonctions du schéma `public`.
--
--  Sert au test d'intégration `tests/schema.test.mts`. `types/database.ts` est
--  écrit **à la main** — c'est un miroir, et un miroir dérive. Une colonne
--  ajoutée en SQL et oubliée côté TypeScript ne se voit nulle part : le code
--  compile, les tests passent, et la requête échoue en production sur un champ
--  que personne ne croyait absent.
-- =============================================================================
\pset tuples_only on
\pset format unaligned

select json_build_object(
  'enums', (
    select coalesce(json_object_agg(nom, valeurs), '{}'::json)
      from (
        select t.typname as nom,
               array_agg(e.enumlabel order by e.enumsortorder) as valeurs
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'public'
         group by t.typname
      ) as enumerations
  ),
  'tables', (
    select coalesce(json_object_agg(nom, colonnes), '{}'::json)
      from (
        select c.table_name as nom,
               json_agg(
                 json_build_object(
                   'nom', c.column_name,
                   'type', c.udt_name,
                   'nullable', c.is_nullable = 'YES'
                 )
                 order by c.ordinal_position
               ) as colonnes
          from information_schema.columns c
          join information_schema.tables t
            on t.table_schema = c.table_schema and t.table_name = c.table_name
         where c.table_schema = 'public'
           and t.table_type = 'BASE TABLE'
         group by c.table_name
      ) as tables_publiques
  ),
  'fonctions', (
    select coalesce(json_agg(distinct p.proname), '[]'::json)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       /*
        * Celles qu'un client peut appeler — `authenticated` **ou**
        * `service_role`. Ne retenir que la première écartait à tort
        * `apply_payment_callback`, `claim_pending_emails` et `mark_email_sent`,
        * qui sont bel et bien typées et appelées : simplement, elles le sont
        * par le client de service, jamais depuis le navigateur. Le test les
        * signalait donc comme inexistantes alors qu'elles existent.
        *
        * Les fonctions internes (triggers, maintenance) restent exclues : elles
        * n'ont aucune raison de figurer dans le typage.
        */
       and (
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('service_role', p.oid, 'EXECUTE')
       )
       and p.prokind = 'f'
  )
);
