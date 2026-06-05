export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          payload: Json | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          payload?: Json | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          payload: Json
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string
          payload?: Json
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          payload?: Json
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      caller_sessions: {
        Row: {
          caller_id: string
          calls_made: number
          created_at: string
          demos_booked: number
          ended_at: string | null
          id: string
          leads_interested: number
          started_at: string
        }
        Insert: {
          caller_id: string
          calls_made?: number
          created_at?: string
          demos_booked?: number
          ended_at?: string | null
          id?: string
          leads_interested?: number
          started_at?: string
        }
        Update: {
          caller_id?: string
          calls_made?: number
          created_at?: string
          demos_booked?: number
          ended_at?: string | null
          id?: string
          leads_interested?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caller_sessions_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "callers"
            referencedColumns: ["id"]
          },
        ]
      }
      callers: {
        Row: {
          bonus_per_sale: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          rate_per_call: number
        }
        Insert: {
          bonus_per_sale?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          rate_per_call?: number
        }
        Update: {
          bonus_per_sale?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          rate_per_call?: number
        }
        Relationships: []
      }
      campaign_runs: {
        Row: {
          campaign_id: string
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          started_at: string
          stats: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          stats?: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          stats?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_runs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          batch_cap: number
          call_after_hours: number
          cooldown_days: number
          created_at: string
          daily_cap: number
          id: string
          name: string
          product: string
          status: string
          template_text: string
          updated_at: string
          variables_used: Json | null
        }
        Insert: {
          audience_filter?: Json
          batch_cap?: number
          call_after_hours?: number
          cooldown_days?: number
          created_at?: string
          daily_cap?: number
          id?: string
          name: string
          product?: string
          status?: string
          template_text?: string
          updated_at?: string
          variables_used?: Json | null
        }
        Update: {
          audience_filter?: Json
          batch_cap?: number
          call_after_hours?: number
          cooldown_days?: number
          created_at?: string
          daily_cap?: number
          id?: string
          name?: string
          product?: string
          status?: string
          template_text?: string
          updated_at?: string
          variables_used?: Json | null
        }
        Relationships: []
      }
      finder_candidates: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          email: string | null
          has_phone: boolean | null
          has_website: boolean | null
          id: string
          last_fetched_at: string | null
          maps_url: string | null
          name: string
          outcome: string
          phone: string | null
          place_id: string
          rating: number | null
          reviews_count: number | null
          run_id: string
          types: string[] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          has_phone?: boolean | null
          has_website?: boolean | null
          id?: string
          last_fetched_at?: string | null
          maps_url?: string | null
          name: string
          outcome?: string
          phone?: string | null
          place_id: string
          rating?: number | null
          reviews_count?: number | null
          run_id: string
          types?: string[] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          has_phone?: boolean | null
          has_website?: boolean | null
          id?: string
          last_fetched_at?: string | null
          maps_url?: string | null
          name?: string
          outcome?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          reviews_count?: number | null
          run_id?: string
          types?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finder_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "finder_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      finder_runs: {
        Row: {
          batch_id: string | null
          batch_label: string | null
          city: string
          created_at: string
          id: string
          keywords: string[]
          max_candidates: number
          max_details: number
          max_pages: number
          min_rating: number | null
          min_reviews: number | null
          mode: string
          radius: number
          require_phone: boolean
          stats: Json
          status: string
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          batch_label?: string | null
          city: string
          created_at?: string
          id?: string
          keywords?: string[]
          max_candidates?: number
          max_details?: number
          max_pages?: number
          min_rating?: number | null
          min_reviews?: number | null
          mode?: string
          radius?: number
          require_phone?: boolean
          stats?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          batch_label?: string | null
          city?: string
          created_at?: string
          id?: string
          keywords?: string[]
          max_candidates?: number
          max_details?: number
          max_pages?: number
          min_rating?: number | null
          min_reviews?: number | null
          mode?: string
          radius?: number
          require_phone?: boolean
          stats?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_appointments: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          id: string
          lead_id: string
          notes: string | null
          scheduled_at: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_at: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_at?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          lead_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          lead_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          lead_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          lead_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          lead_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          best_contact_method: string | null
          call_after_at: string | null
          call_attempts: number
          call_outcome_last: string | null
          caller_id: string | null
          caller_name: string | null
          category: string | null
          created_at: string
          detected_niche: string | null
          email: string | null
          email_source: string | null
          estimated_value: string | null
          facebook_url: string | null
          follow_up_at: string | null
          has_booking: boolean | null
          has_contact_form: boolean | null
          has_emergency: boolean | null
          has_receptionist: boolean | null
          has_replied: boolean
          id: string
          instagram_url: string | null
          last_contact_method: string | null
          last_contacted_at: string | null
          last_inbound_at: string | null
          last_message_direction: string | null
          last_message_preview: string | null
          last_message_status: string | null
          last_outbound_at: string | null
          lead_tier: string | null
          maps_url: string | null
          name: string
          needs_call: boolean
          next_action_at: string | null
          niche_label: string | null
          notes: string | null
          opening_hours: string | null
          outreach_opt_out: boolean
          outreach_stage: string
          phone: string | null
          phone_e164: string | null
          pinned: boolean
          place_id: string | null
          potential_score: number | null
          product: string
          rating: number | null
          read_at: string | null
          reviews_count: number | null
          section: string
          status: string
          tags: string[] | null
          updated_at: string
          website: string | null
          website_quality: string | null
          why_good_lead: string | null
        }
        Insert: {
          address?: string | null
          best_contact_method?: string | null
          call_after_at?: string | null
          call_attempts?: number
          call_outcome_last?: string | null
          caller_id?: string | null
          caller_name?: string | null
          category?: string | null
          created_at?: string
          detected_niche?: string | null
          email?: string | null
          email_source?: string | null
          estimated_value?: string | null
          facebook_url?: string | null
          follow_up_at?: string | null
          has_booking?: boolean | null
          has_contact_form?: boolean | null
          has_emergency?: boolean | null
          has_receptionist?: boolean | null
          has_replied?: boolean
          id?: string
          instagram_url?: string | null
          last_contact_method?: string | null
          last_contacted_at?: string | null
          last_inbound_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          last_message_status?: string | null
          last_outbound_at?: string | null
          lead_tier?: string | null
          maps_url?: string | null
          name: string
          needs_call?: boolean
          next_action_at?: string | null
          niche_label?: string | null
          notes?: string | null
          opening_hours?: string | null
          outreach_opt_out?: boolean
          outreach_stage?: string
          phone?: string | null
          phone_e164?: string | null
          pinned?: boolean
          place_id?: string | null
          potential_score?: number | null
          product?: string
          rating?: number | null
          read_at?: string | null
          reviews_count?: number | null
          section?: string
          status?: string
          tags?: string[] | null
          updated_at?: string
          website?: string | null
          website_quality?: string | null
          why_good_lead?: string | null
        }
        Update: {
          address?: string | null
          best_contact_method?: string | null
          call_after_at?: string | null
          call_attempts?: number
          call_outcome_last?: string | null
          caller_id?: string | null
          caller_name?: string | null
          category?: string | null
          created_at?: string
          detected_niche?: string | null
          email?: string | null
          email_source?: string | null
          estimated_value?: string | null
          facebook_url?: string | null
          follow_up_at?: string | null
          has_booking?: boolean | null
          has_contact_form?: boolean | null
          has_emergency?: boolean | null
          has_receptionist?: boolean | null
          has_replied?: boolean
          id?: string
          instagram_url?: string | null
          last_contact_method?: string | null
          last_contacted_at?: string | null
          last_inbound_at?: string | null
          last_message_direction?: string | null
          last_message_preview?: string | null
          last_message_status?: string | null
          last_outbound_at?: string | null
          lead_tier?: string | null
          maps_url?: string | null
          name?: string
          needs_call?: boolean
          next_action_at?: string | null
          niche_label?: string | null
          notes?: string | null
          opening_hours?: string | null
          outreach_opt_out?: boolean
          outreach_stage?: string
          phone?: string | null
          phone_e164?: string | null
          pinned?: boolean
          place_id?: string | null
          potential_score?: number | null
          product?: string
          rating?: number | null
          read_at?: string | null
          reviews_count?: number | null
          section?: string
          status?: string
          tags?: string[] | null
          updated_at?: string
          website?: string | null
          website_quality?: string | null
          why_good_lead?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "callers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          body: string | null
          campaign_run_id: string | null
          channel: string
          created_at: string
          direction: string
          error_code: string | null
          error_message: string | null
          from_number: string | null
          id: string
          lead_id: string
          num_segments: number | null
          product: string
          provider: string
          provider_message_sid: string | null
          status: string
          to_number: string | null
        }
        Insert: {
          body?: string | null
          campaign_run_id?: string | null
          channel?: string
          created_at?: string
          direction: string
          error_code?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          lead_id: string
          num_segments?: number | null
          product?: string
          provider?: string
          provider_message_sid?: string | null
          status?: string
          to_number?: string | null
        }
        Update: {
          body?: string | null
          campaign_run_id?: string | null
          channel?: string
          created_at?: string
          direction?: string
          error_code?: string | null
          error_message?: string | null
          from_number?: string | null
          id?: string
          lead_id?: string
          num_segments?: number | null
          product?: string
          provider?: string
          provider_message_sid?: string | null
          status?: string
          to_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_locks: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          lock_type: string
          lock_value: string
          manually_unlocked: boolean
          method: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          lock_type: string
          lock_value: string
          manually_unlocked?: boolean
          method: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          lock_type?: string
          lock_value?: string
          manually_unlocked?: boolean
          method?: string
        }
        Relationships: []
      }
      place_cache: {
        Row: {
          address: string | null
          category: string | null
          email: string | null
          fetched_at: string
          maps_url: string | null
          name: string
          phone: string | null
          place_id: string
          rating: number | null
          reviews_count: number | null
          types: string[] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          email?: string | null
          fetched_at?: string
          maps_url?: string | null
          name: string
          phone?: string | null
          place_id: string
          rating?: number | null
          reviews_count?: number | null
          types?: string[] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          email?: string | null
          fetched_at?: string
          maps_url?: string | null
          name?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          reviews_count?: number | null
          types?: string[] | null
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
