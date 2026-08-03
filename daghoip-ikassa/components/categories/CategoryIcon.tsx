import {
  Baby,
  Bike,
  Briefcase,
  Car,
  HardHat,
  Home,
  Key,
  Laptop,
  MapPinned,
  Package,
  PawPrint,
  Shirt,
  Smartphone,
  Sofa,
  Store,
  Tv,
  Wheat,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

/**
 * Table de correspondance entre le champ `categories.icon` (rempli par
 * `supabase/seed.sql`) et les icônes `lucide-react`.
 *
 * Un import explicite est indispensable : un import dynamique par nom
 * embarquerait toute la librairie dans le bundle.
 */
const ICONS: Record<string, LucideIcon> = {
  Baby,
  Bike,
  Briefcase,
  Car,
  HardHat,
  Home,
  Key,
  Laptop,
  MapPinned,
  Package,
  PawPrint,
  Shirt,
  Smartphone,
  Sofa,
  Store,
  Tv,
  Wheat,
  Wrench,
};

export interface CategoryIconProps {
  name: string | null;
  className?: string;
}

export function CategoryIcon({ name, className }: CategoryIconProps) {
  const Icon = (name && ICONS[name]) || Package;
  return <Icon className={className} aria-hidden="true" />;
}
