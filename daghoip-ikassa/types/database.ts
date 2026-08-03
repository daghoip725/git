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

/**
 * Langue d'interface. Aligné sur l'enum PostgreSQL `app_language`.
 *
 * Ne concerne que l'interface : le contenu écrit par les gens n'est jamais
 * traduit.
 */
export type AppLanguage = 'fr' | 'en';

/**
 * Moyen par lequel un visiteur a joint le vendeur.
 *
 * Le canal est la seule chose que l'on retient d'un contact : ni qui, ni quand
 * précisément. Il sert à dire au vendeur par où on l'appelle, pas à profiler
 * qui l'appelle.
 */
export type ContactChannel = 'phone' | 'whatsapp' | 'message';

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
          /**
           * Langue d'interface. Hors du `grant select` public : une préférence
           * ne regarde personne d'autre, elle se lit par `get_my_profile()`.
           */
          language: AppLanguage;
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
          language?: AppLanguage;
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
          /**
           * Visiteurs distincts ayant demandé à joindre le vendeur, tous
           * canaux confondus, une fois par personne et par jour. Alimenté par
           * `record_ad_contact()` seul.
           */
          contacts_count: number;
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
       * Préférences de notification. L'absence de ligne vaut « valeurs par
       * défaut » : rien n'oblige un compte à en posséder une.
       */
      notification_settings: {
        Row: {
          user_id: string;
          email_messages: boolean;
          email_ad_status: boolean;
          email_reviews: boolean;
          email_payments: boolean;
          email_subscription: boolean;
          message_email_delay_minutes: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email_messages?: boolean;
          email_ad_status?: boolean;
          email_reviews?: boolean;
          email_payments?: boolean;
          email_subscription?: boolean;
          message_email_delay_minutes?: number;
        };
        Update: Omit<Database['public']['Tables']['notification_settings']['Insert'], 'user_id'>;
        Relationships: [];
      };

      /**
       * Recherches récentes d'un compte.
       *
       * **Strictement privé** : la RLS n'accorde aucune exception au personnel,
       * contrairement à toutes les autres tables. L'écriture passe par
       * `record_search()`, qui normalise et plafonne.
       */
      search_history: {
        Row: {
          id: string;
          user_id: string;
          query: string;
          query_key: string;
          filters: Json;
          results_count: number | null;
          created_at: string;
        };
        /** Aucun droit d'INSERT : passer par `record_search()`. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Annonces consultées par un compte. Même régime de confidentialité que
       * `search_history`. Distincte de `ads.views_count`, qui compte sans dire
       * qui a regardé.
       */
      ad_views: {
        Row: {
          user_id: string;
          ad_id: string;
          viewed_at: string;
          view_count: number;
        };
        /** Aucun droit d'INSERT : passer par `record_ad_view()`. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Empreintes de dédoublonnage des contacts.
       *
       * **Aucune identité n'y figure**, volontairement : ni compte, ni session,
       * ni adresse IP. Seule une empreinte `visiteur:annonce:jour` permet de ne
       * compter qu'une fois par visiteur et par jour, sans qu'on puisse
       * remonter au visiteur. Les lignes sont purgées au bout de sept jours.
       *
       * Fermée à `anon` comme à `authenticated` : elle n'a aucune politique
       * RLS, ce qui la rend inaccessible même au vendeur concerné. L'écriture
       * passe par `record_ad_contact()`.
       */
      ad_contacts: {
        Row: {
          id: string;
          ad_id: string;
          channel: ContactChannel;
          dedupe_key: string;
          created_at: string;
        };
        /** Aucun droit d'INSERT : passer par `record_ad_contact()`. */
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * Historique quotidien d'une annonce : vues, contacts, favoris.
       *
       * Alimentée par les compteurs, jamais par le client — un vendeur qui
       * pourrait écrire ici gonflerait ses propres chiffres. La lecture passe
       * par `ad_daily_series()` ou `seller_performance()`, qui filtrent sur le
       * propriétaire.
       */
      ad_daily_stats: {
        Row: {
          ad_id: string;
          day: string;
          views: number;
          contacts: number;
          favorites: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };

      /**
       * File d'envoi des e-mails. Aucune lecture ni écriture client : elle
       * contient des adresses. Seul `service_role` y touche.
       */
      email_outbox: {
        Row: {
          id: string;
          user_id: string;
          kind: NotificationType;
          payload: Json;
          dedupe_key: string | null;
          not_before: string;
          claimed_at: string | null;
          sent_at: string | null;
          attempts: number;
          last_error: string | null;
          created_at: string;
        };
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

      /**
       * Réclame un lot d'e-mails à expédier. **Réservée à `service_role`** :
       * elle renvoie des adresses e-mail.
       */
      claim_pending_emails: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          user_id: string;
          kind: NotificationType;
          payload: Json;
          email: string;
          full_name: string;
          attempts: number;
        }[];
      };

      /** Clôt un envoi. `p_error` nul vaut succès. Réservée à `service_role`. */
      mark_email_sent: {
        Args: { p_id: string; p_error?: string | null };
        Returns: undefined;
      };

      /** Préférences effectives d'un compte, valeurs par défaut comprises. */
      effective_notification_settings: {
        Args: { p_user_id: string };
        Returns: Database['public']['Tables']['notification_settings']['Row'];
      };

      /**
       * Signale un compte. Un signalement déjà déposé par la même personne
       * n'en crée pas un second — la fonction renvoie alors `null`.
       */
      report_user: {
        Args: { p_user_id: string; p_reason: ReportReason; p_details?: string | null };
        Returns: string | null;
      };

      /** File de triage groupée par cible. Personnel de modération uniquement. */
      moderation_queue: {
        Args: { p_limit?: number };
        Returns: {
          target_type: ReportTargetType;
          target_id: string;
          target_label: string;
          target_href: string;
          target_status: AccountStatus;
          report_count: number;
          reporter_count: number;
          reasons: string[];
          first_reported: string;
          last_reported: string;
        }[];
      };

      /** Éléments de contexte avant décision. Personnel de modération uniquement. */
      account_dossier: {
        Args: { p_user_id: string };
        Returns: {
          full_name: string;
          status: AccountStatus;
          role: UserRole;
          is_verified: boolean;
          created_at: string;
          ads_total: number;
          ads_published: number;
          reports_received: number;
          reporters_distinct: number;
          reports_filed: number;
          reports_filed_dismissed: number;
        }[];
      };

      /**
       * Sanctionne un compte et clôt les signalements qui le visent. Retourne
       * le nombre de dossiers clos. Jamais automatique.
       */
      block_account: {
        Args: { p_user_id: string; p_status: AccountStatus; p_reason?: string | null };
        Returns: number;
      };

      /** Clôt d'un geste tous les signalements ouverts visant une même cible. */
      resolve_reports_for_target: {
        Args: {
          p_target_type: ReportTargetType;
          p_target_id: string;
          p_status?: ReportStatus;
          p_note?: string | null;
        };
        Returns: number;
      };

      /** Enregistre une recherche. Sans effet pour un visiteur anonyme. */
      record_search: {
        Args: { p_query: string; p_filters?: Json; p_results?: number | null };
        Returns: undefined;
      };

      /** Enregistre une consultation. Sans effet pour un anonyme ou le vendeur. */
      record_ad_view: {
        Args: { p_ad_id: string };
        Returns: undefined;
      };

      /** Recherches récentes du compte courant. */
      recent_searches: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          query: string;
          filters: Json;
          results_count: number | null;
          created_at: string;
        }[];
      };

      /** Annonces consultées récemment, prêtes à l'affichage. */
      recent_ad_views: {
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
          viewed_at: string;
          view_count: number;
        }[];
      };

      /** Efface tout l'historique de recherche du compte courant. */
      clear_search_history: { Args: Record<never, never>; Returns: number };

      /** Efface tout l'historique de consultation du compte courant. */
      clear_ad_views: { Args: Record<never, never>; Returns: number };

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

      /* ---------------------------------------------------------------- */
      /*  Performances des annonces                                       */
      /* ---------------------------------------------------------------- */

      /**
       * Enregistre un contact et renvoie `true` s'il a été compté.
       *
       * Renvoie `false` — sans erreur — quand le contact ne compte pas :
       * annonce retirée, vendeur qui consulte sa propre annonce, ou visiteur
       * déjà compté le même jour. L'appelant n'a donc rien à traiter comme un
       * échec.
       *
       * `p_visitor` sert aux visiteurs non connectés : un identifiant de
       * session opaque, jamais une donnée personnelle. Il n'est pas stocké,
       * seulement haché avec l'annonce et le jour.
       */
      record_ad_contact: {
        Args: { p_ad_id: string; p_channel: ContactChannel; p_visitor?: string | null };
        Returns: boolean;
      };

      /** Performances d'une annonce. Réservée à son propriétaire. */
      ad_performance: {
        Args: { p_ad_id: string };
        Returns: {
          views: number;
          contacts: number;
          favorites: number;
          messages: number;
          /** Part des visiteurs ayant pris contact, en pourcentage. */
          contact_rate: number;
          /** Médiane des vues des annonces publiées de la même catégorie. */
          category_median_views: number;
          days_online: number;
          published_at: string | null;
        }[];
      };

      /**
       * Série quotidienne d'une annonce, sans trou : un jour sans activité vaut
       * zéro et non une ligne absente. La fenêtre est bornée à 7–180 jours.
       */
      ad_daily_series: {
        Args: { p_ad_id: string; p_days?: number };
        Returns: { day: string; views: number; contacts: number; favorites: number }[];
      };

      /** Synthèse du compte courant, toutes annonces confondues. */
      seller_performance: {
        Args: { p_days?: number };
        Returns: {
          ads_published: number;
          total_views: number;
          total_contacts: number;
          total_favorites: number;
          total_messages: number;
          period_views: number;
          period_contacts: number;
        }[];
      };

      /**
       * Anonymise définitivement le compte courant.
       *
       * Ne prend **aucun paramètre**, volontairement : il n'existe donc aucune
       * façon de l'appeler pour le compte de quelqu'un d'autre. Lève (P0001)
       * pour un compte administrateur, un compte déjà supprimé ou l'absence de
       * session.
       */
      delete_my_account: {
        Args: Record<never, never>;
        Returns: {
          ads_archived: number;
          images_removed: number;
          favorites_removed: number;
          notifications_removed: number;
          reports_detached: number;
        }[];
      };

      /** Classement des annonces du compte courant, trié par contacts. */
      seller_ad_ranking: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          title: string;
          slug: string;
          reference: string;
          status: AdStatus;
          views: number;
          contacts: number;
          favorites: number;
          contact_rate: number;
          published_at: string | null;
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
      contact_channel: ContactChannel;
      app_language: AppLanguage;
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
