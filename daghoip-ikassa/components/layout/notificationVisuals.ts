/**
 * Apparence d'une notification selon son type.
 *
 * Treize types partageaient jusqu'ici la même icône : dans une liste, rien ne
 * distinguait « votre annonce est approuvée » de « vous avez un message ». Or
 * c'est exactement ce qu'on cherche à repérer d'un coup d'œil dans une cloche.
 *
 * Les teintes suivent la sémantique déjà employée ailleurs : vert de marque
 * pour l'ordinaire, doré pour ce qui valorise, ambre pour ce qui appelle une
 * action, rouge pour ce qui a échoué.
 */
import {
  BadgeCheck,
  Ban,
  Bell,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Heart,
  MessageSquare,
  Star,
  Tag,
  TimerOff,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import type { NotificationType } from '@/types/database';

export interface NotificationVisual {
  icon: LucideIcon;
  /** Classe de couleur du pictogramme. */
  tone: string;
}

const VISUALS: Record<NotificationType, NotificationVisual> = {
  new_message: { icon: MessageSquare, tone: 'text-brand-600' },
  ad_published: { icon: Tag, tone: 'text-brand-600' },
  ad_approved: { icon: BadgeCheck, tone: 'text-emerald-800' },
  ad_rejected: { icon: Ban, tone: 'text-red-700' },
  ad_expiring: { icon: CalendarClock, tone: 'text-amber-800' },
  ad_expired: { icon: TimerOff, tone: 'text-neutral-500' },
  ad_sold: { icon: CheckCircle2, tone: 'text-emerald-800' },
  new_review: { icon: Star, tone: 'text-gold-600' },
  new_favorite: { icon: Heart, tone: 'text-gold-600' },
  subscription_expiring: { icon: CalendarClock, tone: 'text-amber-800' },
  payment_succeeded: { icon: CreditCard, tone: 'text-emerald-800' },
  payment_failed: { icon: XCircle, tone: 'text-red-700' },
  system: { icon: Bell, tone: 'text-neutral-500' },
};

/** Repli sur la cloche générique : un type inconnu ne doit pas casser le rendu. */
export function notificationVisual(type: NotificationType): NotificationVisual {
  return VISUALS[type] ?? { icon: Bell, tone: 'text-neutral-500' };
}
