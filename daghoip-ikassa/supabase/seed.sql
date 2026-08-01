-- =============================================================================
--  Daghoip Ikassa — Données de référence (catégories)
-- =============================================================================
--  À exécuter APRÈS `schema.sql`. Idempotent : rejouable sans doublon.
--  Les icônes correspondent aux noms d'icônes `lucide-react` utilisés par
--  `components/categories/CategoryIcon.tsx`.
-- =============================================================================

insert into public.categories (slug, name, icon, description, "position") values
  ('vehicules',            'Véhicules',                'Car',          'Voitures, motos, pièces détachées et location', 10),
  ('immobilier',           'Immobilier',               'Home',         'Locations, ventes, terrains et bureaux',        20),
  ('telephones-tablettes', 'Téléphones & Tablettes',   'Smartphone',   'Smartphones, tablettes et accessoires',         30),
  ('informatique',         'Informatique',             'Laptop',       'Ordinateurs, imprimantes et réseaux',           40),
  ('electronique',         'Électronique & Électroménager', 'Tv',      'TV, audio, froid et petit électroménager',      50),
  ('maison-jardin',        'Maison & Jardin',          'Sofa',         'Meubles, décoration, bricolage et jardin',      60),
  ('mode-beaute',          'Mode & Beauté',            'Shirt',        'Vêtements, chaussures, cosmétiques',            70),
  ('emploi',               'Emploi',                   'Briefcase',    'Offres et demandes d’emploi au Gabon',          80),
  ('services',             'Services',                 'Wrench',       'Artisans, cours, événementiel, transport',      90),
  ('materiel-pro',         'Matériel professionnel',   'HardHat',      'BTP, agriculture, restauration, bureau',       100),
  ('loisirs-sports',       'Loisirs & Sports',         'Bike',         'Sport, musique, livres, jeux',                 110),
  ('alimentation',         'Alimentation & Agriculture', 'Wheat',      'Produits vivriers, élevage, pêche',            120),
  ('enfants-bebes',        'Enfants & Bébés',          'Baby',         'Puériculture, jouets, vêtements enfants',      130),
  ('animaux',              'Animaux',                  'PawPrint',     'Animaux de compagnie et accessoires',          140),
  ('divers',               'Divers',                   'Package',      'Tout ce qui n’entre pas ailleurs',             150)
on conflict (slug) do update
  set name        = excluded.name,
      icon        = excluded.icon,
      description = excluded.description,
      "position"  = excluded."position";

-- --- Sous-catégories principales ---------------------------------------------
insert into public.categories (slug, name, icon, parent_id, "position")
select v.slug, v.name, v.icon, parent.id, v."position"
from (values
  ('voitures',         'Voitures',              'Car',        'vehicules',   1),
  ('motos-scooters',   'Motos & Scooters',      'Bike',       'vehicules',   2),
  ('pieces-auto',      'Pièces & Accessoires',  'Wrench',     'vehicules',   3),
  ('location-vehicule','Location de véhicule',  'Key',        'vehicules',   4),
  ('location-maison',  'Locations',             'Key',        'immobilier',  1),
  ('vente-maison',     'Ventes',                'Home',       'immobilier',  2),
  ('terrains',         'Terrains',              'MapPinned',  'immobilier',  3),
  ('bureaux-commerces','Bureaux & Commerces',   'Store',      'immobilier',  4)
) as v(slug, name, icon, parent_slug, "position")
join public.categories parent on parent.slug = v.parent_slug
on conflict (slug) do nothing;
