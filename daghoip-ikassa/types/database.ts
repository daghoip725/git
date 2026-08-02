/**
 * Typage de la base de données Supabase.
 *
 * Miroir TypeScript de `supabase/migrations/*.sql`. Régénérable avec :
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public > types/database.ts
 *
 * Toute évolution du schéma doit être répercutée ici (ou régénérée).
 */

/* -------------------------------------------------------------------------- */
/*  Types énumérés                                                            */
/* -------------------------------------------------------------------------- */

export type UserRole = 'user' | 'moderator' | 'admin';

export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted';

export type AdStatus =
  'draft' | 'pending_review' | 'published' | 'sold' | 'expired' | 'rejected' | 'archived';

export type AdCondition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts';

export type PriceType = 'fixed' | 'negotiable' | 'free' | 'on_request';

export type NotificationType =
  | 'new_message'
  | 'ad_published'
  | 'ad_approved'
  | 'ad_rejected'
  | 'ad_expiring'
  | 'ad_expired'
  | 'ad_sold'
  | 'new_review'
  | 'new_favorite'
  | 'subscription_expiring'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'system';

export type ReviewStatus = 'published' | 'pending' | 'hidden';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type AuditAction =
  | 'role_changed'
  | 'status_changed'
  | 'verification_requested'
  | 'verification_approved'
  | 'verification_rejected'
  | 'ad_moderated'
  | 'report_resolved';

export type ReportTargetType = 'ad' | 'user' | 'message' | 'review';

export type ReportReason =
  | 'spam'
  | 'fraud'
  | 'prohibited'
  | 'duplicate'
  | 'wrong_category'
  | 'offensive'
  | 'harassment'
  | 'fake_profile'
  | 'other';

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export type PaymentProvider =
  'airtel_money' | 'moov_money' | 'card' | 'bank_transfer' | 'cash' | 'manual';

export type PaymentStatus =
  'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

export type PaymentPurpose = 'subscription' | 'ad_feature' | 'ad_boost' | 'verification' | 'other';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

