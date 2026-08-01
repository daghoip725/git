/**
 * Typage de la base de données Supabase.
 *
 * Ce fichier est le miroir TypeScript de `supabase/schema.sql`. Il peut être
 * régénéré à tout moment avec la CLI Supabase :
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public > types/database.ts
 *
 * Toute modification du schéma SQL doit être répercutée ici (ou régénérée).
 */

export type ListingStatus =
  'draft' | 'pending_review' | 'published' | 'sold' | 'expired' | 'rejected' | 'archived';

export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts';

export type PriceType = 'fixed' | 'negotiable' | 'free' | 'on_request';

export type ReportReason =
  'spam' | 'fraud' | 'prohibited' | 'duplicate' | 'wrong_category' | 'offensive' | 'other';

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export type UserRole = 'user' | 'moderator' | 'admin';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          whatsapp: string | null;
          city: string | null;
          province: string | null;
          avatar_url: string | null;
          bio: string | null;
          is_professional: boolean;
          is_verified: boolean;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          whatsapp?: string | null;
          city?: string | null;
          province?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_professional?: boolean;
          is_verified?: boolean;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
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
          created_at: string;
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
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      listings: {
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
          condition: ListingCondition | null;
          city: string;
          province: string | null;
          district: string | null;
          contact_phone: string | null;
          contact_whatsapp: string | null;
          allow_messages: boolean;
          status: ListingStatus;
          is_featured: boolean;
          views_count: number;
          favorites_count: number;
          published_at: string | null;
          expires_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference?: string;
          seller_id: string;
          category_id: string;
          title: string;
          slug?: string;
          description: string;
          price?: number | null;
          price_type?: PriceType;
          currency?: string;
          condition?: ListingCondition | null;
          city: string;
          province?: string | null;
          district?: string | null;
          contact_phone?: string | null;
          contact_whatsapp?: string | null;
          allow_messages?: boolean;
          status?: ListingStatus;
          is_featured?: boolean;
          views_count?: number;
          favorites_count?: number;
          published_at?: string | null;
          expires_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['listings']['Insert']>;
        Relationships: [];
      };
      listing_images: {
        Row: {
          id: string;
          listing_id: string;
          storage_path: string;
          position: number;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          storage_path: string;
          position?: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['listing_images']['Insert']>;
        Relationships: [];
      };
      favorites: {
        Row: {
          user_id: string;
          listing_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          listing_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['favorites']['Insert']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          listing_id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          listing_id: string;
          reporter_id: string | null;
          reason: ReportReason;
          details: string | null;
          status: ReportStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          reporter_id?: string | null;
          reason: ReportReason;
          details?: string | null;
          status?: ReportStatus;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      increment_listing_views: {
        Args: { p_listing_id: string };
        Returns: undefined;
      };
      toggle_favorite: {
        Args: { p_listing_id: string };
        Returns: boolean;
      };
      get_my_profile: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      expire_listings: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      listing_status: ListingStatus;
      listing_condition: ListingCondition;
      price_type: PriceType;
      report_reason: ReportReason;
      report_status: ReportStatus;
      user_role: UserRole;
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
