-- =============================================================================
--  Daghoip Ikassa — Données de référence
-- =============================================================================
--  À exécuter APRÈS les migrations. Idempotent : rejouable sans doublon.
--  Contenu : offres d'abonnement, catégories et sous-catégories.
-- =============================================================================

-- =============================================================================
-- 1. Offres d'abonnement
-- =============================================================================
--  Le plan `free` est obligatoire : il définit les quotas appliqués aux comptes
--  sans abonnement actif (voir public.ad_quota).
--  Montants en FCFA, calibrés pour le pouvoir d'achat local.
-- -----------------------------------------------------------------------------
insert into public.subscription_plans (
  code, name, description, price, billing_interval,
  max_active_ads, featured_ads_quota, max_images_per_ad,
  has_priority_support, has_verified_badge, "position"
) values
  ('free', 'Gratuit',
   'Pour les particuliers qui vendent occasionnellement.',
   0, 'monthly', 5, 0, 5, false, false, 10),

  ('starter', 'Starter',
   'Pour vendre régulièrement : plus d’annonces et plus de photos.',
   5000, 'monthly', 25, 1, 8, false, false, 20),

  ('pro', 'Professionnel',
   'Pour les boutiques et revendeurs : badge vérifié et mises en avant incluses.',
   15000, 'monthly', 100, 5, 8, true, true, 30),

  ('pro_yearly', 'Professionnel — annuel',
   'L’offre Professionnel avec deux mois offerts.',
   150000, 'yearly', 100, 60, 8, true, true, 40),

  ('business', 'Entreprise',
   'Volume illimité en pratique, support prioritaire et accompagnement.',
   50000, 'monthly', 1000, 20, 8, true, true, 50)
on conflict (code) do update
  set name                 = excluded.name,
      description          = excluded.description,
      price                = excluded.price,
      billing_interval     = excluded.billing_interval,
      max_active_ads       = excluded.max_active_ads,
      featured_ads_quota   = excluded.featured_ads_quota,
      max_images_per_ad    = excluded.max_images_per_ad,
      has_priority_support = excluded.has_priority_support,
      has_verified_badge   = excluded.has_verified_badge,
      "position"           = excluded."position";

-- =============================================================================
-- 2. Catégories racines
-- =============================================================================
--  `icon` référence un nom d'icône lucide-react (components/categories/CategoryIcon.tsx).
-- -----------------------------------------------------------------------------
insert into public.categories (slug, name, icon, description, "position") values
  ('vehicules',            'Véhicules',                     'Car',        'Voitures, motos, pièces détachées et location',  10),
  ('immobilier',           'Immobilier',                    'Home',       'Locations, ventes, terrains et bureaux',         20),
  ('telephones-tablettes', 'Téléphones & Tablettes',        'Smartphone', 'Smartphones, tablettes et accessoires',          30),
  ('informatique',         'Informatique',                  'Laptop',     'Ordinateurs, imprimantes et réseaux',            40),
  ('electronique',         'Électronique & Électroménager', 'Tv',         'TV, audio, froid et petit électroménager',       50),
  ('maison-jardin',        'Maison & Jardin',               'Sofa',       'Meubles, décoration, bricolage et jardin',       60),
  ('mode-beaute',          'Mode & Beauté',                 'Shirt',      'Vêtements, chaussures, cosmétiques',             70),
  ('emploi',               'Emploi',                        'Briefcase',  'Offres et demandes d’emploi au Gabon',           80),
  ('services',             'Services',                      'Wrench',     'Artisans, cours, événementiel, transport',       90),
  ('materiel-pro',         'Matériel professionnel',        'HardHat',    'BTP, agriculture, restauration, bureau',        100),
  ('loisirs-sports',       'Loisirs & Sports',              'Bike',       'Sport, musique, livres, jeux',                  110),
  ('alimentation',         'Alimentation & Agriculture',    'Wheat',      'Produits vivriers, élevage, pêche',             120),
  ('enfants-bebes',        'Enfants & Bébés',               'Baby',       'Puériculture, jouets, vêtements enfants',       130),
  ('animaux',              'Animaux',                       'PawPrint',   'Animaux de compagnie et accessoires',           140),
  ('divers',               'Divers',                        'Package',    'Tout ce qui n’entre pas ailleurs',              150)
on conflict (slug) do update
  set name        = excluded.name,
      icon        = excluded.icon,
      description = excluded.description,
      "position"  = excluded."position";

-- =============================================================================
-- 3. Sous-catégories
-- =============================================================================
insert into public.categories (slug, name, icon, parent_id, "position")
select v.slug, v.name, v.icon, parent.id, v.position
from (values
  -- Véhicules
  ('voitures',           'Voitures',                'Car',        'vehicules',   1),
  ('motos-scooters',     'Motos & Scooters',        'Bike',       'vehicules',   2),
  ('pieces-auto',        'Pièces & Accessoires',    'Wrench',     'vehicules',   3),
  ('location-vehicule',  'Location de véhicule',    'Key',        'vehicules',   4),
  ('camions-engins',     'Camions & Engins',        'HardHat',    'vehicules',   5),
  -- Immobilier
  ('location-logement',  'Locations',               'Key',        'immobilier',  1),
  ('vente-logement',     'Ventes',                  'Home',       'immobilier',  2),
  ('terrains',           'Terrains',                'MapPinned',  'immobilier',  3),
  ('bureaux-commerces',  'Bureaux & Commerces',     'Store',      'immobilier',  4),
  ('colocation',         'Colocation',              'Home',       'immobilier',  5),
  -- Emploi
  ('offres-emploi',      'Offres d’emploi',         'Briefcase',  'emploi',      1),
  ('demandes-emploi',    'Demandes d’emploi',       'Briefcase',  'emploi',      2),
  ('stages',             'Stages & Alternance',     'Briefcase',  'emploi',      3),
  -- Services
  ('artisans',           'Artisans & Travaux',      'Wrench',     'services',    1),
  ('cours',              'Cours & Formation',       'Briefcase',  'services',    2),
  ('transport',          'Transport & Déménagement','Car',        'services',    3),
  ('evenementiel',       'Événementiel',            'Store',      'services',    4)
) as v(slug, name, icon, parent_slug, position)
join public.categories parent on parent.slug = v.parent_slug
on conflict (slug) do nothing;

-- =============================================================================
-- 4. Amorçage des statistiques
-- =============================================================================
select public.refresh_platform_stats();