export type BillingInterval = 'monthly' | 'quarterly' | 'yearly';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/* -------------------------------------------------------------------------- */
/*  Schéma                                                                    */
/* -------------------------------------------------------------------------- */

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string | null;
          full_name: string;
          /** Non lisible publiquement (privilège de colonne). */
          phone: string | null;
          /** Non lisible publiquement (privilège de colonne). */
          whatsapp: string | null;
          city: string | null;
          province: string | null;
          /** Non lisible publiquement (privilège de colonne). */
          district: string | null;
          avatar_path: string | null;
          bio: string | null;
          is_professional: boolean;
          business_name: string | null;
          is_verified: boolean;
          role: UserRole;
          status: AccountStatus;
          rating_average: number;
          rating_count: number;
          ads_count: number;
          /** Confirmé par OTP SMS. Positionné par trigger, non modifiable. */
          phone_verified: boolean;
          /** Confirmé par lien e-mail ou par le fournisseur OAuth. */
          email_verified: boolean;
          /** 'email' | 'phone' | 'google' | 'facebook' */
          auth_provider: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          full_name: string;
          phone?: string | null;
          whatsapp?: string | null;
          city?: string | null;
          province?: string | null;
          district?: string | null;
          avatar_path?: string | null;
          bio?: string | null;
          is_professional?: boolean;
          business_name?: string | null;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']> & {
          last_seen_at?: string | null;
        };
        Relationships: [];
      };

      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          icon: string | null;
          description: string | null;
          parent_id: string | null;
          position: number;
          is_active: boolean;
          ads_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          icon?: string | null;
          description?: string | null;
          parent_id?: string | null;
          position?: number;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };

      ads: {
        Row: {
          id: string;
          reference: string;
          seller_id: string;
          category_id: string;
          title: string;
          slug: string;
          description: string;
          price: number | null;
          price_type: PriceType;
          currency: string;
          condition: AdCondition | null;
          city: string;
          province: string | null;
          district: string | null;
          latitude: number | null;
          longitude: number | null;
          contact_phone: string | null;
          contact_whatsapp: string | null;
          allow_messages: boolean;
          status: AdStatus;
          is_featured: boolean;
          featured_until: string | null;
          views_count: number;
          favorites_count: number;
          messages_count: number;
          published_at: string | null;
          expires_at: string | null;
          sold_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Colonnes réellement accordées en INSERT au rôle `authenticated`. */
        Insert: {
          id?: string;
          seller_id: string;
          category_id: string;
          title: string;
          description: string;
          price?: number | null;
          price_type?: PriceType;
          currency?: string;
          condition?: AdCondition | null;
          city: string;
          province?: string | null;
          district?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          contact_phone?: string | null;
          contact_whatsapp?: string | null;
          allow_messages?: boolean;
          status?: AdStatus;
          /** Durée de publication souhaitée ; bornée à 7–90 jours par trigger. */
          expires_at?: string | null;
        };
        /** Colonnes réellement accordées en UPDATE au rôle `authenticated`. */
        Update: {
          title?: string;
          description?: string;
          category_id?: string;
          price?: number | null;
          price_type?: PriceType;
          condition?: AdCondition | null;
          city?: string;
          province?: string | null;
          district?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          contact_phone?: string | null;
          contact_whatsapp?: string | null;
          allow_messages?: boolean;
          status?: AdStatus;
          expires_at?: string | null;
        };
        Relationships: [];
      };

      ad_images: {
        Row: {
          id: string;
          ad_id: string;
          storage_path: string;
          position: number;
          width: number | null;
          height: number | null;
          byte_size: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ad_id: string;
          storage_path: string;
          position?: number;
          width?: number | null;
          height?: number | null;
          byte_size?: number | null;
        };
        Update: Partial<Database['public']['Tables']['ad_images']['Insert']>;
        Relationships: [];
      };

      favorites: {
        Row: { user_id: string; ad_id: string; created_at: string };
        Insert: { user_id: string; ad_id: string };
        Update: never;
        Relationships: [];
      };

      conversations: {
        Row: {
          id: string;
          ad_id: string;
          buyer_id: string;
          seller_id: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_sender_id: string | null;
          messages_count: number;
          buyer_unread_count: number;
          seller_unread_count: number;
          buyer_archived: boolean;
          seller_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { ad_id: string; buyer_id: string; seller_id: string };
        Update: { buyer_archived?: boolean; seller_archived?: boolean };
        Relationships: [];
      };

      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          attachment_path: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          conversation_id: string;
          sender_id: string;
          body: string;
          attachment_path?: string | null;
        };
        Update: { read_at?: string | null };
        Relationships: [];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          link: string | null;
          data: Json;
          read_at: string | null;
          created_at: string;
        };
        /** Aucune insertion côté client : voir `public.create_notification()`. */
        Insert: never;
        Update: { read_at?: string | null };
        Relationships: [];
      };

      reviews: {
        Row: {
          id: string;
          ad_id: string | null;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          status: ReviewStatus;
          reply: string | null;
          replied_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          ad_id?: string | null;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment?: string | null;
        };
        Update: {
          rating?: number;
          comment?: string | null;
          reply?: string | null;
          replied_at?: string | null;
          status?: ReviewStatus;
        };
        Relationships: [];
      };

      reports: {
        Row: {
          id: string;
          reporter_id: string | null;
          target_type: ReportTargetType;
          ad_id: string | null;
          target_user_id: string | null;
          message_id: string | null;
          review_id: string | null;
          reason: ReportReason;
          details: string | null;
          status: ReportStatus;
          resolved_by: string | null;
          resolved_at: string | null;
          resolution_note: string | null;
          created_at: string;
        };
        Insert: {
          reporter_id: string;
          target_type: ReportTargetType;
          ad_id?: string | null;
          target_user_id?: string | null;
          message_id?: string | null;
          review_id?: string | null;
          reason: ReportReason;
          details?: string | null;
        };
        Update: {
          status?: ReportStatus;
          resolved_by?: string | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
        };
        Relationships: [];
      };

      blocked_users: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          reason: string | null;
          created_at: string;
        };
        /** `blocker_id` est cloué à `auth.uid()` par la politique RLS. */
        Insert: { blocker_id: string; blocked_id: string; reason?: string | null };
        Update: { reason?: string | null };
        Relationships: [];
      };

      ad_feature_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          duration_days: number;
          price: number;
          currency: string;
          is_active: boolean;
          position: number;
          created_at: string;
        };
        /** Catalogue tarifaire : écriture réservée aux administrateurs (RLS). */
        Insert: {
          code: string;
          name: string;
          description?: string | null;
          duration_days: number;
          price: number;
          is_active?: boolean;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['ad_feature_plans']['Insert']>;
        Relationships: [];
      };

      subscription_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string | null;
          price: number;
          currency: string;
          billing_interval: BillingInterval;
          max_active_ads: number;
          featured_ads_quota: number;
          max_images_per_ad: number;
          has_priority_support: boolean;
          has_verified_badge: boolean;
          is_active: boolean;
          position: number;
          created_at: string;
          updated_at: string;
        };
        /** Écriture réservée aux administrateurs (RLS `subscription_plans_write_admin`). */
        Insert: {
          code: string;
          name: string;
          description?: string | null;
          price: number;
          billing_interval?: BillingInterval;
          max_active_ads: number;
          featured_ads_quota?: number;
          max_images_per_ad?: number;
          has_priority_support?: boolean;
          has_verified_badge?: boolean;
          is_active?: boolean;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['subscription_plans']['Insert']>;
        Relationships: [];
      };

      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          current_period_start: string;
          current_period_end: string;
          cancel_at_period_end: boolean;
          auto_renew: boolean;
          started_at: string;
          cancelled_at: string | null;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Créé côté serveur (service_role) après paiement abouti. */
        Insert: never;
        Update: { cancel_at_period_end?: boolean; auto_renew?: boolean };
        Relationships: [];
      };

      verification_requests: {
        Row: {
          id: string;
          user_id: string;
          full_legal_name: string;
          business_name: string | null;
          business_id_number: string | null;
          contact_phone: string;
          id_document_path: string;
          business_document_path: string | null;
          status: VerificationStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Créée via la RPC `request_verification()`. */
        Insert: {
          user_id: string;
          full_legal_name: string;
          business_name?: string | null;
          business_id_number?: string | null;
          contact_phone: string;
          id_document_path: string;
          business_document_path?: string | null;
        };
        /** Le demandeur annule ; le staff instruit via `review_verification()`. */
        Update: {
          status?: VerificationStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
        };
        Relationships: [];
      };

      auth_audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          action: AuditAction;
          target_user_id: string | null;
          details: Json;
          created_at: string;
        };
        /** Journal immuable : aucune écriture client. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      payments: {
        Row: {
          id: string;
          reference: string;
          user_id: string;
          purpose: PaymentPurpose;
          subscription_id: string | null;
          ad_id: string | null;
          provider: PaymentProvider;
          provider_reference: string | null;
          payer_phone: string | null;
          amount: number;
          currency: string;
          status: PaymentStatus;
          failure_reason: string | null;
          metadata: Json;
          paid_at: string | null;
          /** Numéro de facture, attribué à la confirmation seulement. */
          invoice_number: string | null;
          invoiced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Aucune écriture côté client : réservé au rôle service_role. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Journal des rappels reçus des opérateurs Mobile Money.
       *
       * Lecture réservée au personnel (RLS). Écriture réservée à
       * `apply_payment_callback()`, qui consigne **avant** d'appliquer — y
       * compris les rappels à signature invalide.
       */
      payment_events: {
        Row: {
          id: string;
          payment_id: string | null;
          provider: PaymentProvider;
          event_type: string;
          provider_reference: string | null;
          signature_valid: boolean;
          applied: boolean;
          payload: Json;
          received_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };

    Views: {
      /** Annonces pré-jointes (catégorie + image de couverture). */
      ads_list_view: {
        Row: {
          id: string;
          reference: string;
          title: string;
          slug: string;
          price: number | null;
          price_type: PriceType;
          condition: AdCondition | null;
          city: string;
          province: string | null;
          status: AdStatus;
          is_featured: boolean;
          views_count: number;
          favorites_count: number;
          published_at: string | null;
          created_at: string;
          seller_id: string;
          category_id: string;
          category_name: string | null;
          category_slug: string | null;
          cover_image_path: string | null;
          images_count: number;
        };
        Relationships: [];
      };
      conversations_view: {
        Row: {
          id: string;
          ad_id: string;
          buyer_id: string;
          seller_id: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_sender_id: string | null;
          messages_count: number;
          buyer_unread_count: number;
          seller_unread_count: number;
          buyer_archived: boolean;
          seller_archived: boolean;
          created_at: string;
          ad_title: string;
          ad_slug: string;
          ad_reference: string;
          ad_status: AdStatus;
          ad_cover_image_path: string | null;
          buyer_name: string;
          buyer_avatar_path: string | null;
          seller_name: string;
          seller_avatar_path: string | null;
        };
        Relationships: [];
      };
      platform_stats: {
        Row: {
          published_ads: number;
          active_users: number;
          covered_cities: number;
          ads_last_24h: number;
          refreshed_at: string;
        };
        Relationships: [];
      };
    };

    Functions: {
      search_ads: {
        Args: {
          p_query?: string | null;
          p_category_slug?: string | null;
          p_city?: string | null;
          p_province?: string | null;
          p_district?: string | null;
          p_min_price?: number | null;
          p_max_price?: number | null;
          p_condition?: AdCondition | null;
          p_price_type?: PriceType | null;
          p_seller_id?: string | null;
          p_featured_only?: boolean | null;
          /** Ancienneté maximale de publication, en jours. */
          p_max_age_days?: number | null;
          /** Filtre « autour de moi » : les trois valeurs vont ensemble. */
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_radius_km?: number | null;
          p_sort?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: {
          id: string;
          reference: string;
          title: string;
          slug: string;
          price: number | null;
          price_type: PriceType;
          city: string;
          district: string | null;
          is_featured: boolean;
          views_count: number;
          published_at: string | null;
          created_at: string;
          category_name: string | null;
          category_slug: string | null;
          cover_image_path: string | null;
          /** Renseignée uniquement quand un rayon est actif. */
          distance_km: number | null;
          total_count: number;
        }[];
      };
      /** Quartiers présents dans les annonces publiées, du plus fourni au moins fourni. */
      list_districts: {
        Args: { p_city?: string | null; p_limit?: number | null };
        Returns: { district: string; ads_count: number }[];
      };
      haversine_km: {
        Args: { p_lat1: number; p_lon1: number; p_lat2: number; p_lon2: number };
        Returns: number;
      };
      normalize_label: { Args: { p_value: string }; Returns: string | null };
      suggest_ads: {
        Args: { p_query: string; p_limit?: number };
        Returns: { title: string; slug: string; reference: string }[];
      };
      get_my_profile: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['users']['Row'];
      };
      toggle_favorite: { Args: { p_ad_id: string }; Returns: boolean };
      increment_ad_views: { Args: { p_ad_id: string }; Returns: undefined };
      get_or_create_conversation: { Args: { p_ad_id: string }; Returns: string };
      send_message: {
        Args: {
          p_conversation_id: string;
          p_body: string;
          /** `<sender_id>/<conversation_id>/<fichier>` — vérifié par trigger. */
          p_attachment_path?: string | null;
        };
        Returns: string;
      };
      is_blocked_between: { Args: { p_a: string; p_b: string }; Returns: boolean };
      block_user: { Args: { p_user_id: string; p_reason?: string | null }; Returns: undefined };
      unblock_user: { Args: { p_user_id: string }; Returns: undefined };
      list_blocked_users: {
        Args: Record<PropertyKey, never>;
        Returns: {
          user_id: string;
          full_name: string;
          avatar_path: string | null;
          reason: string | null;
          created_at: string;
        }[];
      };
      /** Recherche dans les fils de l'appelant : messages, annonce, correspondant. */
      search_conversations: {
        Args: { p_query: string; p_limit?: number | null };
        Returns: (Database['public']['Views']['conversations_view']['Row'] & {
          match_excerpt: string | null;
          match_type: 'message' | 'annonce' | 'correspondant';
        })[];
      };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: number };
      mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: number };
      unread_notifications_count: { Args: Record<PropertyKey, never>; Returns: number };
      ad_quota: { Args: { p_user_id: string }; Returns: number };
      can_review: {
        Args: { p_reviewer: string; p_reviewee: string; p_ad_id: string | null };
        Returns: boolean;
      };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_user_role: { Args: Record<PropertyKey, never>; Returns: UserRole };
      to_e164_gabon: { Args: { p_input: string }; Returns: string | null };
      request_verification: {
        Args: {
          p_full_legal_name: string;
          p_contact_phone: string;
          p_id_document_path: string;
          p_business_name?: string | null;
          p_business_id_number?: string | null;
          p_business_document_path?: string | null;
        };
        Returns: string;
      };
      review_verification: {
        Args: { p_request_id: string; p_approve: boolean; p_reason?: string | null };
        Returns: undefined;
      };
      admin_set_user_role: { Args: { p_user_id: string; p_role: UserRole }; Returns: undefined };
      admin_set_user_status: {
        Args: { p_user_id: string; p_status: AccountStatus; p_reason?: string | null };
        Returns: undefined;
      };
      admin_revoke_verification: {
        Args: { p_user_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      /** Indicateurs instantanés du tableau de bord. Réservé au staff. */
      admin_kpis: {
        Args: Record<PropertyKey, never>;
        Returns: {
          total_users: number;
          active_users: number;
          suspended_users: number;
          verified_users: number;
          staff_users: number;
          new_users_30d: number;
          total_ads: number;
          published_ads: number;
          pending_review_ads: number;
          expired_ads: number;
          new_ads_30d: number;
          open_reports: number;
          pending_verifications: number;
          active_subscriptions: number;
          messages_30d: number;
          revenue_30d: number;
          revenue_total: number;
        }[];
      };
      /** Série quotidienne sur 7 à 180 jours, jours creux compris. */
      admin_daily_stats: {
        Args: { p_days?: number | null };
        Returns: {
          day: string;
          new_users: number;
          new_ads: number;
          new_messages: number;
          revenue: number;
        }[];
      };
      admin_ad_distribution: {
        Args: { p_dimension?: 'category' | 'city' | 'status'; p_limit?: number | null };
        Returns: { label: string; total: number }[];
      };
      admin_moderate_ad: {
        Args: { p_ad_id: string; p_action: string; p_reason?: string | null };
        Returns: undefined;
      };
      /** Signale un contenu à faire relire par un modérateur (jamais un refus). */
      needs_manual_review: {
        Args: { p_title: string; p_description: string };
        Returns: boolean;
      };
      /** Crée le paiement en attente d'une mise en avant. Retourne son identifiant. */
      request_ad_feature: {
        Args: {
          p_ad_id: string;
          p_plan_code: string;
          p_provider?: PaymentProvider;
          p_payer_phone?: string | null;
        };
        Returns: string;
      };

      /**
       * Ouvre un paiement d'abonnement. Le tarif est relu en base : le client
       * n'envoie qu'un code d'offre, jamais un montant.
       */
      request_subscription: {
        Args: {
          p_plan_code: string;
          p_provider?: PaymentProvider;
          p_payer_phone?: string | null;
        };
        Returns: string;
      };

      /**
       * Confirme à la main un règlement hors ligne (virement, espèces).
       * Administrateur uniquement ; tracé dans `payment_events`. Retourne le
       * numéro de facture attribué.
       */
      admin_confirm_payment: {
        Args: { p_payment_id: string; p_note?: string | null };
        Returns: string;
      };

      /** Annule un paiement encore en attente. Réservé à son payeur. */
      cancel_payment: {
        Args: { p_payment_id: string };
        Returns: undefined;
      };

      /**
       * Applique un rappel d'opérateur. **Réservée à `service_role`** : le
       * navigateur ne doit jamais pouvoir déclarer qu'un paiement a abouti.
       * Idempotente ; `payment_id` nul signale une référence inconnue.
       */
      apply_payment_callback: {
        Args: {
          p_reference: string;
          p_provider: PaymentProvider;
          p_provider_reference: string | null;
          p_status: PaymentStatus;
          p_payload?: Json;
          p_failure_reason?: string | null;
          p_signature_valid?: boolean;
        };
        Returns: {
          payment_id: string | null;
          applied: boolean;
          resulting_status: PaymentStatus | null;
        }[];
      };

      /**
       * Médiane et quartiles des annonces comparables. Renvoie zéro ligne sous
       * cinq comparables : une médiane sur deux points n'informe pas.
       */
      suggest_price: {
        Args: {
          p_category_id: string;
          p_city?: string | null;
          p_condition?: AdCondition | null;
        };
        Returns: {
          scope: 'city' | 'province' | 'national';
          sample_size: number;
          median: number;
          p25: number;
          p75: number;
        }[];
      };

      /** Annonces ressemblantes dans la même catégorie. Suggère, ne fusionne rien. */
      find_duplicate_ads: {
        Args: { p_ad_id: string; p_threshold?: number; p_limit?: number };
        Returns: {
          id: string;
          reference: string;
          title: string;
          slug: string;
          price: number | null;
          city: string;
          status: AdStatus;
          seller_id: string;
          same_seller: boolean;
          title_score: number;
          created_at: string;
        }[];
      };

      /** Signaux de fraude d'une annonce, avec poids et justification. Personnel seulement. */
      ad_fraud_signals: {
        Args: { p_ad_id: string };
        Returns: { signal: string; weight: number; detail: string }[];
      };

      /** Score de fraude agrégé, borné à 100. Personnel seulement. */
      ad_fraud_score: {
        Args: { p_ad_id: string };
        Returns: number;
      };

      /** File de modération : annonces récentes au-dessus du seuil. Personnel seulement. */
      flagged_ads: {
        Args: { p_min_score?: number; p_limit?: number };
        Returns: {
          id: string;
          reference: string;
          title: string;
          slug: string;
          price: number | null;
          city: string;
          status: AdStatus;
          seller_id: string;
          seller_name: string;
          score: number;
          created_at: string;
        }[];
      };

      /** Recommandations par le contenu. Repli sur les annonces populaires. */
      recommend_ads: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          reference: string;
          title: string;
          slug: string;
          price: number | null;
          price_type: PriceType;
          city: string;
          is_featured: boolean;
          views_count: number;
          published_at: string | null;
          created_at: string;
          category_name: string | null;
          category_slug: string | null;
          cover_image_path: string | null;
          reason: 'populaire' | 'affinite';
        }[];
      };

      /** Facture d'un paiement abouti. La RLS de `payments` décide qui la voit. */
      get_invoice: {
        Args: { p_payment_id: string };
        Returns: {
          invoice_number: string | null;
          invoiced_at: string | null;
          reference: string;
          amount: number;
          currency: string;
          purpose: PaymentPurpose;
          provider: PaymentProvider;
          paid_at: string | null;
          payer_name: string | null;
          payer_city: string | null;
          designation: string;
        }[];
      };
    };

    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      ad_status: AdStatus;
      ad_condition: AdCondition;
      price_type: PriceType;
      notification_type: NotificationType;
      review_status: ReviewStatus;
      verification_status: VerificationStatus;
      audit_action: AuditAction;
      report_target_type: ReportTargetType;
      report_reason: ReportReason;
      report_status: ReportStatus;
      payment_provider: PaymentProvider;
      payment_status: PaymentStatus;
      payment_purpose: PaymentPurpose;
      subscription_status: SubscriptionStatus;
      billing_interval: BillingInterval;
    };

    CompositeTypes: Record<never, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
